import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import Notice from '../../components/ui/Notice'
import { usePageMeta } from '../../lib/meta'
import { authMessage } from '../../lib/authMessage'
import AuthLayout, { ErrorSummary } from './AuthLayout'

export default function ResetPassword() {
  const { enabled, loading, user, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  usePageMeta({ title: 'Choose a new password', noindex: true })

  async function onSubmit(e) {
    e.preventDefault()
    const next = {}
    if (password.length < 8) next.password = 'Use at least 8 characters.'
    if (confirm !== password) next.confirm = 'The passwords do not match.'
    setErrors(next)
    setFormError('')
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      await updatePassword(password)
      navigate('/account', { replace: true })
    } catch (err) {
      setFormError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // The email link signs the customer in (recovery session) before they land here.
  const ready = enabled && !loading && user
  return (
    <AuthLayout eyebrow="Account" title={[['Choose a new ', { em: 'password' }]]}>
      {enabled && !loading && !user && (
        <Notice tone="warning" title="This link has expired or was already used">
          <p><Link className="link-inline" to="/forgot-password">Request a new reset link</Link>.</p>
        </Notice>
      )}
      {ready && (
        <form className="form-grid" onSubmit={onSubmit} noValidate aria-label="Choose a new password">
          <ErrorSummary message={formError} />
          <Field id="rp-password" label="New password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} hint="At least 8 characters." />
          <Field id="rp-confirm" label="Confirm new password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
          <div className="form-actions">
            <Button type="submit" arrow disabled={busy}>{busy ? 'Saving…' : 'Save password'}</Button>
          </div>
        </form>
      )}
    </AuthLayout>
  )
}
