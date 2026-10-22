import { useContext } from 'react'
import { AuthContext } from './authContext'

/**
 * { enabled, loading, user, session, isAdmin, signIn, signUp, signOut, requestPasswordReset, updatePassword }
 * `enabled` is false when no backend is configured; every action then rejects with a clear message.
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
