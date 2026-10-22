// The only place that touches Deno.env and supabase-js. Kept thin on purpose: all behaviour lives
// in handlers.js, which is unit-tested with fakes. Secrets come from Edge Function secrets
// (`supabase secrets set ...`), never from the repo. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
// injected by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRazorpayClient } from './razorpay.js'

const required = (name: string) => {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Missing required secret: ${name}`)
  return v
}

export function buildDeps() {
  const admin = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const keyId = required('RAZORPAY_KEY_ID')
  const keySecret = required('RAZORPAY_KEY_SECRET')

  const one = async (query: any) => (await query.maybeSingle()).data ?? null

  return {
    config: { keyId, keySecret, webhookSecret: Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? '' },

    // Verify the caller's JWT with the Auth server (not just decode it).
    authenticate: async (request: Request) => {
      const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
      if (!token) return null
      const { data, error } = await admin.auth.getUser(token)
      return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? '' }
    },

    db: {
      rpc: (name: string, args: Record<string, unknown>) => admin.rpc(name, args),
      getOrder: (id: string) =>
        one(admin.from('orders')
          .select('id, user_id, status, total_paise, order_number, reservation_expires_at, ship_name, ship_phone')
          .eq('id', id)),
      getOrderPolicyFacts: async (id: string) => (await admin.rpc('order_policy_facts', { p_order_id: id })).data,
      getPaymentByProviderOrderId: (id: string) =>
        one(admin.from('payments').select('id, order_id, status, amount_paise, provider_order_id, provider_payment_id')
          .eq('provider_order_id', id)),
      getPaymentByProviderPaymentId: (id: string) =>
        one(admin.from('payments').select('id, order_id, provider_order_id').eq('provider_payment_id', id)),
      getOpenPaymentForOrder: (orderId: string) =>
        one(admin.from('payments').select('id, provider_order_id, status').eq('order_id', orderId)
          .in('status', ['created', 'authorized', 'failed']).order('created_at', { ascending: false }).limit(1)),
    },

    razorpay: createRazorpayClient({ keyId, keySecret, baseUrl: Deno.env.get('RAZORPAY_API_BASE') ?? undefined }),
    now: () => new Date(),
    // Structured, PII-free logs (no emails, addresses, signatures or secrets).
    log: (level: string, event: string, context: Record<string, unknown> = {}) =>
      (level === 'error' ? console.error : console.log)(JSON.stringify({ level, event, ...context })),
  }
}
