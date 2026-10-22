import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Notice from '../../components/ui/Notice'
import PageHero from '../../components/ui/PageHero'
import PageLoading from '../../components/ui/PageLoading'
import StatusBadge from '../../components/ui/StatusBadge'
import { callFunction, userMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { orderStatusLabel, paymentStatusLabel } from '../../lib/statusLabels'
import { usePageMeta } from '../../lib/meta'
import { formatINR } from '../../lib/money'
import { runPayment } from '../../lib/payFlow'
import { supabase } from '../../lib/supabase'
import useAsync from '../../lib/useAsync'
import useStoreSettings from '../../lib/useStoreSettings'
import NotFound from '../NotFound'

const POLL_MS = 3000
const POLL_MAX = 10

export default function OrderDetail() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const justPlaced = params.get('placed') === '1'
  const settings = useStoreSettings()
  const [busy, setBusy] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [message, setMessage] = useState(null) // { tone, text }
  const [openedAt] = useState(() => Date.now()) // snapshot: render stays pure; the server re-checks expiry on Pay

  const { data: order, loading, error, reload } = useAsync(async () => {
    const { data, error: e } = await supabase
      .from('orders')
      .select('*, order_items(*), payments(*), order_status_history(*)')
      .eq('id', id)
      .maybeSingle()
    if (e) throw e
    return data
  }, [id])

  usePageMeta({ title: order ? `Order ${order.order_number}` : 'Order', noindex: true })

  // Right after paying, the webhook may still be settling the order: look again a few times.
  const pending = order?.status === 'pending_payment'
  useEffect(() => {
    if (!justPlaced || !pending) return undefined
    let n = 0
    const t = setInterval(() => {
      if (++n > POLL_MAX) clearInterval(t)
      else reload()
    }, POLL_MS)
    return () => clearInterval(t)
  }, [justPlaced, pending, reload])

  if (loading && !order) return <PageLoading label="Loading your order" />
  if (error) {
    return (
      <section className="page-body" data-theme="light">
        <div className="container form-narrow">
          <Notice tone="error" title="We could not load this order">
            <p><button type="button" className="link-inline" onClick={reload}>Try again</button></p>
          </Notice>
        </div>
      </section>
    )
  }
  if (!order) return <NotFound what="order" />

  const expires = order.reservation_expires_at ? new Date(order.reservation_expires_at) : null
  const expired = pending && expires && expires.getTime() < openedAt
  const history = [...order.order_status_history].sort((a, b) => a.id - b.id)
  const lastPayment = [...order.payments].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]

  async function payNow() {
    setBusy(true)
    setMessage(null)
    try {
      const { data: session } = await callFunction('create-order', { resumeOrderId: order.id })
      const { outcome } = await runPayment({ session, prefill: session.prefill, description: `Order ${order.order_number}` })
      if (outcome === 'dismissed') setMessage({ tone: 'info', text: 'The payment window was closed. You can try again.' })
      else if (outcome === 'failed') setMessage({ tone: 'error', text: 'That payment did not go through. You have not been charged. Please try again.' })
      else setMessage({ tone: 'success', text: outcome === 'paid' ? 'Payment received. Thank you.' : 'Payment received. We are confirming it now.' })
      await reload()
    } catch (err) {
      setMessage({ tone: 'error', text: userMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  async function cancelOrder() {
    setBusy(true)
    setMessage(null)
    const { error: e } = await supabase.rpc('cancel_pending_order', { p_order_id: order.id })
    setBusy(false)
    setConfirmCancel(false)
    if (e) setMessage({ tone: 'error', text: 'We could not cancel this order. It may have just been paid.' })
    else setMessage({ tone: 'success', text: 'Your order was cancelled.' })
    await reload()
  }

  const tone = order.status === 'cancelled' || order.status === 'expired' ? 'warning' : 'success'

  return (
    <>
      <PageHero
        eyebrow={`Order ${order.order_number}`}
        title={[[orderStatusLabel(order.status)]]}
        lead={`Placed ${formatDateTime(order.created_at)}`}
      />
      <section className="page-body" data-theme="light">
        <div className="container stack">
          <Link to="/account/orders" className="back-link">← All orders</Link>

          {justPlaced && order.status === 'paid' && <Notice tone="success" title="Thank you. Your payment was received.">We will email you when your order ships.</Notice>}
          {justPlaced && pending && <Notice tone="info" title="Confirming your payment…">This page updates by itself. If you have just paid, it takes a few seconds.</Notice>}
          {message && <Notice tone={message.tone} title={message.text} />}
          {order.status === 'cancelled' && !message && <Notice tone={tone} title="This order was cancelled." />}
          {order.status === 'expired' && <Notice tone="warning" title="This order expired before it was paid.">Nothing was charged. You can place it again from the shop.</Notice>}
          {lastPayment?.refund_required && (
            <Notice tone="warning" title="A refund is being arranged for this order.">If money left your account for an order we could not fulfil, it will be returned to you.</Notice>
          )}

          {pending && !expired && (
            <div className="panel stack stack--tight">
              <p className="panel__title">Waiting for payment</p>
              <p className="muted">
                We are holding your coffee{expires ? ` until ${formatDateTime(order.reservation_expires_at)}` : ''}. Pay now to complete the order.
              </p>
              <div className="row">
                <Button type="button" arrow onClick={payNow} disabled={busy}>{busy ? 'Opening payment…' : `Pay ${formatINR(order.total_paise)}`}</Button>
                {!confirmCancel ? (
                  <Button type="button" variant="link" onClick={() => setConfirmCancel(true)} disabled={busy}>Cancel order</Button>
                ) : (
                  <span className="row" role="group" aria-label="Confirm cancellation">
                    <span className="small">Cancel this order?</span>
                    <Button type="button" variant="secondary" onClick={cancelOrder} disabled={busy}>Yes, cancel</Button>
                    <Button type="button" variant="link" onClick={() => setConfirmCancel(false)}>Keep it</Button>
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="split">
            <div className="stack">
              <h2 className="section-title">Items</h2>
              <div className="lines" role="list">
                {order.order_items.map((i) => (
                  <div className="lines__row" role="listitem" key={i.id}>
                    <div>
                      <p className="lines__name">{i.product_name}</p>
                      <p className="lines__meta">{i.weight_grams} g × {i.quantity} · {formatINR(i.unit_price_paise)} each</p>
                    </div>
                    <p className="money">{formatINR(i.unit_price_paise * i.quantity)}</p>
                  </div>
                ))}
              </div>

              <h2 className="section-title">Progress</h2>
              <ol className="steps" aria-label="Order progress">
                {history.map((h) => (
                  <li key={h.id}>
                    <strong>{orderStatusLabel(h.to_status)}</strong>
                    <span className="steps__when">{formatDateTime(h.created_at)}</span>
                    {h.note && h.changed_by === null && h.note !== 'Order created' && <span className="small muted">{h.note}</span>}
                  </li>
                ))}
              </ol>
            </div>

            <div className="stack">
              <div className="panel">
                <p className="panel__title">Total</p>
                <dl className="kv">
                  <div><dt>Subtotal</dt><dd>{formatINR(order.subtotal_paise)}</dd></div>
                  <div><dt>Shipping</dt><dd>{formatINR(order.shipping_paise)}</dd></div>
                  <div><dt>Tax</dt><dd>{formatINR(order.tax_paise)}</dd></div>
                  <div className="kv--total"><dt>Total</dt><dd>{formatINR(order.total_paise)}</dd></div>
                </dl>
                {settings.loaded && (settings.shippingStatus !== 'confirmed' || settings.taxStatus !== 'confirmed') && (
                  <p className="small muted" style={{ marginTop: 'var(--space-3)' }}>Shipping and tax rules are not final yet, so these lines may show ₹0 for now.</p>
                )}
              </div>

              <div className="panel">
                <p className="panel__title">Delivering to</p>
                <address style={{ fontStyle: 'normal' }}>
                  {order.ship_name}<br />
                  {order.ship_line1}{order.ship_line2 ? `, ${order.ship_line2}` : ''}<br />
                  {order.ship_city}, {order.ship_state} {order.ship_pincode}<br />
                  <span className="muted">{order.ship_phone}</span>
                </address>
                {order.tracking_note && <p className="small" style={{ marginTop: 'var(--space-3)' }}><strong>Tracking:</strong> {order.tracking_note}</p>}
              </div>

              <div className="panel">
                <p className="panel__title">Payment</p>
                {order.payments.length === 0 ? <p className="muted">No payment has been started.</p> : (
                  <ul className="stack stack--tight">
                    {order.payments.map((p) => (
                      <li key={p.id} className="row row--between">
                        <span className="small">{formatDateTime(p.created_at)}</span>
                        <span title={paymentStatusLabel(p.status)}><StatusBadge kind="payment" status={p.status} /></span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
