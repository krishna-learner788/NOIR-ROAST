import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { handleCreateOrder, handleVerifyPayment, handleWebhook } from '../../supabase/functions/_shared/handlers.js'
import { hmacSha256Hex } from '../../supabase/functions/_shared/razorpay.js'

const KEY_SECRET = 'unit_key_secret'
const WEBHOOK_SECRET = 'unit_webhook_secret'
const USER = { id: 'a0000000-0000-0000-0000-000000000001', email: 'asha@example.com' }
const ORDER_ID = 'b1b1b1b1-0000-0000-0000-000000000001'

const SHIPPING = { name: 'Asha Rao', phone: '9876543210', line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' }
const ITEMS = [{ product_id: 'noir-reserve', quantity: 2 }]

/** Builds fake deps and records every call, so tests can assert what did (and did not) happen. */
function makeDeps(overrides = {}) {
  const calls = []
  const rpcResults = { ...(overrides.rpcResults ?? {}) }
  const deps = {
    calls,
    config: { keyId: 'rzp_test_unit', keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET, ...overrides.config },
    authenticate: async () => (overrides.user === undefined ? USER : overrides.user),
    now: () => new Date('2026-10-22T12:00:00Z'),
    log: () => {},
    db: {
      async rpc(name, args) {
        calls.push(['rpc', name, args])
        const r = rpcResults[name]
        return typeof r === 'function' ? r(args) : r ?? { data: null, error: null }
      },
      getOrder: async (id) => (calls.push(['getOrder', id]), overrides.order === undefined ? null : overrides.order),
      getOrderPolicyFacts: async () => overrides.facts ?? { contains_provisional: false, shipping_status: 'confirmed', tax_status: 'confirmed' },
      getPaymentByProviderOrderId: async (id) => (calls.push(['getPayment', id]), overrides.payment === undefined ? null : overrides.payment),
      getPaymentByProviderPaymentId: async (id) => (calls.push(['getPaymentByPid', id]), overrides.paymentByPid ?? null),
      getOpenPaymentForOrder: async () => overrides.openPayment ?? null,
    },
    razorpay: {
      async createOrder(args) {
        calls.push(['rzp.createOrder', args])
        if (overrides.rzpCreateError) throw Object.assign(new Error('boom'), { status: 500 })
        return { id: 'order_RZP1' }
      },
      async fetchPayment(id) {
        calls.push(['rzp.fetchPayment', id])
        if (overrides.rzpFetchError) throw Object.assign(new Error('boom'), { status: 500 })
        return overrides.remotePayment
      },
    },
  }
  return deps
}

const req = (body, { method = 'POST', headers = {} } = {}) =>
  new Request('http://fn.local/x', { method, headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
const bodyOf = (res) => res.json()
const rpcNames = (deps) => deps.calls.filter((c) => c[0] === 'rpc').map((c) => c[1])

const CREATED = {
  data: {
    order_id: ORDER_ID, order_number: 'NR-1001', status: 'pending_payment', subtotal_paise: 179800, shipping_paise: 0, tax_paise: 0,
    total_paise: 179800, expires_at: '2026-10-22T12:30:00Z', contains_provisional: true, shipping_status: 'placeholder', tax_status: 'placeholder',
  },
  error: null,
}

describe('create-order', () => {
  let deps
  beforeEach(() => { deps = makeDeps({ rpcResults: { create_order: CREATED, attach_payment: { data: 'p1', error: null } } }) })

  it('rejects non-POST and unauthenticated callers before touching the database', async () => {
    assert.equal((await handleCreateOrder(new Request('http://x', { method: 'GET' }), deps)).status, 405)
    const anon = makeDeps({ user: null })
    const res = await handleCreateOrder(req({ items: ITEMS, shipping: SHIPPING }), anon)
    assert.equal(res.status, 401)
    assert.deepEqual(anon.calls, [])
  })

  it('rejects malformed JSON and oversized bodies', async () => {
    assert.equal((await handleCreateOrder(req('{nope'), deps)).status, 400)
    assert.equal((await handleCreateOrder(req('[1,2]'), deps)).status, 400)
    assert.equal((await handleCreateOrder(req({ x: 'y'.repeat(25_000) }), deps)).status, 400)
    assert.deepEqual(deps.calls, [])
  })

  it('returns per-field validation errors and creates nothing', async () => {
    const res = await handleCreateOrder(req({ items: ITEMS, shipping: { ...SHIPPING, pincode: '12' } }), deps)
    assert.equal(res.status, 422)
    const body = await bodyOf(res)
    assert.equal(body.error.code, 'validation_failed')
    assert.ok(body.fields.pincode)
    assert.deepEqual(rpcNames(deps), [])
  })

  it('sends only ids and quantities to the database, never client prices, and takes the email from the verified user', async () => {
    await handleCreateOrder(req({
      items: [{ product_id: 'noir-reserve', quantity: 2, price_paise: 1, unit_price_paise: 1 }],
      shipping: SHIPPING, email: 'attacker@evil.test', total_paise: 1, userId: 'someone-else',
    }), deps)
    const [, , args] = deps.calls.find((c) => c[1] === 'create_order')
    assert.deepEqual(args.p_items, [{ product_id: 'noir-reserve', quantity: 2 }])
    assert.equal(args.p_email, USER.email)
    assert.equal(args.p_user_id, USER.id)
  })

  it('creates the Razorpay order from the DATABASE total and returns a payment session without any secret', async () => {
    const res = await handleCreateOrder(req({ items: ITEMS, shipping: SHIPPING }), deps)
    assert.equal(res.status, 201)
    const rzpCall = deps.calls.find((c) => c[0] === 'rzp.createOrder')[1]
    assert.equal(rzpCall.amountPaise, 179800)
    assert.equal(rzpCall.receipt, 'NR-1001')
    const text = JSON.stringify(await bodyOf(res))
    assert.ok(!text.includes(KEY_SECRET) && !text.includes(WEBHOOK_SECRET))
    const body = JSON.parse(text)
    assert.equal(body.payment.key_id, 'rzp_test_unit')
    assert.equal(body.payment.razorpay_order_id, 'order_RZP1')
    assert.equal(body.payment.amount_paise, 179800)
    assert.equal(body.notices.payment_mode, 'test')
    assert.equal(body.notices.contains_provisional, true)
    assert.deepEqual(rpcNames(deps), ['create_order', 'attach_payment'])
  })

  it('maps database errors to the right HTTP status without leaking internals', async () => {
    const cases = [
      ['out_of_stock', 409], ['product_unavailable', 409], ['too_many_pending_orders', 429],
      ['invalid_quantity', 422], ['duplicate_item', 422], ['order_too_large', 422],
    ]
    for (const [message, status] of cases) {
      const d = makeDeps({ rpcResults: { create_order: { data: null, error: { message, code: 'P0001', details: 'noir-reserve' } } } })
      const res = await handleCreateOrder(req({ items: ITEMS, shipping: SHIPPING }), d)
      assert.equal(res.status, status, message)
      assert.equal((await bodyOf(res)).error.code, message)
    }
    const d = makeDeps({ rpcResults: { create_order: { data: null, error: { message: 'relation "orders" does not exist: SELECT secret…', code: '42P01' } } } })
    const res = await handleCreateOrder(req({ items: ITEMS, shipping: SHIPPING }), d)
    assert.equal(res.status, 500)
    assert.ok(!JSON.stringify(await bodyOf(res)).includes('relation'))
  })

  it('REFUSES a live key while data is provisional: cancels the order, never calls Razorpay', async () => {
    const live = makeDeps({ config: { keyId: 'rzp_live_unit' }, rpcResults: { create_order: CREATED, abort_unpaid_order: { data: null, error: null } } })
    const res = await handleCreateOrder(req({ items: ITEMS, shipping: SHIPPING }), live)
    assert.equal(res.status, 403)
    assert.equal((await bodyOf(res)).reason, 'provisional_catalogue_data')
    assert.ok(!live.calls.some((c) => c[0] === 'rzp.createOrder'))
    assert.deepEqual(rpcNames(live), ['create_order', 'abort_unpaid_order'])
  })

  it('allows a live key only once everything is confirmed', async () => {
    const confirmed = { ...CREATED, data: { ...CREATED.data, contains_provisional: false, shipping_status: 'confirmed', tax_status: 'confirmed' } }
    const live = makeDeps({ config: { keyId: 'rzp_live_unit' }, rpcResults: { create_order: confirmed, attach_payment: { data: 'p', error: null } } })
    assert.equal((await handleCreateOrder(req({ items: ITEMS, shipping: SHIPPING }), live)).status, 201)
  })

  it('releases the reservation when Razorpay is unavailable', async () => {
    const d = makeDeps({ rzpCreateError: true, rpcResults: { create_order: CREATED, abort_unpaid_order: { data: null, error: null } } })
    const res = await handleCreateOrder(req({ items: ITEMS, shipping: SHIPPING }), d)
    assert.equal(res.status, 502)
    assert.deepEqual(rpcNames(d), ['create_order', 'abort_unpaid_order'])
  })

  it('releases the reservation when the payment session cannot be recorded', async () => {
    const d = makeDeps({ rpcResults: { create_order: CREATED, attach_payment: { data: null, error: { message: 'amount_mismatch', code: 'P0001' } }, abort_unpaid_order: { data: null, error: null } } })
    const res = await handleCreateOrder(req({ items: ITEMS, shipping: SHIPPING }), d)
    assert.equal(res.status, 409)
    assert.deepEqual(rpcNames(d), ['create_order', 'attach_payment', 'abort_unpaid_order'])
  })
})

describe('create-order: resume payment', () => {
  const pending = { id: ORDER_ID, user_id: USER.id, status: 'pending_payment', total_paise: 179800, order_number: 'NR-1001', reservation_expires_at: '2026-10-22T12:30:00Z', ship_name: 'Asha Rao', ship_phone: '9876543210' }

  it('answers "not found" for missing orders AND for other users\' orders (no existence oracle)', async () => {
    const missing = await handleCreateOrder(req({ resumeOrderId: ORDER_ID }), makeDeps({ order: null }))
    const foreign = await handleCreateOrder(req({ resumeOrderId: ORDER_ID }), makeDeps({ order: { ...pending, user_id: 'someone-else' } }))
    assert.equal(missing.status, 404)
    assert.equal(foreign.status, 404)
    assert.deepEqual(await bodyOf(missing), await bodyOf(foreign))
  })

  it('rejects non-UUIDs, paid, and expired orders', async () => {
    assert.equal((await handleCreateOrder(req({ resumeOrderId: 'x' }), makeDeps())).status, 400)
    assert.equal((await handleCreateOrder(req({ resumeOrderId: ORDER_ID }), makeDeps({ order: { ...pending, status: 'paid' } }))).status, 409)
    assert.equal((await handleCreateOrder(req({ resumeOrderId: ORDER_ID }), makeDeps({ order: { ...pending, reservation_expires_at: '2026-10-22T11:00:00Z' } }))).status, 409)
  })

  it('reuses the open Razorpay order instead of creating a second one (no duplicate charge path)', async () => {
    const d = makeDeps({ order: pending, openPayment: { provider_order_id: 'order_EXISTING' } })
    const res = await handleCreateOrder(req({ resumeOrderId: ORDER_ID }), d)
    assert.equal(res.status, 200)
    assert.equal((await bodyOf(res)).payment.razorpay_order_id, 'order_EXISTING')
    assert.ok(!d.calls.some((c) => c[0] === 'rzp.createOrder'))
  })

  it('creates and records a new Razorpay order only when none is open', async () => {
    const d = makeDeps({ order: pending, rpcResults: { attach_payment: { data: 'p', error: null } } })
    const res = await handleCreateOrder(req({ resumeOrderId: ORDER_ID }), d)
    assert.equal(res.status, 200)
    assert.equal((await bodyOf(res)).payment.razorpay_order_id, 'order_RZP1')
    assert.deepEqual(rpcNames(d), ['attach_payment'])
  })

  it('re-applies the live-key safety policy when resuming', async () => {
    const d = makeDeps({ config: { keyId: 'rzp_live_unit' }, order: pending, facts: { contains_provisional: true, shipping_status: 'placeholder', tax_status: 'placeholder' } })
    assert.equal((await handleCreateOrder(req({ resumeOrderId: ORDER_ID }), d)).status, 403)
  })
})

// ---------------------------------------------------------------------------------------
describe('verify-payment', () => {
  const RZP_ORDER = 'order_RZP1'
  const PAY = 'pay_ABC123'
  const payment = { id: 'pay-row', order_id: ORDER_ID, status: 'created', amount_paise: 179800, provider_order_id: RZP_ORDER }
  const order = { id: ORDER_ID, user_id: USER.id }
  const sign = (o = RZP_ORDER, p = PAY, secret = KEY_SECRET) => hmacSha256Hex(secret, `${o}|${p}`)
  const goodBody = async () => ({ razorpay_order_id: RZP_ORDER, razorpay_payment_id: PAY, razorpay_signature: await sign() })
  const captured = { id: PAY, order_id: RZP_ORDER, amount: 179800, currency: 'INR', status: 'captured' }
  const applied = (order_status = 'paid') => ({ data: { order_id: ORDER_ID, order_status, payment_status: 'captured', result: 'applied' }, error: null })

  it('requires a signed-in user and a well-formed body', async () => {
    assert.equal((await handleVerifyPayment(req(await goodBody()), makeDeps({ user: null }))).status, 401)
    assert.equal((await handleVerifyPayment(req({ razorpay_order_id: 'x' }), makeDeps())).status, 400)
    assert.equal((await handleVerifyPayment(req({ ...(await goodBody()), razorpay_order_id: 'bad id!' }), makeDeps())).status, 400)
  })

  it('marks the order paid only after signature AND provider confirmation agree', async () => {
    const d = makeDeps({ payment, order, remotePayment: captured, rpcResults: { apply_payment_event: applied() } })
    const res = await handleVerifyPayment(req(await goodBody()), d)
    assert.equal(res.status, 200)
    assert.equal((await bodyOf(res)).status, 'paid')
    const [, , args] = d.calls.find((c) => c[1] === 'apply_payment_event')
    assert.equal(args.p_new_status, 'captured')
    assert.equal(args.p_amount_paise, 179800)
  })

  it('a bad signature changes nothing and never reaches the provider or the database', async () => {
    const d = makeDeps({ payment, order, remotePayment: captured })
    const res = await handleVerifyPayment(req({ ...(await goodBody()), razorpay_signature: await sign(RZP_ORDER, PAY, 'attacker-secret') }), d)
    assert.equal(res.status, 400)
    assert.equal((await bodyOf(res)).error.code, 'invalid_signature')
    assert.ok(!d.calls.some((c) => c[0] === 'rzp.fetchPayment'))
    assert.deepEqual(rpcNames(d), [])
  })

  it('a client "success" with a forged payment id for ANOTHER order is rejected (signature binds both ids)', async () => {
    const d = makeDeps({ payment, order })
    const sig = await sign('order_SOMEONE_ELSE', PAY)
    const res = await handleVerifyPayment(req({ razorpay_order_id: RZP_ORDER, razorpay_payment_id: PAY, razorpay_signature: sig }), d)
    assert.equal(res.status, 400)
    assert.deepEqual(rpcNames(d), [])
  })

  it('does not reveal whether an order exists or who owns it', async () => {
    const none = await handleVerifyPayment(req(await goodBody()), makeDeps({ payment: null }))
    const foreign = await handleVerifyPayment(req(await goodBody()), makeDeps({ payment, order: { ...order, user_id: 'other' } }))
    assert.equal(none.status, 404)
    assert.equal(foreign.status, 404)
    assert.deepEqual(await bodyOf(none), await bodyOf(foreign))
  })

  it('refuses a payment whose provider-side amount, order or currency differ from ours', async () => {
    for (const remote of [{ ...captured, amount: 100 }, { ...captured, order_id: 'order_OTHER' }, { ...captured, currency: 'USD' }]) {
      const d = makeDeps({ payment, order, remotePayment: remote })
      const res = await handleVerifyPayment(req(await goodBody()), d)
      assert.equal(res.status, 409)
      assert.deepEqual(rpcNames(d), [])
    }
  })

  it('answers "pending" (202) and does NOT guess when the provider cannot be reached', async () => {
    const d = makeDeps({ payment, order, rzpFetchError: true })
    const res = await handleVerifyPayment(req(await goodBody()), d)
    assert.equal(res.status, 202)
    assert.equal((await bodyOf(res)).status, 'pending')
    assert.deepEqual(rpcNames(d), [])
  })

  it('treats "authorized" as pending, "failed" as failed, unknown states as pending', async () => {
    const run = async (status, orderStatus = 'pending_payment') => {
      const d = makeDeps({ payment, order, remotePayment: { ...captured, status }, rpcResults: { apply_payment_event: applied(orderStatus) } })
      const res = await handleVerifyPayment(req(await goodBody()), d)
      return { code: res.status, body: await bodyOf(res), calls: rpcNames(d) }
    }
    assert.equal((await run('authorized')).body.status, 'pending')
    assert.equal((await run('failed')).body.status, 'failed')
    const created = await run('created')
    assert.equal(created.body.status, 'pending')
    assert.deepEqual(created.calls, [])
  })
})

// ---------------------------------------------------------------------------------------
describe('razorpay-webhook', () => {
  const event = (type, extra = {}) => ({
    event: type,
    payload: { payment: { entity: { id: 'pay_W1', order_id: 'order_RZP1', amount: 179800, currency: 'INR', status: 'captured', ...extra } } },
  })
  async function hook(body, deps, { signature, eventId = 'evt_1', secret = WEBHOOK_SECRET } = {}) {
    const raw = typeof body === 'string' ? body : JSON.stringify(body)
    const sig = signature === undefined ? await hmacSha256Hex(secret, raw) : signature
    const headers = { 'x-razorpay-event-id': eventId }
    if (sig) headers['x-razorpay-signature'] = sig
    return handleWebhook(new Request('http://fn.local/hook', { method: 'POST', headers, body: raw }), deps)
  }
  const gate = (v) => ({ data: v, error: null })
  const appliedOk = { data: { result: 'applied', order_status: 'paid', payment_status: 'captured' }, error: null }
  const rpcOk = (record = 'new') => ({ record_payment_event: gate(record), apply_payment_event: appliedOk, set_payment_event_outcome: gate(null) })

  it('rejects a missing, wrong, or body-mismatched signature WITHOUT touching the database', async () => {
    for (const opts of [{ signature: null }, { signature: 'deadbeef' }, { secret: 'wrong' }]) {
      const d = makeDeps({ rpcResults: rpcOk() })
      const res = await hook(event('payment.captured'), d, opts)
      assert.equal(res.status, 401)
      assert.deepEqual(d.calls, [])
    }
    const d = makeDeps({ rpcResults: rpcOk() })
    const signed = await hmacSha256Hex(WEBHOOK_SECRET, JSON.stringify(event('payment.captured')))
    const tampered = JSON.stringify(event('payment.captured', { amount: 1 }))
    assert.equal((await hook(tampered, d, { signature: signed })).status, 401)
  })

  it('processes payment.captured through the single state-machine function and records the outcome', async () => {
    const d = makeDeps({ rpcResults: rpcOk() })
    const res = await hook(event('payment.captured'), d)
    assert.equal(res.status, 200)
    assert.equal((await bodyOf(res)).status, 'processed')
    assert.deepEqual(rpcNames(d), ['record_payment_event', 'apply_payment_event', 'set_payment_event_outcome'])
    const [, , args] = d.calls.find((c) => c[1] === 'apply_payment_event')
    assert.deepEqual([args.p_provider_order_id, args.p_provider_payment_id, args.p_new_status, args.p_amount_paise], ['order_RZP1', 'pay_W1', 'captured', 179800])
  })

  it('acknowledges duplicates without re-applying them', async () => {
    const d = makeDeps({ rpcResults: rpcOk('duplicate') })
    const res = await hook(event('payment.captured'), d)
    assert.equal(res.status, 200)
    assert.equal((await bodyOf(res)).status, 'duplicate')
    assert.deepEqual(rpcNames(d), ['record_payment_event'])
  })

  it('re-processes an event whose earlier attempt crashed (gate says "retry")', async () => {
    const d = makeDeps({ rpcResults: rpcOk('retry') })
    assert.equal((await bodyOf(await hook(event('payment.captured'), d))).status, 'processed')
  })

  it('returns 500 (so Razorpay retries) when applying fails, and does NOT mark the event complete', async () => {
    const d = makeDeps({ rpcResults: { ...rpcOk(), apply_payment_event: { data: null, error: { message: 'deadlock', code: '40P01' } } } })
    const res = await hook(event('payment.captured'), d)
    assert.equal(res.status, 500)
    assert.ok(!rpcNames(d).includes('set_payment_event_outcome'))
  })

  it('maps each supported event to a payment status', async () => {
    const mapping = [['payment.authorized', 'authorized'], ['payment.captured', 'captured'], ['order.paid', 'captured'], ['payment.failed', 'failed']]
    for (const [type, status] of mapping) {
      const d = makeDeps({ rpcResults: rpcOk() })
      await hook(event(type), d)
      assert.equal(d.calls.find((c) => c[1] === 'apply_payment_event')[2].p_new_status, status, type)
    }
  })

  it('passes the failure reason for payment.failed and handles order.paid payloads', async () => {
    const d = makeDeps({ rpcResults: rpcOk() })
    await hook(event('payment.failed', { status: 'failed', error_description: 'Card declined' }), d)
    assert.equal(d.calls.find((c) => c[1] === 'apply_payment_event')[2].p_failure_reason, 'Card declined')
    const d2 = makeDeps({ rpcResults: rpcOk() })
    await hook({ event: 'order.paid', payload: { order: { entity: { id: 'order_RZP1', amount: 179800 } }, payment: { entity: { id: 'pay_W1', order_id: 'order_RZP1', amount: 179800 } } } }, d2)
    assert.equal(d2.calls.find((c) => c[1] === 'apply_payment_event')[2].p_new_status, 'captured')
  })

  it('resolves a refund to its order via the payment id and does not amount-check partial refunds', async () => {
    const d = makeDeps({ paymentByPid: { provider_order_id: 'order_RZP1' }, rpcResults: rpcOk() })
    await hook({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_W1', amount: 5000 } } } }, d)
    const args = d.calls.find((c) => c[1] === 'apply_payment_event')[2]
    assert.deepEqual([args.p_provider_order_id, args.p_new_status, args.p_amount_paise], ['order_RZP1', 'refunded', null])
  })

  it('acknowledges (200) events it does not act on, so Razorpay stops retrying', async () => {
    for (const body of [{ event: 'payment.dispute.created', payload: {} }, { event: 'payment.captured', payload: {} }]) {
      const d = makeDeps({ rpcResults: rpcOk() })
      const res = await hook(body, d)
      assert.equal(res.status, 200)
      assert.equal((await bodyOf(res)).status, 'ignored')
      assert.deepEqual(d.calls.filter((c) => c[0] === 'rpc'), [])
    }
  })

  it('still de-duplicates when Razorpay omits the event-id header (body hash fallback)', async () => {
    const ids = []
    const d = makeDeps({ rpcResults: { ...rpcOk(), record_payment_event: (a) => (ids.push(a.p_event_id), gate('new')) } })
    const raw = JSON.stringify(event('payment.captured'))
    for (let i = 0; i < 2; i++) {
      await handleWebhook(new Request('http://x', { method: 'POST', headers: { 'x-razorpay-signature': await hmacSha256Hex(WEBHOOK_SECRET, raw) }, body: raw }), d)
    }
    assert.equal(ids.length, 2)
    assert.equal(ids[0], ids[1])
    assert.match(ids[0], /^body:[0-9a-f]{64}$/)
  })

  it('rejects non-POST', async () => {
    assert.equal((await handleWebhook(new Request('http://x', { method: 'GET' }), makeDeps())).status, 405)
  })
})
