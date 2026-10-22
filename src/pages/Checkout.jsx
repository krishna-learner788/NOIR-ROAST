import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { INDIAN_STATES, validateShipping } from '../../supabase/functions/_shared/validation.js'
import { useAuth } from '../auth/useAuth'
import { useCart } from '../cart/useCart'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import LinkButton from '../components/ui/LinkButton'
import Notice from '../components/ui/Notice'
import PageHero from '../components/ui/PageHero'
import { provisionalNote } from '../data/products'
import { callFunction, userMessage } from '../lib/api'
import { isPaymentTestMode } from '../lib/config'
import { usePageMeta } from '../lib/meta'
import { formatINR } from '../lib/money'
import { runPayment } from '../lib/payFlow'
import { supabase } from '../lib/supabase'
import useAsync from '../lib/useAsync'
import useStoreSettings from '../lib/useStoreSettings'
import { RevealFrom } from '../motion/directional'

const EMPTY = { name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' }

export default function Checkout() {
  const { user } = useAuth()
  const { lines, items, subtotalPaise, hasProvisionalPrices, clearBag, openCart } = useCart()
  const settings = useStoreSettings()
  const navigate = useNavigate()
  usePageMeta({ title: 'Checkout', noindex: true })

  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState(null) // server-created order awaiting payment: { session, ... }
  const [paymentMsg, setPaymentMsg] = useState(null)

  // Prefill from the profile (name, phone) once; the customer can edit everything.
  useAsync(async () => {
    const { data } = await supabase.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle()
    if (data) setForm((f) => ({ ...f, name: f.name || data.full_name || '', phone: f.phone || data.phone || '' }))
    return data
  }, [user.id])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  if (lines.length === 0 && !stage) {
    return (
      <>
        <PageHero eyebrow="Checkout" title={[['Your bag is ', { em: 'empty' }]]} />
        <section className="page-body" data-theme="light">
          <div className="container stack form-narrow">
            <p className="muted">Add a roast to your bag to check out.</p>
            <div><LinkButton to="/shop" arrow>Browse the roasts</LinkButton></div>
          </div>
        </section>
      </>
    )
  }

  async function createOrder(e) {
    e.preventDefault()
    setFormError('')
    setPaymentMsg(null)
    const v = validateShipping(form)
    setErrors(v.errors)
    if (!v.ok) {
      setFormError('Please check the highlighted fields.')
      return
    }
    setBusy(true)
    try {
      const { data } = await callFunction('create-order', {
        // ids and quantities only: the server prices the order, nothing numeric is trusted from here
        items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
        shipping: v.value,
      })
      setStage({ session: data, shipping: v.value })
    } catch (err) {
      if (err.fields && Object.keys(err.fields).length) setErrors(err.fields)
      setFormError(userMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function pay() {
    setBusy(true)
    setPaymentMsg(null)
    try {
      const { order } = stage.session
      const { outcome } = await runPayment({ session: stage.session, prefill: stage.session.prefill, description: `Order ${order.order_number}` })
      if (outcome === 'paid' || outcome === 'pending') {
        clearBag()
        navigate(`/orders/${order.id}?placed=1`, { replace: true })
        return
      }
      if (outcome === 'failed') setPaymentMsg({ tone: 'error', text: 'That payment did not go through. You have not been charged. Please try again.' })
      else setPaymentMsg({ tone: 'info', text: 'The payment window was closed. Your order is held for a short time — you can try again.' })
    } catch (err) {
      setPaymentMsg({ tone: 'error', text: userMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  async function discardOrder() {
    setBusy(true)
    await supabase.rpc('cancel_pending_order', { p_order_id: stage.session.order.id })
    setBusy(false)
    setStage(null)
    setPaymentMsg(null)
  }

  const shippingNote = settings.loaded && settings.shippingStatus !== 'confirmed'
  const server = stage?.session

  return (
    <>
      <PageHero eyebrow="Checkout" title={[[stage ? 'Review and ' : 'Delivery ', { em: stage ? 'pay' : 'details' }]]} />
      <section className="page-body" data-theme="light">
        <div className="container split split--sticky">
          <RevealFrom from="left" className="stack">
            {isPaymentTestMode && (
              <Notice tone="warning" title="Test mode">No real money is taken. Use Razorpay's test card or UPI details.</Notice>
            )}

            {!stage ? (
              <form className="form-grid form-grid--2" onSubmit={createOrder} noValidate aria-label="Delivery details">
                <div className="span-2"><h2 className="section-title">Where should we send it?</h2></div>
                {formError && <div className="span-2"><Notice tone="error" title={formError} /></div>}
                <Field className="span-2" id="co-name" label="Recipient's full name" autoComplete="name" required value={form.name} onChange={set('name')} error={errors.name} />
                <Field id="co-phone" label="Mobile number" type="tel" inputMode="numeric" autoComplete="tel-national" required value={form.phone} onChange={set('phone')} error={errors.phone} hint="10 digits, for the courier." />
                <div aria-hidden="true" />
                <Field className="span-2" id="co-line1" label="Address" autoComplete="address-line1" required value={form.line1} onChange={set('line1')} error={errors.line1} hint="House or flat, building, street." />
                <Field className="span-2" id="co-line2" label="Landmark or area (optional)" autoComplete="address-line2" value={form.line2} onChange={set('line2')} error={errors.line2} />
                <Field id="co-city" label="City or town" autoComplete="address-level2" required value={form.city} onChange={set('city')} error={errors.city} />
                <Field id="co-state" as="select" label="State or union territory" autoComplete="address-level1" required value={form.state} onChange={set('state')} error={errors.state}>
                  <option value="">Choose…</option>
                  {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Field>
                <Field id="co-pin" label="PIN code" inputMode="numeric" autoComplete="postal-code" required value={form.pincode} onChange={set('pincode')} error={errors.pincode} />
                <div className="span-2 form-actions">
                  <Button type="submit" arrow disabled={busy}>{busy ? 'Preparing your order…' : 'Continue to payment'}</Button>
                  <button type="button" className="back-link" onClick={() => openCart()}>Edit bag</button>
                </div>
              </form>
            ) : (
              <div className="stack">
                <h2 className="section-title">Order {server.order.order_number}</h2>
                <p className="muted">We have reserved your coffee for a short time. The total below was calculated by our server from current prices.</p>
                {paymentMsg && <Notice tone={paymentMsg.tone} title={paymentMsg.text} />}
                {server.notices.contains_provisional && (
                  <Notice tone="warning" title="Provisional prices and weights">This order uses placeholder prices and weights that are not final.</Notice>
                )}
                {server.order.subtotal_paise !== subtotalPaise && (
                  <Notice tone="info" title="The price changed">Prices were updated since you added these items. Please check the total.</Notice>
                )}
                <address className="panel" style={{ fontStyle: 'normal' }}>
                  <span className="panel__title">Delivering to</span><br />
                  {stage.shipping.name}<br />{stage.shipping.line1}{stage.shipping.line2 ? `, ${stage.shipping.line2}` : ''}<br />
                  {stage.shipping.city}, {stage.shipping.state} {stage.shipping.pincode}<br /><span className="muted">{stage.shipping.phone}</span>
                </address>
                <div className="row">
                  <Button type="button" arrow onClick={pay} disabled={busy}>{busy ? 'Opening payment…' : `Pay ${formatINR(server.order.total_paise)}`}</Button>
                  <Button type="button" variant="link" onClick={discardOrder} disabled={busy}>Change details</Button>
                </div>
                <p className="small muted">You can also find this order under <Link className="link-inline" to="/account/orders">Your orders</Link>; unpaid orders are released automatically.</p>
              </div>
            )}
          </RevealFrom>

          <RevealFrom from="right" className="panel stack stack--tight" aria-label="Order summary">
            <p className="panel__title">Your bag</p>
            <div className="lines" role="list">
              {lines.map((l) => (
                <div className="lines__row" role="listitem" key={l.product.id}>
                  <div>
                    <p className="lines__name">{l.product.name}</p>
                    <p className="lines__meta">{l.product.weight} × {l.quantity}{provisionalNote(l.product) ? ` · ${provisionalNote(l.product)}` : ''}</p>
                  </div>
                  <p className="money">{formatINR(l.lineTotalPaise)}</p>
                </div>
              ))}
            </div>
            <dl className="kv">
              <div><dt>Subtotal{hasProvisionalPrices ? ' (provisional)' : ''}</dt><dd>{formatINR(server ? server.order.subtotal_paise : subtotalPaise)}</dd></div>
              <div><dt>Shipping</dt><dd>{server ? formatINR(server.order.shipping_paise) : 'At payment'}</dd></div>
              {server && <div><dt>Tax</dt><dd>{formatINR(server.order.tax_paise)}</dd></div>}
              {server && <div className="kv--total"><dt>Total</dt><dd>{formatINR(server.order.total_paise)}</dd></div>}
            </dl>
            {(shippingNote || !server) && <p className="small muted">The final total, including shipping and any taxes, is calculated by our server when you continue.</p>}
            {shippingNote && server && <p className="small muted">Shipping and tax rules are not final yet, so those lines may show ₹0.</p>}
          </RevealFrom>
        </div>
      </section>
    </>
  )
}
