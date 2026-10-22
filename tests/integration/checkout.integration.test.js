// End-to-end checks against the LOCAL Supabase stack (real Auth, PostgREST + RLS, Edge Functions
// in Deno) with a FAKE Razorpay API. Run with: npm run test:integration
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import {
  LOCAL, SHIPPING, admin, callFn, checkoutResult, cleanupProducts, localEnv, makeProduct, makeUser, paymentEvent,
  placeOrder, signedWebhook, startFakeRazorpay, uniquePaymentId,
} from './helpers.js'

let fake
before(async () => { fake = await startFakeRazorpay() })
after(async () => {
  await cleanupProducts()
  await fake?.close()
})

const orderRow = async (id) => (await admin().from('orders').select('*').eq('id', id).single()).data
const paymentRow = async (rzpOrderId) => (await admin().from('payments').select('*').eq('provider_order_id', rzpOrderId).single()).data

/** Places an order for a fresh user and returns everything a test needs. */
async function newOrder({ qty = 2, productOverrides = {}, user } = {}) {
  const u = user ?? (await makeUser('buyer'))
  const product = await makeProduct(productOverrides)
  const res = await placeOrder(u, [{ product_id: product.id, quantity: qty }])
  assert.equal(res.status, 201, res.text)
  return { user: u, product, res: res.json, rzpOrderId: res.json.payment.razorpay_order_id, orderId: res.json.order.id, total: res.json.order.total_paise }
}

describe('registration and profiles', () => {
  it('creates a profile row automatically when a user registers', async () => {
    const u = await makeUser('profile')
    const { data } = await admin().from('profiles').select('*').eq('id', u.id).single()
    assert.equal(data.full_name, 'Test profile')
  })

  it('rejects weak passwords at sign-up', async () => {
    const { url, anon } = localEnv()
    const c = createClient(url, anon, { auth: { persistSession: false } })
    const { error } = await c.auth.signUp({ email: `weak-${Date.now()}@noirroast.test`, password: 'short' })
    assert.ok(error, 'expected a weak-password error')
  })
})

describe('create-order', () => {
  it('prices the order from the database and returns a Razorpay session', async () => {
    const { res, product, total } = await newOrder({ qty: 3, productOverrides: { price_paise: 123400 } })
    assert.equal(total, 123400 * 3)
    assert.equal(res.order.subtotal_paise, 123400 * 3)
    assert.equal(res.payment.key_id, LOCAL.keyId)
    assert.equal(res.payment.amount_paise, total)
    assert.match(res.payment.razorpay_order_id, /^order_fake/)
    assert.ok(!JSON.stringify(res).includes(LOCAL.keySecret))
    // the fake provider saw exactly the server-computed amount, in paise
    const seen = JSON.parse(fake.requests.findLast((r) => r.method === 'POST').body)
    assert.equal(seen.amount, total)
    assert.equal(seen.currency, 'INR')
    assert.equal((await orderRow(res.order.id)).status, 'pending_payment')
    assert.equal((await paymentRow(res.payment.razorpay_order_id)).status, 'created')
    assert.ok(product)
  })

  it('ignores client-supplied prices and totals', async () => {
    const u = await makeUser('tamper')
    const p = await makeProduct({ price_paise: 70000 })
    const res = await callFn('create-order', {
      jwt: u.jwt,
      body: { items: [{ product_id: p.id, quantity: 1, price_paise: 1, unit_price_paise: 1 }], shipping: SHIPPING, total_paise: 1, subtotal_paise: 1, email: 'x@evil.test' },
    })
    assert.equal(res.status, 201, res.text)
    assert.equal(res.json.order.total_paise, 70000)
    const row = await orderRow(res.json.order.id)
    assert.equal(row.contact_email, u.email, 'email comes from the verified account, not the body')
  })

  it('requires a real signed-in user', async () => {
    const p = await makeProduct()
    const body = { items: [{ product_id: p.id, quantity: 1 }], shipping: SHIPPING }
    const { anon } = localEnv()
    assert.equal((await callFn('create-order', { body })).status, 401)
    assert.equal((await callFn('create-order', { jwt: anon, body })).status, 401, 'the anon key is not a user')
    assert.equal((await callFn('create-order', { jwt: 'not.a.jwt', body })).status, 401)
  })

  it('returns field-level validation errors (422) and creates no order', async () => {
    const u = await makeUser('invalid')
    const p = await makeProduct()
    const before = (await admin().from('orders').select('id', { count: 'exact', head: true }).eq('user_id', u.id)).count
    const res = await placeOrder(u, [{ product_id: p.id, quantity: 1 }], { ...SHIPPING, pincode: '12', state: 'Narnia' })
    assert.equal(res.status, 422)
    assert.ok(res.json.fields.pincode && res.json.fields.state)
    const after = (await admin().from('orders').select('id', { count: 'exact', head: true }).eq('user_id', u.id)).count
    assert.equal(after, before)
  })

  it('refuses unavailable products and over-stock requests', async () => {
    const u = await makeUser('stock')
    const inactive = await makeProduct({ is_active: false })
    const scarce = await makeProduct({ stock_quantity: 2 })
    assert.equal((await placeOrder(u, [{ product_id: inactive.id, quantity: 1 }])).json.error.code, 'product_unavailable')
    assert.equal((await placeOrder(u, [{ product_id: 'does-not-exist', quantity: 1 }])).json.error.code, 'product_unavailable')
    const over = await placeOrder(u, [{ product_id: scarce.id, quantity: 3 }])
    assert.equal(over.status, 409)
    assert.equal(over.json.error.code, 'out_of_stock')
    const { data } = await admin().from('products').select('stock_quantity').eq('id', scarce.id).single()
    assert.equal(data.stock_quantity, 2, 'a refused order does not consume stock')
  })

  it('NEVER oversells under concurrent checkouts (stock 1, two buyers at once)', async () => {
    const product = await makeProduct({ stock_quantity: 1 })
    const [a, b] = await Promise.all([makeUser('race-a'), makeUser('race-b')])
    const results = await Promise.all([a, b].map((u) => placeOrder(u, [{ product_id: product.id, quantity: 1 }])))
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409])
    const { data } = await admin().from('products').select('stock_quantity').eq('id', product.id).single()
    assert.equal(data.stock_quantity, 0)
    const { data: moves } = await admin().from('inventory_movements').select('delta').eq('product_id', product.id)
    assert.equal(moves.reduce((n, m) => n + m.delta, 0), -1)
  })

  it('answers a Razorpay outage with 502 and releases the reserved stock', async () => {
    const u = await makeUser('outage')
    const p = await makeProduct({ stock_quantity: 5 })
    fake.failNextRequests(1)
    const res = await placeOrder(u, [{ product_id: p.id, quantity: 2 }])
    assert.equal(res.status, 502)
    const { data } = await admin().from('products').select('stock_quantity').eq('id', p.id).single()
    assert.equal(data.stock_quantity, 5)
    const { data: orders } = await admin().from('orders').select('status').eq('user_id', u.id)
    assert.deepEqual(orders.map((o) => o.status), ['cancelled'])
  })

  it('resume re-opens the SAME Razorpay order and refuses other users', async () => {
    const o = await newOrder()
    const again = await callFn('create-order', { jwt: o.user.jwt, body: { resumeOrderId: o.orderId } })
    assert.equal(again.status, 200)
    assert.equal(again.json.payment.razorpay_order_id, o.rzpOrderId)
    const stranger = await makeUser('stranger')
    assert.equal((await callFn('create-order', { jwt: stranger.jwt, body: { resumeOrderId: o.orderId } })).status, 404)
  })
})

describe('verify-payment', () => {
  it('marks the order paid after a valid signature and a matching provider record', async () => {
    const o = await newOrder()
    const payId = uniquePaymentId()
    fake.setPayment({ id: payId, order_id: o.rzpOrderId, amount: o.total, status: 'captured' })
    const res = await callFn('verify-payment', { jwt: o.user.jwt, body: await checkoutResult(o.rzpOrderId, payId) })
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json.status, 'paid')
    assert.equal((await orderRow(o.orderId)).status, 'paid')
    assert.equal((await paymentRow(o.rzpOrderId)).status, 'captured')
  })

  it('is idempotent: replaying the same confirmation changes nothing', async () => {
    const o = await newOrder()
    const payId = uniquePaymentId()
    fake.setPayment({ id: payId, order_id: o.rzpOrderId, amount: o.total, status: 'captured' })
    const body = await checkoutResult(o.rzpOrderId, payId)
    await callFn('verify-payment', { jwt: o.user.jwt, body })
    const again = await callFn('verify-payment', { jwt: o.user.jwt, body })
    assert.equal(again.status, 200)
    const { data } = await admin().from('order_status_history').select('to_status').eq('order_id', o.orderId)
    assert.equal(data.filter((h) => h.to_status === 'paid').length, 1)
  })

  it('rejects a forged signature and leaves the order unpaid', async () => {
    const o = await newOrder()
    const payId = uniquePaymentId()
    fake.setPayment({ id: payId, order_id: o.rzpOrderId, amount: o.total, status: 'captured' })
    const res = await callFn('verify-payment', { jwt: o.user.jwt, body: await checkoutResult(o.rzpOrderId, payId, 'attacker-guess') })
    assert.equal(res.status, 400)
    assert.equal(res.json.error.code, 'invalid_signature')
    assert.equal((await orderRow(o.orderId)).status, 'pending_payment')
  })

  it('a "success" alone is not enough: provider says the payment is for a different amount', async () => {
    const o = await newOrder()
    const payId = uniquePaymentId()
    fake.setPayment({ id: payId, order_id: o.rzpOrderId, amount: 100, status: 'captured' })
    const res = await callFn('verify-payment', { jwt: o.user.jwt, body: await checkoutResult(o.rzpOrderId, payId) })
    assert.equal(res.status, 409)
    assert.equal((await orderRow(o.orderId)).status, 'pending_payment')
  })

  it('does not let one customer confirm (or probe) another customer\'s order', async () => {
    const o = await newOrder()
    const payId = uniquePaymentId()
    fake.setPayment({ id: payId, order_id: o.rzpOrderId, amount: o.total, status: 'captured' })
    const stranger = await makeUser('stranger')
    const res = await callFn('verify-payment', { jwt: stranger.jwt, body: await checkoutResult(o.rzpOrderId, payId) })
    assert.equal(res.status, 404)
    assert.equal((await orderRow(o.orderId)).status, 'pending_payment')
  })

  it('stays pending (202) when the provider is unreachable, and the webhook can still finish it', async () => {
    const o = await newOrder()
    const payId = uniquePaymentId()
    fake.setPayment({ id: payId, order_id: o.rzpOrderId, amount: o.total, status: 'captured' })
    fake.failNextRequests(1)
    const res = await callFn('verify-payment', { jwt: o.user.jwt, body: await checkoutResult(o.rzpOrderId, payId) })
    assert.equal(res.status, 202)
    assert.equal((await orderRow(o.orderId)).status, 'pending_payment')
    const hook = await signedWebhook(paymentEvent('payment.captured', { orderId: o.rzpOrderId, paymentId: payId, amount: o.total }))
    assert.equal(hook.status, 200)
    assert.equal((await orderRow(o.orderId)).status, 'paid')
  })

  it('an authorized-but-not-captured payment is still pending', async () => {
    const o = await newOrder()
    const payId = uniquePaymentId()
    fake.setPayment({ id: payId, order_id: o.rzpOrderId, amount: o.total, status: 'authorized' })
    const res = await callFn('verify-payment', { jwt: o.user.jwt, body: await checkoutResult(o.rzpOrderId, payId) })
    assert.equal(res.json.status, 'pending')
    assert.equal((await orderRow(o.orderId)).status, 'pending_payment')
    assert.equal((await paymentRow(o.rzpOrderId)).status, 'authorized')
  })
})

describe('razorpay-webhook', () => {
  it('rejects unsigned and wrongly-signed requests and changes nothing', async () => {
    const o = await newOrder()
    const payId = uniquePaymentId()
    const event = paymentEvent('payment.captured', { orderId: o.rzpOrderId, paymentId: payId, amount: o.total })
    assert.equal((await callFn('razorpay-webhook', { body: event })).status, 401)
    assert.equal((await signedWebhook(event, { secret: 'not-the-secret' })).status, 401)
    assert.equal((await orderRow(o.orderId)).status, 'pending_payment')
  })

  it('marks the order paid on payment.captured and ignores a replay of the same event id', async () => {
    const o = await newOrder()
    const payId = uniquePaymentId()
    const event = paymentEvent('payment.captured', { orderId: o.rzpOrderId, paymentId: payId, amount: o.total })
    const first = await signedWebhook(event, { eventId: `evt_dup_${payId}` })
    assert.equal(first.json.status, 'processed')
    assert.equal((await orderRow(o.orderId)).status, 'paid')
    const replay = await signedWebhook(event, { eventId: `evt_dup_${payId}` })
    assert.equal(replay.json.status, 'duplicate')
    const { data } = await admin().from('payment_events').select('event_id, outcome').eq('event_id', `evt_dup_${payId}`)
    assert.equal(data.length, 1)
    assert.ok(data[0].outcome)
  })

  it('a different event id for the same capture is also harmless (state machine is idempotent)', async () => {
    const o = await newOrder()
    const payId = uniquePaymentId()
    const event = paymentEvent('payment.captured', { orderId: o.rzpOrderId, paymentId: payId, amount: o.total })
    await signedWebhook(event)
    const second = await signedWebhook(event)
    assert.equal(second.json.result, 'already_applied')
    const { data } = await admin().from('order_status_history').select('to_status').eq('order_id', o.orderId)
    assert.equal(data.filter((h) => h.to_status === 'paid').length, 1)
  })

  it('handles out-of-order delivery: a late payment.failed cannot undo a captured payment', async () => {
    const o = await newOrder()
    const payId = uniquePaymentId()
    await signedWebhook(paymentEvent('payment.captured', { orderId: o.rzpOrderId, paymentId: payId, amount: o.total }))
    const late = await signedWebhook(paymentEvent('payment.failed', { orderId: o.rzpOrderId, paymentId: payId, amount: o.total, status: 'failed' }))
    assert.equal(late.json.result, 'ignored_out_of_order')
    assert.equal((await orderRow(o.orderId)).status, 'paid')
    assert.equal((await paymentRow(o.rzpOrderId)).status, 'captured')
  })

  it('a failed attempt keeps the order payable, and a later successful retry pays it', async () => {
    const o = await newOrder()
    const failedId = uniquePaymentId()
    await signedWebhook(paymentEvent('payment.failed', { orderId: o.rzpOrderId, paymentId: failedId, amount: o.total, status: 'failed', extra: { error_description: 'Card declined' } }))
    assert.equal((await orderRow(o.orderId)).status, 'pending_payment')
    assert.equal((await paymentRow(o.rzpOrderId)).failure_reason, 'Card declined')
    await signedWebhook(paymentEvent('payment.captured', { orderId: o.rzpOrderId, paymentId: uniquePaymentId(), amount: o.total }))
    assert.equal((await orderRow(o.orderId)).status, 'paid')
  })

  it('refuses a captured event whose amount does not match the order', async () => {
    const o = await newOrder()
    const res = await signedWebhook(paymentEvent('payment.captured', { orderId: o.rzpOrderId, paymentId: uniquePaymentId(), amount: 1 }))
    assert.equal(res.json.result, 'amount_mismatch')
    assert.equal((await orderRow(o.orderId)).status, 'pending_payment')
  })

  it('flags a refund when a SECOND payment is captured for an already-paid order', async () => {
    const o = await newOrder()
    await signedWebhook(paymentEvent('payment.captured', { orderId: o.rzpOrderId, paymentId: uniquePaymentId(), amount: o.total }))
    const dup = await signedWebhook(paymentEvent('payment.captured', { orderId: o.rzpOrderId, paymentId: uniquePaymentId(), amount: o.total }))
    assert.equal(dup.json.result, 'duplicate_capture_refund_required')
    assert.equal((await paymentRow(o.rzpOrderId)).refund_required, true)
  })

  it('refund.processed cancels a paid order and returns its stock', async () => {
    const o = await newOrder({ qty: 2, productOverrides: { stock_quantity: 10 } })
    const payId = uniquePaymentId()
    await signedWebhook(paymentEvent('payment.captured', { orderId: o.rzpOrderId, paymentId: payId, amount: o.total }))
    const refund = await signedWebhook({ event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_1', payment_id: payId, amount: o.total } } } })
    assert.equal(refund.json.status, 'processed')
    assert.equal((await orderRow(o.orderId)).status, 'cancelled')
    assert.equal((await paymentRow(o.rzpOrderId)).status, 'refunded')
    const { data } = await admin().from('products').select('stock_quantity').eq('id', o.product.id).single()
    assert.equal(data.stock_quantity, 10)
  })

  it('acknowledges events it does not act on', async () => {
    const res = await signedWebhook({ event: 'payment.dispute.created', payload: {} })
    assert.equal(res.status, 200)
    assert.equal(res.json.status, 'ignored')
  })
})

describe('row level security through the real API', () => {
  it('a customer sees only their own orders, items and payments', async () => {
    const a = await newOrder()
    const b = await newOrder()
    const own = await a.user.client.from('orders').select('id')
    assert.deepEqual(own.data.map((r) => r.id), [a.orderId])
    assert.equal((await a.user.client.from('orders').select('id').eq('id', b.orderId)).data.length, 0)
    assert.equal((await a.user.client.from('order_items').select('id').eq('order_id', b.orderId)).data.length, 0)
    assert.equal((await a.user.client.from('payments').select('id').eq('order_id', b.orderId)).data.length, 0)
    assert.equal((await a.user.client.from('order_status_history').select('id').eq('order_id', b.orderId)).data.length, 0)
  })

  it('a customer cannot write orders, payments, stock, prices, settings or roles', async () => {
    const o = await newOrder()
    const c = o.user.client
    const results = await Promise.all([
      c.from('orders').update({ total_paise: 1, status: 'paid' }).eq('id', o.orderId),
      c.from('orders').insert({ user_id: o.user.id, subtotal_paise: 1, shipping_paise: 0, tax_paise: 0, total_paise: 1, contact_email: 'a@b.co', ship_name: 'Al', ship_phone: '9876543210', ship_line1: '1 St', ship_city: 'C', ship_state: 'Goa', ship_pincode: '403001' }),
      c.from('payments').update({ status: 'captured' }).eq('order_id', o.orderId),
      c.from('products').update({ price_paise: 1 }).eq('id', o.product.id),
      c.from('store_settings').update({ value: '0' }).eq('key', 'shipping_flat_paise'),
      c.from('admin_users').insert({ user_id: o.user.id }),
    ])
    for (const r of results) assert.ok(r.error, 'expected every write to be rejected')
    assert.equal((await orderRow(o.orderId)).status, 'pending_payment')
    assert.equal((await orderRow(o.orderId)).total_paise, o.total)
  })

  it('privileged functions are not callable from the browser', async () => {
    const o = await newOrder()
    const c = o.user.client
    for (const [fn, args] of [
      ['create_order', { p_user_id: o.user.id, p_email: 'a@b.co', p_items: [], p_shipping: {} }],
      ['apply_payment_event', { p_provider_order_id: o.rzpOrderId, p_provider_payment_id: 'pay_x', p_new_status: 'captured', p_amount_paise: o.total }],
      ['release_expired_orders', {}],
    ]) {
      const { error } = await c.rpc(fn, args)
      assert.ok(error, `${fn} must be denied`)
      assert.match(error.message + (error.code ?? ''), /permission denied|42501/i, fn)
    }
    assert.equal((await orderRow(o.orderId)).status, 'pending_payment')
  })

  it('anonymous visitors can browse active products and nothing private', async () => {
    const { url, anon } = localEnv()
    const visitor = createClient(url, anon, { auth: { persistSession: false } })
    const hidden = await makeProduct({ is_active: false })
    const shown = await makeProduct()
    const products = await visitor.from('products').select('id')
    assert.ok(products.data.some((p) => p.id === shown.id))
    assert.ok(!products.data.some((p) => p.id === hidden.id))
    assert.ok((await visitor.from('orders').select('id')).error)
    assert.ok((await visitor.from('profiles').select('id')).error)
  })

  it('a customer can edit their own profile but not someone else\'s', async () => {
    const a = await makeUser('pa')
    const b = await makeUser('pb')
    const mine = await a.client.from('profiles').update({ full_name: 'New Name', phone: '9876543210' }).eq('id', a.id).select()
    assert.equal(mine.data.length, 1)
    const theirs = await a.client.from('profiles').update({ full_name: 'Hacked' }).eq('id', b.id).select()
    assert.equal(theirs.data.length, 0)
    assert.notEqual((await admin().from('profiles').select('full_name').eq('id', b.id).single()).data.full_name, 'Hacked')
  })
})

describe('administration through the real API', () => {
  it('only a database-granted admin can use admin RPCs; ordinary sign-ups cannot become admin', async () => {
    const o = await newOrder()
    await signedWebhook(paymentEvent('payment.captured', { orderId: o.rzpOrderId, paymentId: uniquePaymentId(), amount: o.total }))

    const denied = await o.user.client.rpc('admin_set_order_status', { p_order_id: o.orderId, p_to: 'processing' })
    assert.ok(denied.error)
    assert.match(denied.error.message, /forbidden/)
    assert.equal((await o.user.client.rpc('is_admin')).data, false)

    const boss = await makeUser('boss')
    assert.ok((await boss.client.from('admin_users').insert({ user_id: boss.id })).error, 'self-promotion is blocked')
    await admin().from('admin_users').insert({ user_id: boss.id, note: 'integration test' }) // provisioning = a trusted DB action
    assert.equal((await boss.client.rpc('is_admin')).data, true)

    assert.equal((await boss.client.from('orders').select('id').eq('id', o.orderId)).data.length, 1, 'admin can read any order')
    const ok = await boss.client.rpc('admin_set_order_status', { p_order_id: o.orderId, p_to: 'processing', p_note: 'packing' })
    assert.equal(ok.error, null)
    assert.equal((await orderRow(o.orderId)).status, 'processing')
    const skip = await boss.client.rpc('admin_set_order_status', { p_order_id: o.orderId, p_to: 'delivered' })
    assert.match(skip.error.message, /invalid_order_transition/)

    const upsert = await boss.client.rpc('admin_upsert_product', { p: { id: o.product.id, price_paise: 99999, price_status: 'confirmed' } })
    assert.equal(upsert.error, null)
    assert.equal((await admin().from('products').select('price_paise').eq('id', o.product.id).single()).data.price_paise, 99999)
    assert.equal((await orderRow(o.orderId)).total_paise, o.total, 'a price edit never rewrites an existing order')
  })
})
