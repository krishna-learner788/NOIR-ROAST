import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { validateEmail } from '../../../supabase/functions/_shared/validation.js'
import { useAuth } from '../../auth/useAuth'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import { usePageMeta } from '../../lib/meta'
import { authMessage } from '../../lib/authMessage'
import AuthLayout, { ErrorSummary } from './AuthLayout'

export default function Login() {
  const { enabled, user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from ?? '/account'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  usePageMeta({ title: 'Sign in', noindex: true })
  if (user) return <Navigate to={from} replace />

  async function onSubmit(e) {
    e.preventDefault()
    const next = {}
    const v = validateEmail(email)
    if (!v.ok) next.email = v.error
    if (!password) next.password = 'Enter your password.'
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      await signIn(v.value, password)
      navigate(from, { replace: true })
    } catch (err) {
      setFormError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout eyebrow="Welcome back" title={[['Sign ', { em: 'in' }]]} lead="Track your orders and check out faster.">
      <form className="form-grid" onSubmit={onSubmit} noValidate aria-label="Sign in">
        <ErrorSummary message={formError} />
        <Field id="login-email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <Field id="login-password" label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
        <div className="form-actions">
          <Button type="submit" arrow disabled={busy || !enabled}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          <Link className="back-link" to="/forgot-password">Forgot password?</Link>
        </div>
      </form>
      <p className="muted">New to NOIR ROAST? <Link className="link-inline" to="/register" state={{ from }}>Create an account</Link></p>
    </AuthLayout>
  )
}
