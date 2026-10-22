// Public (browser) configuration only. Every value here ships in the JavaScript bundle, so
// nothing secret may ever be read from import.meta.env: only VITE_* variables are exposed, and
// the only ones this app defines are the Supabase URL, the Supabase anon key (public by design,
// RLS protects the data) and the Razorpay KEY ID (never the key secret).
const env = import.meta.env

export const config = {
  supabaseUrl: (env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, ''),
  supabaseAnonKey: (env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
  // Optional: only used to show a "test mode" banner before an order exists.
  razorpayKeyId: (env.VITE_RAZORPAY_KEY_ID ?? '').trim(),
  siteUrl: (env.VITE_SITE_URL ?? '').trim().replace(/\/$/, ''),
}

export const isBackendConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey)
export const isPaymentTestMode = config.razorpayKeyId.startsWith('rzp_test_')
