import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { validateEmail } from '../../../supabase/functions/_shared/validation.js'
import { useAuth } from '../../auth/useAuth'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import Notice from '../../components/ui/Notice'
import { usePageMeta } from '../../lib/meta'
import { authMessage } from '../../lib/authMessage'
import AuthLayout, { ErrorSummary } from './AuthLayout'

const MIN_PASSWORD = 8

export default function Register() {
  const { enabled, user, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from ?? '/account'
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)

  usePageMeta({ title: 'Create an account', noindex: true })
  if (user && !confirmSent) return <Navigate to={from} replace />

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    const next = {}
    const name = form.fullName.trim()
    const v = validateEmail(form.email)
    if (name.length < 2) next.fullName = 'Enter your full name.'
    if (!v.ok) next.email = v.error
    if (form.password.length < MIN_PASSWORD) next.password = `Use at least ${MIN_PASSWORD} characters.`
    if (form.confirm !== form.password) next.confirm = 'The passwords do not match.'
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      const { needsConfirmation } = await signUp({ email: v.value, password: form.password, fullName: name })
      if (needsConfirmation) setConfirmSent(true)
      else navigate(from, { replace: true })
    } catch (err) {
      setFormError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout eyebrow="Join us" title={[['Create an ', { em: 'account' }]]} lead="Save your details, follow your orders, and check out in a few taps.">
      {confirmSent ? (
        <Notice tone="success" title="Check your email">
          <p>We sent a confirmation link to <strong>{form.email}</strong>. Open it to activate your account, then <Link className="link-inline" to="/login">sign in</Link>.</p>
        </Notice>
      ) : (
        <form className="form-grid" onSubmit={onSubmit} noValidate aria-label="Create an account">
          <ErrorSummary message={formError} />
          <Field id="reg-name" label="Full name" autoComplete="name" required value={form.fullName} onChange={set('fullName')} error={errors.fullName} />
          <Field id="reg-email" label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={errors.email} />
          <Field id="reg-password" label="Password" type="password" autoComplete="new-password" required value={form.password} onChange={set('password')} error={errors.password} hint={`At least ${MIN_PASSWORD} characters.`} />
          <Field id="reg-confirm" label="Confirm password" type="password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} error={errors.confirm} />
          <div className="form-actions">
            <Button type="submit" arrow disabled={busy || !enabled}>{busy ? 'Creating account…' : 'Create account'}</Button>
          </div>
        </form>
      )}
      <p className="muted">Already have an account? <Link className="link-inline" to="/login" state={{ from }}>Sign in</Link></p>
    </AuthLayout>
  )
}
