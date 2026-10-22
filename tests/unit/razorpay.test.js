import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createRazorpayClient, evaluateCheckoutPolicy, hmacSha256Hex, keyMode, timingSafeEqualHex,
  verifyPaymentSignature, verifyWebhookSignature,
} from '../../supabase/functions/_shared/razorpay.js'

describe('hmacSha256Hex', () => {
  it('matches the published HMAC-SHA256 test vector', async () => {
    assert.equal(
      await hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog'),
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    )
  })
})

describe('timingSafeEqualHex', () => {
  it('compares equal-length strings and rejects everything else', () => {
    assert.equal(timingSafeEqualHex('abcd', 'abcd'), true)
    assert.equal(timingSafeEqualHex('abcd', 'abce'), false)
    assert.equal(timingSafeEqualHex('abcd', 'abc'), false)
    assert.equal(timingSafeEqualHex('abcd', undefined), false)
    assert.equal(timingSafeEqualHex(null, null), false)
  })
})

describe('verifyPaymentSignature', () => {
  const keySecret = 'test_key_secret'
  const orderId = 'order_ABC123'
  const paymentId = 'pay_XYZ789'
  const good = () => hmacSha256Hex(keySecret, `${orderId}|${paymentId}`)

  it('accepts the signature Razorpay would produce (order_id|payment_id)', async () => {
    assert.equal(await verifyPaymentSignature({ orderId, paymentId, signature: await good(), keySecret }), true)
  })
  it('accepts an upper-case hex signature', async () => {
    assert.equal(await verifyPaymentSignature({ orderId, paymentId, signature: (await good()).toUpperCase(), keySecret }), true)
  })
  it('rejects a tampered order id, payment id, signature or the wrong secret', async () => {
    const signature = await good()
    assert.equal(await verifyPaymentSignature({ orderId: 'order_OTHER', paymentId, signature, keySecret }), false)
    assert.equal(await verifyPaymentSignature({ orderId, paymentId: 'pay_OTHER', signature, keySecret }), false)
    assert.equal(await verifyPaymentSignature({ orderId, paymentId, signature: signature.replace(/.$/, '0'), keySecret }), false)
    assert.equal(await verifyPaymentSignature({ orderId, paymentId, signature, keySecret: 'wrong' }), false)
  })
  it('rejects the swapped-order form and missing inputs', async () => {
    const wrongFormat = await hmacSha256Hex(keySecret, `${paymentId}|${orderId}`)
    assert.equal(await verifyPaymentSignature({ orderId, paymentId, signature: wrongFormat, keySecret }), false)
    assert.equal(await verifyPaymentSignature({ orderId, paymentId, signature: '', keySecret }), false)
    assert.equal(await verifyPaymentSignature({ orderId, paymentId, signature: await good(), keySecret: '' }), false)
    assert.equal(await verifyPaymentSignature({}), false)
  })
})

describe('verifyWebhookSignature', () => {
  const webhookSecret = 'whsec_test'
  const rawBody = '{"event":"payment.captured","payload":{}}'

  it('verifies the HMAC of the exact raw body', async () => {
    const signature = await hmacSha256Hex(webhookSecret, rawBody)
    assert.equal(await verifyWebhookSignature({ rawBody, signature, webhookSecret }), true)
  })
  it('fails when a single byte of the body changes (including whitespace)', async () => {
    const signature = await hmacSha256Hex(webhookSecret, rawBody)
    assert.equal(await verifyWebhookSignature({ rawBody: `${rawBody} `, signature, webhookSecret }), false)
    assert.equal(await verifyWebhookSignature({ rawBody: JSON.stringify(JSON.parse(rawBody), null, 2), signature, webhookSecret }), false)
  })
  it('fails with a missing signature, wrong secret or empty secret', async () => {
    const signature = await hmacSha256Hex(webhookSecret, rawBody)
    assert.equal(await verifyWebhookSignature({ rawBody, signature: null, webhookSecret }), false)
    assert.equal(await verifyWebhookSignature({ rawBody, signature, webhookSecret: 'other' }), false)
    assert.equal(await verifyWebhookSignature({ rawBody, signature, webhookSecret: '' }), false)
  })
})

describe('evaluateCheckoutPolicy', () => {
  const base = { containsProvisional: false, shippingStatus: 'confirmed', taxStatus: 'confirmed' }

  it('always allows sandbox (test) keys', () => {
    const r = evaluateCheckoutPolicy({ keyId: 'rzp_test_abc', containsProvisional: true, shippingStatus: 'placeholder', taxStatus: 'placeholder' })
    assert.equal(r.allowed, true)
  })
  it('refuses live keys while any business data is provisional or unconfirmed', () => {
    assert.deepEqual(
      evaluateCheckoutPolicy({ keyId: 'rzp_live_abc', ...base, containsProvisional: true }),
      { allowed: false, mode: 'live', reason: 'provisional_catalogue_data' },
    )
    assert.equal(evaluateCheckoutPolicy({ keyId: 'rzp_live_abc', ...base, shippingStatus: 'placeholder' }).reason, 'shipping_not_confirmed')
    assert.equal(evaluateCheckoutPolicy({ keyId: 'rzp_live_abc', ...base, taxStatus: 'placeholder' }).reason, 'tax_not_confirmed')
  })
  it('allows live keys only when everything is confirmed', () => {
    assert.equal(evaluateCheckoutPolicy({ keyId: 'rzp_live_abc', ...base }).allowed, true)
  })
  it('refuses a missing or malformed key', () => {
    for (const keyId of ['', undefined, 'pk_test_x', 'rzp_prod_x']) {
      const r = evaluateCheckoutPolicy({ keyId, ...base })
      assert.equal(r.allowed, false)
      assert.equal(r.reason, 'payment_key_not_configured')
    }
    assert.equal(keyMode('rzp_test_x'), 'test')
    assert.equal(keyMode('rzp_live_x'), 'live')
  })
})

describe('createRazorpayClient', () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    if (url.endsWith('/orders')) return new Response(JSON.stringify({ id: 'order_1' }), { status: 200 })
    if (url.includes('/payments/pay_bad')) return new Response(JSON.stringify({ error: { description: 'nope' } }), { status: 400 })
    return new Response(JSON.stringify({ id: 'pay_1', status: 'captured' }), { status: 200 })
  }
  const client = createRazorpayClient({ keyId: 'rzp_test_k', keySecret: 's3cret', baseUrl: 'http://rzp.local/v1', fetchImpl })

  it('creates orders in paise/INR with Basic auth, without the secret in the URL or body', async () => {
    const out = await client.createOrder({ amountPaise: 12345, receipt: 'NR-1001', notes: { order_id: 'x' } })
    assert.equal(out.id, 'order_1')
    const { url, init } = calls.at(-1)
    assert.equal(url, 'http://rzp.local/v1/orders')
    assert.equal(init.headers.Authorization, `Basic ${btoa('rzp_test_k:s3cret')}`)
    assert.deepEqual(JSON.parse(init.body), { amount: 12345, currency: 'INR', receipt: 'NR-1001', notes: { order_id: 'x' } })
    assert.ok(!url.includes('s3cret') && !init.body.includes('s3cret'))
  })
  it('fetches payments and turns provider errors into thrown errors with a status', async () => {
    assert.equal((await client.fetchPayment('pay_1')).status, 'captured')
    await assert.rejects(client.fetchPayment('pay_bad'), (e) => e.status === 400 && e.detail === 'nope')
  })
})
