import { useState } from 'react'
import { Link } from 'react-router-dom'
import { validateEmail } from '../../../supabase/functions/_shared/validation.js'
import { useAuth } from '../../auth/useAuth'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import Notice from '../../components/ui/Notice'
import { usePageMeta } from '../../lib/meta'
import { authMessage } from '../../lib/authMessage'
import AuthLayout, { ErrorSummary } from './AuthLayout'

export default function ForgotPassword() {
  const { enabled, requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  usePageMeta({ title: 'Reset your password', noindex: true })

  async function onSubmit(e) {
    e.preventDefault()
    const v = validateEmail(email)
    setError(v.ok ? '' : v.error)
    setFormError('')
    if (!v.ok) return
    setBusy(true)
    try {
      await requestPasswordReset(v.value)
      setSent(true)
    } catch (err) {
      setFormError(authMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout eyebrow="Account" title={[['Reset your ', { em: 'password' }]]} lead="Enter your email and we will send a link to choose a new one.">
      {sent ? (
        // Same message whether or not the address has an account, so this form cannot be used to probe for customers.
        <Notice tone="success" title="Check your email">
          <p>If an account exists for that address, a reset link is on its way.</p>
        </Notice>
      ) : (
        <form className="form-grid" onSubmit={onSubmit} noValidate aria-label="Reset your password">
          <ErrorSummary message={formError} />
          <Field id="fp-email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
          <div className="form-actions">
            <Button type="submit" arrow disabled={busy || !enabled}>{busy ? 'Sending…' : 'Send reset link'}</Button>
          </div>
        </form>
      )}
      <p className="muted"><Link className="link-inline" to="/login">Back to sign in</Link></p>
    </AuthLayout>
  )
}
