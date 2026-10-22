import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { normalizePhone } from '../../../supabase/functions/_shared/validation.js'
import { useAuth } from '../../auth/useAuth'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import LinkButton from '../../components/ui/LinkButton'
import Notice from '../../components/ui/Notice'
import PageHero from '../../components/ui/PageHero'
import PageLoading from '../../components/ui/PageLoading'
import { usePageMeta } from '../../lib/meta'
import { supabase } from '../../lib/supabase'
import useAsync from '../../lib/useAsync'
import { RevealFrom } from '../../motion/directional'

export default function Account() {
  const { user, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  usePageMeta({ title: 'Your account', noindex: true })

  const { data: profile, loading, error, reload } = useAsync(async () => {
    const { data, error: e } = await supabase.from('profiles').select('full_name, phone').eq('id', user.id).single()
    if (e) throw e
    return data
  }, [user.id])

  if (loading && !profile) return <PageLoading label="Loading your account" />

  return (
    <>
      <PageHero eyebrow="Account" title={[['Hello, ', { em: (profile?.full_name || 'friend').split(' ')[0] }]]} lead={user.email} />
      <section className="page-body" data-theme="light">
        <div className="container split">
          <RevealFrom from="left" className="stack">
            <h2 className="section-title">Your details</h2>
            {error ? (
              <Notice tone="error" title="We could not load your details">
                <p><button type="button" className="link-inline" onClick={reload}>Try again</button></p>
              </Notice>
            ) : (
              <ProfileForm key={profile?.full_name + profile?.phone} profile={profile} userId={user.id} onSaved={reload} />
            )}
          </RevealFrom>

          <RevealFrom from="right" className="stack">
            <h2 className="section-title">Your orders</h2>
            <p className="muted">See what you have ordered, pay for an unpaid order, and follow its progress.</p>
            <div className="row">
              <LinkButton to="/account/orders" arrow>View orders</LinkButton>
              <LinkButton to="/shop" variant="secondary">Keep shopping</LinkButton>
            </div>
            {isAdmin && (
              <div className="panel stack stack--tight">
                <p className="panel__title">Administration</p>
                <p className="small muted">You have administrator access.</p>
                <div><Link className="link-inline" to="/admin/orders">Open the admin console</Link></div>
              </div>
            )}
            <hr className="hairline" />
            <div>
              <Button type="button" variant="secondary" onClick={async () => { await signOut(); navigate('/', { replace: true }) }}>Sign out</Button>
            </div>
          </RevealFrom>
        </div>
      </section>
    </>
  )
}

function ProfileForm({ profile, userId, onSaved }) {
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState({ kind: '', text: '' })
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    const next = {}
    const name = fullName.trim()
    const digits = phone.trim() ? normalizePhone(phone) : ''
    if (name.length > 120) next.fullName = 'Keep your name under 120 characters.'
    if (digits && !/^[6-9][0-9]{9}$/.test(digits)) next.phone = 'Enter a 10-digit Indian mobile number.'
    setErrors(next)
    setStatus({ kind: '', text: '' })
    if (Object.keys(next).length) return
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ full_name: name || null, phone: digits || null }).eq('id', userId)
    setBusy(false)
    if (error) setStatus({ kind: 'error', text: 'We could not save your details. Please try again.' })
    else { setStatus({ kind: 'success', text: 'Your details were saved.' }); onSaved() }
  }

  return (
    <form className="form-grid" onSubmit={onSubmit} noValidate aria-label="Your details">
      {status.text && <Notice tone={status.kind === 'error' ? 'error' : 'success'} title={status.text} />}
      <Field id="acc-name" label="Full name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={errors.fullName} />
      <Field id="acc-phone" label="Mobile number" type="tel" inputMode="numeric" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} hint="10 digits. Used only to deliver your orders." />
      <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</Button></div>
    </form>
  )
}
