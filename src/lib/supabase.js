import { createClient } from '@supabase/supabase-js'
import { config, isBackendConfigured } from './config'

// null when the backend is not configured: the storefront still works from the local catalogue
// and account/checkout screens explain what is missing instead of failing.
export const supabase = isBackendConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null
