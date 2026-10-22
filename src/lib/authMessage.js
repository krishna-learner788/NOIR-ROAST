// Friendly wording for Supabase Auth errors; never echoes raw provider text.
export function authMessage(error) {
  const m = String(error?.message ?? '').toLowerCase()
  if (m.includes('invalid login')) return 'That email and password do not match.'
  if (m.includes('email not confirmed')) return 'Please confirm your email address first. Check your inbox for the link.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Try signing in instead.'
  if (m.includes('password') && (m.includes('weak') || m.includes('at least') || m.includes('characters'))) return 'Choose a stronger password (at least 8 characters).'
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a minute and try again.'
  if (m.includes('not available yet')) return error.message
  if (m.includes('network') || m.includes('fetch')) return 'We could not reach the server. Check your connection and try again.'
  return 'Something went wrong. Please try again.'
}
