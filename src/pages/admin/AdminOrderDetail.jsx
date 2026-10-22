import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import Notice from '../../components/ui/Notice'
import PageLoading from '../../components/ui/PageLoading'
import StatusBadge from '../../components/ui/StatusBadge'
import { formatDateTime } from '../../lib/format'
import { formatINR } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import useAsync from '../../lib/useAsync'
import NotFound from '../NotFound'

// What the admin may do next from each state. The database trigger is the real authority:
// anything else is rejected there with `invalid_order_transition`.
const NEXT = {
  paid: [['processing', 'Start processing']],
  processing: [['shipped', 'Mark shipped']],
  shipped: [['delivered', 'Mark delivered']],
}
const CANCELLABLE = ['pending_payment', 'paid', 'processing']

export default function AdminOrderDetail() {
  const { id } = useParams()
  const [tracking, setTracking] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const { data: order, loading, error, reload } = useAsync(async () => {
    const { data, error: e } = await supabase
      .from('orders')
      .select('*, order_items(*), payments(*), order_status_history(*)')
      .eq('id', id)
      .maybeSingle()
    if (e) throw e
    return data
  }, [id])

  if (loading && !order) return <PageLoading label="Loading the order" />
  if (error) return <Notice tone="error" title="This order could not be loaded"><p><button type="button" className="link-inline" onClick={reload}>Try again</button></p></Notice>
  if (!order) return <NotFound what="order" />

  async function setStatus(to) {
    setBusy(true)
    setMessage(null)
    const { error: e } = await supabase.rpc('admin_set_order_status', {
      p_order_id: order.id, p_to: to, p_note: note || null, p_tracking: to === 'shipped' ? tracking || null : null,
    })
    setBusy(false)
    setConfirmCancel(false)
    if (e) {
      setMessage({ tone: 'error', text: /invalid_order_transition/.test(e.message) ? 'That change is not allowed from the current status.' : 'The change could not be saved.' })
    } else {
      setMessage({ tone: 'success', text: `Order marked ${to.replace('_', ' ')}.` })
      setNote('')
      await reload()
    }
  }

  const history = [...order.order_status_history].sort((a, b) => a.id - b.id)
  const refundNeeded = order.payments.some((p) => p.refund_required)
  const next = NEXT[order.status] ?? []

  return (
    <div className="stack">
      <Link to="/admin/orders" className="back-link">← All orders</Link>
      <div className="row row--between">
        <h2 className="section-title">Order {order.order_number}</h2>
        <StatusBadge status={order.status} />
      </div>
      <p className="muted">Placed {formatDateTime(order.created_at)} · {order.contact_email}</p>

      {message && <Notice tone={message.tone} title={message.text} />}
      {refundNeeded && (
        <Notice tone="warning" title="A refund is required for this order.">
          Money was taken that cannot be fulfilled (late, duplicate or cancelled order). Refund it in the Razorpay dashboard; this console does not move money.
        </Notice>
      )}

      {(next.length > 0 || CANCELLABLE.includes(order.status)) && (
        <div className="panel stack stack--tight">
          <p className="panel__title">Update status</p>
          {next.some(([to]) => to === 'shipped') && (
            <Field id="ao-tracking" label="Courier and tracking (optional)" value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={500} />
          )}
          <Field id="ao-note" label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <div className="row">
            {next.map(([to, label]) => <Button key={to} type="button" onClick={() => setStatus(to)} disabled={busy}>{label}</Button>)}
            {CANCELLABLE.includes(order.status) && (!confirmCancel ? (
              <Button type="button" variant="secondary" onClick={() => setConfirmCancel(true)} disabled={busy}>Cancel order</Button>
            ) : (
              <span className="row" role="group" aria-label="Confirm cancellation">
                <span className="small">{order.status === 'pending_payment' ? 'Cancel this unpaid order?' : 'Cancel a PAID order? Stock returns and a refund is flagged.'}</span>
                <Button type="button" variant="secondary" onClick={() => setStatus('cancelled')} disabled={busy}>Yes, cancel</Button>
                <Button type="button" variant="link" onClick={() => setConfirmCancel(false)}>Keep it</Button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="split">
        <div className="stack">
          <h3 className="section-title">Items</h3>
          <div className="lines" role="list">
            {order.order_items.map((i) => (
              <div className="lines__row" role="listitem" key={i.id}>
                <div><p className="lines__name">{i.product_name}</p><p className="lines__meta">{i.product_id} · {i.weight_grams} g × {i.quantity} · {formatINR(i.unit_price_paise)} each</p></div>
                <p className="money">{formatINR(i.unit_price_paise * i.quantity)}</p>
              </div>
            ))}
          </div>
          <dl className="kv panel">
            <div><dt>Subtotal</dt><dd>{formatINR(order.subtotal_paise)}</dd></div>
            <div><dt>Shipping</dt><dd>{formatINR(order.shipping_paise)}</dd></div>
            <div><dt>Tax</dt><dd>{formatINR(order.tax_paise)}</dd></div>
            <div className="kv--total"><dt>Total</dt><dd>{formatINR(order.total_paise)}</dd></div>
          </dl>

          <h3 className="section-title">History</h3>
          <ol className="steps">
            {history.map((h) => (
              <li key={h.id}>
                <strong>{h.from_status ? `${h.from_status.replace('_', ' ')} → ` : ''}{h.to_status.replace('_', ' ')}</strong>
                <span className="steps__when">{formatDateTime(h.created_at)} · {h.changed_by ? 'admin or customer' : 'system'}</span>
                {h.note && <span className="small muted">{h.note}</span>}
              </li>
            ))}
          </ol>
        </div>

        <div className="stack">
          <div className="panel">
            <p className="panel__title">Deliver to</p>
            <address style={{ fontStyle: 'normal' }}>
              {order.ship_name}<br />{order.ship_line1}{order.ship_line2 ? `, ${order.ship_line2}` : ''}<br />
              {order.ship_city}, {order.ship_state} {order.ship_pincode}<br />{order.ship_phone}
            </address>
            {order.tracking_note && <p className="small" style={{ marginTop: 'var(--space-3)' }}><strong>Tracking:</strong> {order.tracking_note}</p>}
          </div>
          <div className="panel">
            <p className="panel__title">Payments</p>
            {order.payments.length === 0 ? <p className="muted">None started.</p> : (
              <ul className="stack stack--tight">
                {order.payments.map((p) => (
                  <li key={p.id} className="stack stack--tight">
                    <div className="row row--between"><StatusBadge kind="payment" status={p.status} /><span className="money">{formatINR(p.amount_paise)}</span></div>
                    <span className="small muted">Razorpay order {p.provider_order_id}{p.provider_payment_id ? ` · payment ${p.provider_payment_id}` : ''}</span>
                    {p.failure_reason && <span className="small muted">Last failure: {p.failure_reason}</span>}
                    {p.refund_required && <span className="badge badge--bad"><i aria-hidden="true" />Refund required</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
