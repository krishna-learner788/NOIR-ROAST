// Razorpay helpers: signature verification, checkout policy and a minimal API client.
// Uses only Web APIs (crypto.subtle, TextEncoder, fetch) so it runs unchanged in Deno (Supabase
// Edge Functions) and Node (tests). Secrets are passed in by the caller; this module reads no env.

const enc = new TextEncoder()

export async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time comparison of two hex strings (length difference leaks nothing useful here). */
export function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Checkout success signature: HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret). */
export async function verifyPaymentSignature({ orderId, paymentId, signature, keySecret }) {
  if (!orderId || !paymentId || !signature || !keySecret) return false
  const expected = await hmacSha256Hex(keySecret, `${orderId}|${paymentId}`)
  return timingSafeEqualHex(expected, String(signature).toLowerCase())
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook_secret). Must be the RAW body bytes/text. */
export async function verifyWebhookSignature({ rawBody, signature, webhookSecret }) {
  if (typeof rawBody !== 'string' || !signature || !webhookSecret) return false
  const expected = await hmacSha256Hex(webhookSecret, rawBody)
  return timingSafeEqualHex(expected, String(signature).toLowerCase())
}

export function keyMode(keyId) {
  if (typeof keyId !== 'string') return 'unknown'
  if (keyId.startsWith('rzp_test_')) return 'test'
  if (keyId.startsWith('rzp_live_')) return 'live'
  return 'unknown'
}

/**
 * The guard that stops placeholder business data reaching real money.
 *   test key    -> always allowed (sandbox, no real charge)
 *   live key    -> allowed only if no price/weight is provisional AND shipping and tax are confirmed
 *   anything else (missing/odd key) -> refused
 */
export function evaluateCheckoutPolicy({ keyId, containsProvisional, shippingStatus, taxStatus }) {
  const mode = keyMode(keyId)
  if (mode === 'test') return { allowed: true, mode }
  if (mode === 'live') {
    if (containsProvisional) return { allowed: false, mode, reason: 'provisional_catalogue_data' }
    if (shippingStatus !== 'confirmed') return { allowed: false, mode, reason: 'shipping_not_confirmed' }
    if (taxStatus !== 'confirmed') return { allowed: false, mode, reason: 'tax_not_confirmed' }
    return { allowed: true, mode }
  }
  return { allowed: false, mode, reason: 'payment_key_not_configured' }
}

const b64 = (s) => btoa(s)

/** Minimal Razorpay REST client. `baseUrl` is overridable so tests can point at a fake server. */
export function createRazorpayClient({ keyId, keySecret, baseUrl = 'https://api.razorpay.com/v1', fetchImpl = fetch }) {
  const headers = { Authorization: `Basic ${b64(`${keyId}:${keySecret}`)}`, 'Content-Type': 'application/json' }
  async function call(method, path, body) {
    const res = await fetchImpl(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { /* non-JSON error body */ }
    if (!res.ok) {
      const err = new Error(`razorpay_${res.status}`)
      err.status = res.status
      err.detail = json?.error?.description ?? null
      throw err
    }
    return json
  }
  return {
    createOrder: ({ amountPaise, receipt, notes }) =>
      call('POST', '/orders', { amount: amountPaise, currency: 'INR', receipt, notes }),
    fetchPayment: (paymentId) => call('GET', `/payments/${encodeURIComponent(paymentId)}`),
  }
}
