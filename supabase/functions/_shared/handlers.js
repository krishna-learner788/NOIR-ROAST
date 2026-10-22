// Request handlers for the three payment-related Edge Functions.
//
// They take a standard Request and an injected `deps` object and return a standard Response, so
// the entrypoints in each function folder are just wiring (Deno.env + supabase-js) and every
// branch here can be unit-tested with fakes. No secret is read from the environment in this file.
//
//   deps.config       { keyId, keySecret, webhookSecret }
//   deps.authenticate (request) => Promise<{ id, email } | null>      verifies the caller's JWT
//   deps.db           { rpc, getOrder, getOrderPolicyFacts, getPaymentByProviderOrderId,
//                       getPaymentByProviderPaymentId, getOpenPaymentForOrder }   service-role data access
//   deps.razorpay     { createOrder, fetchPayment }
//   deps.now          () => Date
//   deps.log          (level, event, context) => void                  context must not contain PII
import { codeFromDbError, errorBody, errorStatus } from './errors.js'
import { evaluateCheckoutPolicy, verifyPaymentSignature, verifyWebhookSignature, hmacSha256Hex } from './razorpay.js'
import { isUuid, validateOrderItems, validateShipping } from './validation.js'

const MAX_BODY_CHARS = 20_000
const RZP_ID_RE = /^[A-Za-z0-9_]{5,64}$/

export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

const fail = (code, extra = {}) => json(errorStatus(code), { ...errorBody(code), ...extra })

async function readJson(request) {
  const text = await request.text()
  if (text.length > MAX_BODY_CHARS) return { error: 'bad_request' }
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? { value } : { error: 'bad_request' }
  } catch {
    return { error: 'bad_request' }
  }
}

const log = (deps, level, event, context = {}) => deps.log?.(level, event, context)

function paymentSession(deps, order, providerOrderId, amountPaise, user, shippingName, shippingPhone) {
  return {
    order: { id: order.id ?? order.order_id, order_number: order.order_number, total_paise: amountPaise },
    payment: {
      provider: 'razorpay',
      key_id: deps.config.keyId,
      razorpay_order_id: providerOrderId,
      amount_paise: amountPaise,
      currency: 'INR',
    },
    prefill: { name: shippingName ?? '', email: user.email ?? '', contact: shippingPhone ?? '' },
  }
}

// ---------------------------------------------------------------------------------------
// POST /create-order
//   { items: [{product_id, quantity}], shipping: {...} }   -> creates a NEW order
//   { resumeOrderId }                                       -> re-opens payment for an unpaid order
// The request contains no prices and none would be read: the database prices the order.
// ---------------------------------------------------------------------------------------
export async function handleCreateOrder(request, deps) {
  if (request.method !== 'POST') return fail('method_not_allowed')
  const user = await deps.authenticate(request)
  if (!user) return fail('unauthorized')
  const parsed = await readJson(request)
  if (parsed.error) return fail(parsed.error)
  const body = parsed.value

  if (body.resumeOrderId !== undefined) return resumePayment(deps, user, body.resumeOrderId)

  const items = validateOrderItems(body.items)
  const shipping = validateShipping(body.shipping)
  if (!items.ok || !shipping.ok) {
    return fail('validation_failed', { fields: shipping.ok ? {} : shipping.errors, items: items.ok ? undefined : items.error })
  }

  const created = await deps.db.rpc('create_order', {
    p_user_id: user.id, p_email: user.email, p_items: items.value, p_shipping: shipping.value,
  })
  if (created.error) {
    const code = codeFromDbError(created.error)
    if (code === 'internal_error') log(deps, 'error', 'create_order_failed', { dbCode: created.error.code })
    return fail(code, created.error.details ? { detail: created.error.details } : {})
  }
  const order = created.data

  // Refuse to take (even sandbox-looking) payment for placeholder data on a live key.
  const policy = evaluateCheckoutPolicy({
    keyId: deps.config.keyId,
    containsProvisional: order.contains_provisional,
    shippingStatus: order.shipping_status,
    taxStatus: order.tax_status,
  })
  if (!policy.allowed) {
    await deps.db.rpc('abort_unpaid_order', { p_order_id: order.order_id, p_note: `Checkout refused: ${policy.reason}` })
    log(deps, 'warn', 'checkout_refused', { reason: policy.reason, mode: policy.mode })
    return fail('checkout_not_permitted', { reason: policy.reason })
  }

  let rzp
  try {
    rzp = await deps.razorpay.createOrder({
      amountPaise: order.total_paise, receipt: order.order_number, notes: { order_id: order.order_id },
    })
  } catch (err) {
    await deps.db.rpc('abort_unpaid_order', { p_order_id: order.order_id, p_note: 'Payment provider unavailable' })
    log(deps, 'error', 'razorpay_create_order_failed', { status: err?.status })
    return fail('payment_provider_error')
  }

  const attached = await deps.db.rpc('attach_payment', {
    p_order_id: order.order_id, p_provider_order_id: rzp.id, p_amount_paise: order.total_paise,
  })
  if (attached.error) {
    await deps.db.rpc('abort_unpaid_order', { p_order_id: order.order_id, p_note: 'Could not record payment session' })
    log(deps, 'error', 'attach_payment_failed', { dbCode: attached.error.code })
    return fail(codeFromDbError(attached.error))
  }

  return json(201, {
    ...paymentSession(deps, { id: order.order_id, order_number: order.order_number }, rzp.id, order.total_paise, user,
      shipping.value.name, shipping.value.phone),
    order: {
      id: order.order_id, order_number: order.order_number, subtotal_paise: order.subtotal_paise,
      shipping_paise: order.shipping_paise, tax_paise: order.tax_paise, total_paise: order.total_paise,
      expires_at: order.expires_at,
    },
    notices: {
      contains_provisional: order.contains_provisional,
      shipping_status: order.shipping_status,
      tax_status: order.tax_status,
      payment_mode: policy.mode,
    },
  })
}

async function resumePayment(deps, user, orderId) {
  if (!isUuid(orderId)) return fail('bad_request')
  const order = await deps.db.getOrder(orderId)
  // Same answer for "does not exist" and "belongs to someone else": no existence oracle.
  if (!order || order.user_id !== user.id) return fail('order_not_found')
  if (order.status !== 'pending_payment') return fail('order_not_payable')
  if (order.reservation_expires_at && new Date(order.reservation_expires_at) <= deps.now()) return fail('order_expired')

  // Re-apply the same safety policy with the order's CURRENT catalogue/settings status, so
  // switching the key from test to live can never let placeholder data through via "resume".
  const facts = await deps.db.getOrderPolicyFacts(order.id)
  const policy = evaluateCheckoutPolicy({
    keyId: deps.config.keyId,
    containsProvisional: facts?.contains_provisional ?? true,
    shippingStatus: facts?.shipping_status,
    taxStatus: facts?.tax_status,
  })
  if (!policy.allowed) return fail('checkout_not_permitted', { reason: policy.reason })

  const existing = await deps.db.getOpenPaymentForOrder(order.id)
  let providerOrderId = existing?.provider_order_id
  if (!providerOrderId) {
    let rzp
    try {
      rzp = await deps.razorpay.createOrder({ amountPaise: order.total_paise, receipt: order.order_number, notes: { order_id: order.id } })
    } catch (err) {
      log(deps, 'error', 'razorpay_create_order_failed', { status: err?.status })
      return fail('payment_provider_error')
    }
    const attached = await deps.db.rpc('attach_payment', {
      p_order_id: order.id, p_provider_order_id: rzp.id, p_amount_paise: order.total_paise,
    })
    if (attached.error) return fail(codeFromDbError(attached.error))
    providerOrderId = rzp.id
  }
  return json(200, paymentSession(deps, order, providerOrderId, order.total_paise, user, order.ship_name, order.ship_phone))
}

// ---------------------------------------------------------------------------------------
// POST /verify-payment   { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Never trusts the browser: signature (HMAC with the key secret) + the provider's own record of
// the payment (status, amount, order) must agree before anything changes. The browser's
// "success" is only ever a hint that makes us look.
// ---------------------------------------------------------------------------------------
export async function handleVerifyPayment(request, deps) {
  if (request.method !== 'POST') return fail('method_not_allowed')
  const user = await deps.authenticate(request)
  if (!user) return fail('unauthorized')
  const parsed = await readJson(request)
  if (parsed.error) return fail(parsed.error)
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = parsed.value
  if (![orderId, paymentId].every((v) => typeof v === 'string' && RZP_ID_RE.test(v)) || typeof signature !== 'string' || signature.length > 200) {
    return fail('bad_request')
  }

  const payment = await deps.db.getPaymentByProviderOrderId(orderId)
  const order = payment ? await deps.db.getOrder(payment.order_id) : null
  if (!payment || !order || order.user_id !== user.id) return fail('order_not_found')

  const valid = await verifyPaymentSignature({ orderId, paymentId, signature, keySecret: deps.config.keySecret })
  if (!valid) {
    log(deps, 'warn', 'invalid_payment_signature', { paymentRow: payment.id })
    return fail('invalid_signature')
  }

  let remote
  try {
    remote = await deps.razorpay.fetchPayment(paymentId)
  } catch (err) {
    // Provider lookup failed: do not guess. The webhook is the authoritative second path.
    log(deps, 'warn', 'razorpay_fetch_payment_failed', { status: err?.status })
    return json(202, { status: 'pending', message: 'Payment received; confirmation is in progress.' })
  }
  if (remote?.order_id !== orderId || remote?.amount !== payment.amount_paise || remote?.currency !== 'INR') {
    log(deps, 'error', 'payment_mismatch', { paymentRow: payment.id })
    return fail('payment_mismatch')
  }

  const status = { captured: 'captured', authorized: 'authorized', failed: 'failed' }[remote.status]
  if (!status) return json(202, { status: 'pending' })

  const applied = await deps.db.rpc('apply_payment_event', {
    p_provider_order_id: orderId, p_provider_payment_id: paymentId, p_new_status: status,
    p_amount_paise: remote.amount, p_failure_reason: remote.error_description ?? null,
  })
  if (applied.error) {
    log(deps, 'error', 'apply_payment_event_failed', { dbCode: applied.error.code })
    return fail('internal_error')
  }
  const out = applied.data
  return json(200, {
    status: out.order_status === 'paid' ? 'paid' : status === 'failed' ? 'failed' : 'pending',
    order_id: out.order_id,
    order_status: out.order_status,
    payment_status: out.payment_status,
  })
}

// ---------------------------------------------------------------------------------------
// POST /razorpay-webhook   (Razorpay -> us; authenticated ONLY by X-Razorpay-Signature)
// ---------------------------------------------------------------------------------------
const EVENT_TO_STATUS = {
  'payment.authorized': 'authorized',
  'payment.captured': 'captured',
  'order.paid': 'captured',
  'payment.failed': 'failed',
  'refund.processed': 'refunded',
}

export async function handleWebhook(request, deps) {
  if (request.method !== 'POST') return fail('method_not_allowed')
  const rawBody = await request.text()
  if (rawBody.length > 200_000) return fail('bad_request')

  const ok = await verifyWebhookSignature({
    rawBody, signature: request.headers.get('x-razorpay-signature'), webhookSecret: deps.config.webhookSecret,
  })
  if (!ok) {
    log(deps, 'warn', 'invalid_webhook_signature')
    return json(401, errorBody('invalid_signature'))
  }

  let event
  try { event = JSON.parse(rawBody) } catch { return fail('bad_request') }
  const type = event?.event
  const mapped = EVENT_TO_STATUS[type]
  // Acknowledge (200) events we do not act on so Razorpay stops retrying them.
  if (!mapped) return json(200, { status: 'ignored', event: String(type).slice(0, 60) })

  const payment = event.payload?.payment?.entity
  const rzpOrder = event.payload?.order?.entity
  const refund = event.payload?.refund?.entity
  const paymentId = payment?.id ?? refund?.payment_id ?? null
  let providerOrderId = payment?.order_id ?? rzpOrder?.id ?? null
  if (!providerOrderId && paymentId) {
    providerOrderId = (await deps.db.getPaymentByProviderPaymentId(paymentId))?.provider_order_id ?? null
  }
  if (!providerOrderId) return json(200, { status: 'ignored', reason: 'no_order_reference' })

  // Razorpay sends a unique id per event; fall back to a body hash so replays still dedupe.
  const eventId = request.headers.get('x-razorpay-event-id') || `body:${await hmacSha256Hex('noir-webhook-dedupe', rawBody)}`

  const gate = await deps.db.rpc('record_payment_event', {
    p_event_id: eventId, p_event_type: type, p_provider_order_id: providerOrderId,
    p_provider_payment_id: paymentId, p_payload: event,
  })
  if (gate.error) {
    log(deps, 'error', 'record_payment_event_failed', { dbCode: gate.error.code })
    return fail('internal_error') // 500 -> Razorpay retries
  }
  if (gate.data === 'duplicate') return json(200, { status: 'duplicate' })

  const amount = payment?.amount ?? rzpOrder?.amount ?? null
  const applied = await deps.db.rpc('apply_payment_event', {
    p_provider_order_id: providerOrderId, p_provider_payment_id: paymentId, p_new_status: mapped,
    p_amount_paise: mapped === 'refunded' ? null : amount, // a partial refund carries a different amount
    p_failure_reason: payment?.error_description ?? null,
  })
  if (applied.error) {
    log(deps, 'error', 'apply_payment_event_failed', { dbCode: applied.error.code })
    return fail('internal_error') // outcome stays NULL, so the retry is reprocessed ('retry')
  }
  await deps.db.rpc('set_payment_event_outcome', { p_event_id: eventId, p_outcome: applied.data?.result ?? 'applied' })
  return json(200, { status: 'processed', result: applied.data?.result })
}
