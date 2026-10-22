import { ERRORS } from '../../supabase/functions/_shared/errors.js'
import { config } from './config'
import { supabase } from './supabase'

export class ApiError extends Error {
  constructor(code, message, extra = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    Object.assign(this, extra)
  }
}

const messageFor = (code) => (ERRORS[code] ?? ERRORS.internal_error)[1]

/** Calls an Edge Function as the signed-in customer. Never sends prices or payment status. */
export async function callFunction(name, body) {
  if (!supabase) throw new ApiError('backend_not_configured', 'Online checkout is not available yet.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ApiError('unauthorized', messageFor('unauthorized'))

  let res
  try {
    res = await fetch(`${config.supabaseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.supabaseAnonKey, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('network', 'We could not reach the server. Check your connection and try again.')
  }
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const code = json?.error?.code ?? 'internal_error'
    throw new ApiError(code, json?.error?.message ?? messageFor(code), { status: res.status, fields: json?.fields, items: json?.items, detail: json?.detail })
  }
  return { status: res.status, data: json }
}

/** Turn any thrown value into a message that is safe to show a customer. */
export const userMessage = (err) => (err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
