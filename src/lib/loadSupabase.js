import { isBackendConfigured } from './config'

// The Supabase client (~47 kB gzipped) is loaded on demand so it never sits on the homepage's
// critical path, and is not downloaded at all when no backend is configured.
// Resolves to the client, or null when there is no backend.
export const loadSupabase = () =>
  isBackendConfigured ? import('./supabase').then((m) => m.supabase) : Promise.resolve(null)
