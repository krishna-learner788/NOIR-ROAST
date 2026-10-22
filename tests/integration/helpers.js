// Shared harness for the integration tests. These run against the LOCAL Supabase stack started
// with `npm run supabase:start` (Docker). They never touch a hosted project, and they use a FAKE
// Razorpay server: HMAC signatures are computed with the real algorithm and a throwaway local
// secret, but no request ever reaches Razorpay. Real provider behaviour is NOT covered here.
import { execSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { hmacSha256Hex } from '../../supabase/functions/_shared/razorpay.js'

export const LOCAL = {
  // Must match the values exported when the local stack was started (see docs/architecture.md)
  keyId: process.env.RAZORPAY_KEY_ID ?? 'rzp_test_localfakekey',
  keySecret: process.env.RAZORPAY_KEY_SECRET ?? 'local_fake_key_secret',
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? 'local_fake_webhook_secret',
  fakePort: 4010,
}

let cached
/** Local URL + keys from `supabase status` (these are the public demo keys of the local stack). */
export function localEnv() {
  if (cached) return cached
  const fromEnv = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY
  if (fromEnv) {
    cached = { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY, service: process.env.SUPABASE_SERVICE_ROLE_KEY }
    return cached
  }
  const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const get = (k) => out.match(new RegExp(`^${k}="?([^"\\n]+)"?`, 'm'))?.[1]
  cached = { url: get('API_URL'), anon: get('ANON_KEY'), service: get('SERVICE_ROLE_KEY') }
  if (!cached.url || !cached.anon || !cached.service) throw new Error('Local Supabase is not running (npm run supabase:start)')
  return cached
}

export const admin = () => {
  const { url, service } = localEnv()
  return createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
}

let seq = 0
const stamp = Date.now().toString(36)

/** Creates a confirmed user and returns { id, email, jwt, client } (client acts AS the user, subject to RLS). */
export async function makeUser(prefix = 'user') {
  const { url, anon } = localEnv()
  const email = `${prefix}-${stamp}-${++seq}@noirroast.test`
  const password = 'Correct-Horse-9'
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Test ${prefix}` } })
  if (error) throw error
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const signIn = await client.auth.signInWithPassword({ email, password })
  if (signIn.error) throw signIn.error
  return { id: data.user.id, email, password, jwt: signIn.data.session.access_token, client }
}

const createdProducts = []

/** Hides every product these tests created so they never show up in the dev storefront. */
export async function cleanupProducts() {
  if (createdProducts.length) await admin().from('products').update({ is_active: false }).in('id', createdProducts)
}

export async function makeProduct(overrides = {}) {
  const id = `it-${stamp}-${++seq}`
  const row = {
    id, name: `Integration ${id}`, price_paise: 50000, weight_grams: 250, is_active: true, stock_quantity: null,
    price_status: 'confirmed', weight_status: 'confirmed', ...overrides,
  }
  const { error } = await admin().from('products').insert(row)
  if (error) throw error
  createdProducts.push(id)
  return row
}

export async function callFn(name, { jwt, body, headers = {}, method = 'POST', raw } = {}) {
  const { url, anon } = localEnv()
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method,
    headers: { apikey: anon, 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* non-JSON */ }
  return { status: res.status, json, text }
}

export const SHIPPING = { name: 'Asha Rao', phone: '9876543210', line1: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' }

export async function placeOrder(user, items, shipping = SHIPPING, extra = {}) {
  return callFn('create-order', { jwt: user.jwt, body: { items, shipping, ...extra } })
}

/** What Razorpay Checkout hands back to the browser on success. */
export async function checkoutResult(razorpayOrderId, paymentId, secret = LOCAL.keySecret) {
  return {
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: await hmacSha256Hex(secret, `${razorpayOrderId}|${paymentId}`),
  }
}

export async function signedWebhook(event, { eventId, secret = LOCAL.webhookSecret } = {}) {
  const raw = JSON.stringify(event)
  return callFn('razorpay-webhook', {
    raw,
    headers: { 'x-razorpay-signature': await hmacSha256Hex(secret, raw), 'x-razorpay-event-id': eventId ?? `evt_${stamp}_${++seq}` },
  })
}

export const paymentEvent = (type, { orderId, paymentId, amount, status = 'captured', extra = {} }) => ({
  event: type,
  payload: { payment: { entity: { id: paymentId, order_id: orderId, amount, currency: 'INR', status, ...extra } } },
})

/**
 * Fake Razorpay REST API (orders + payments) listening on the host so the edge-runtime container
 * can reach it at host.docker.internal. Payments are registered by tests via `setPayment`.
 */
export async function startFakeRazorpay() {
  const orders = new Map()
  const payments = new Map()
  const requests = []
  let nextId = 1
  let failNext = 0
  const expectedAuth = `Basic ${Buffer.from(`${LOCAL.keyId}:${LOCAL.keySecret}`).toString('base64')}`

  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, body })
      const send = (status, obj) => {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify(obj))
      }
      // Test-only hook (CORS-enabled) so a browser test can register the payment its stubbed Checkout "made".
      if (req.url === '/__register') {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST' })
          return res.end()
        }
        const p = JSON.parse(body)
        payments.set(p.id, { entity: 'payment', currency: 'INR', ...p })
        return send(200, { ok: true })
      }
      if (req.headers.authorization !== expectedAuth) return send(401, { error: { description: 'bad credentials' } })
      if (failNext > 0) { failNext--; return send(500, { error: { description: 'provider outage' } }) }
      if (req.method === 'POST' && req.url === '/v1/orders') {
        const input = JSON.parse(body)
        const order = { id: `order_fake${stamp}${nextId++}`, entity: 'order', amount: input.amount, currency: input.currency, receipt: input.receipt, status: 'created' }
        orders.set(order.id, order)
        return send(200, order)
      }
      const m = req.url.match(/^\/v1\/payments\/([^/?]+)/)
      if (req.method === 'GET' && m) {
        const p = payments.get(m[1])
        return p ? send(200, p) : send(404, { error: { description: 'not found' } })
      }
      return send(404, { error: { description: 'unknown route' } })
    })
  })
  await new Promise((resolve) => server.listen(LOCAL.fakePort, '0.0.0.0', resolve))
  return {
    orders, payments, requests,
    setPayment: (p) => payments.set(p.id, { entity: 'payment', currency: 'INR', ...p }),
    failNextRequests: (n) => { failNext = n },
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

let counter = 0
export const uniquePaymentId = () => `pay_${stamp}${++counter}`
