import { useCallback, useEffect, useMemo, useState } from 'react'
import { config, isBackendConfigured } from '../lib/config'
import { loadSupabase } from '../lib/loadSupabase'
import { AuthContext } from './authContext'

const notConfigured = () => Promise.reject(new Error('Accounts are not available yet.'))

// Auth state + actions. Admin status is read from the database (rpc is_admin) purely to decide
// what UI to show; it grants nothing. Every privileged operation re-checks it server-side.
// The Supabase client is loaded on demand (see loadSupabase) to keep it off the homepage's critical path.
export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(isBackendConfigured)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!isBackendConfigured) return undefined
    let active = true
    let unsubscribe = () => {}
    loadSupabase().then((supabase) => {
      if (!active || !supabase) return
      supabase.auth.getSession().then(({ data }) => {
        if (!active) return
        setSession(data.session)
        setLoading(false)
      })
      const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
      unsubscribe = () => sub.subscription.unsubscribe()
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const userId = session?.user?.id ?? null
  useEffect(() => {
    if (!userId) return undefined
    let active = true
    loadSupabase()
      .then((supabase) => supabase.rpc('is_admin'))
      .then(({ data }) => active && setIsAdmin(data === true))
    return () => {
      active = false
      setIsAdmin(false)
    }
  }, [userId])

  const signIn = useCallback(async (email, password) => {
    const supabase = await loadSupabase()
    if (!supabase) return notConfigured()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signUp = useCallback(async ({ email, password, fullName }) => {
    const supabase = await loadSupabase()
    if (!supabase) return notConfigured()
    const { data, error } = await supabase.auth.signUp({
      email, password, options: { data: { full_name: fullName }, emailRedirectTo: `${config.siteUrl || window.location.origin}/login` },
    })
    if (error) throw error
    // With email confirmation enabled there is no session yet; the caller tells the customer to check email.
    return { needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    const supabase = await loadSupabase()
    if (supabase) await supabase.auth.signOut()
  }, [])

  const requestPasswordReset = useCallback(async (email) => {
    const supabase = await loadSupabase()
    if (!supabase) return notConfigured()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${config.siteUrl || window.location.origin}/reset-password`,
    })
    if (error) throw error
  }, [])

  const updatePassword = useCallback(async (password) => {
    const supabase = await loadSupabase()
    if (!supabase) return notConfigured()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }, [])

  const value = useMemo(
    () => ({
      enabled: isBackendConfigured,
      loading,
      session,
      user: session?.user ?? null,
      isAdmin: Boolean(session) && isAdmin,
      signIn, signUp, signOut, requestPasswordReset, updatePassword,
    }),
    [loading, session, isAdmin, signIn, signUp, signOut, requestPasswordReset, updatePassword],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
