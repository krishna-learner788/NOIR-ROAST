import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import Notice from '../../components/ui/Notice'
import StatusBadge from '../../components/ui/StatusBadge'
import { formatDateTime } from '../../lib/format'
import { formatINR } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import useAsync from '../../lib/useAsync'

const PAGE = 25
const STATUSES = ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'expired']

// PostgREST `or()` filters are comma/paren-delimited: strip those (and LIKE wildcards) from the search text.
const cleanQuery = (q) => q.replace(/[%,()\\*]/g, ' ').trim().slice(0, 60)

export default function AdminOrders() {
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const [applied, setApplied] = useState('')
  const [page, setPage] = useState(0)

  const { data, loading, error, reload } = useAsync(async () => {
    let q = supabase
      .from('orders')
      .select('id, order_number, status, total_paise, created_at, contact_email, ship_name, payments(status, refund_required)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (status) q = q.eq('status', status)
    const s = cleanQuery(applied)
    if (s) q = q.or(`order_number.ilike.%${s}%,contact_email.ilike.%${s}%,ship_name.ilike.%${s}%`)
    const { data: rows, count, error: e } = await q
    if (e) throw e
    return { rows, count }
  }, [status, applied, page])

  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE)) : 1

  return (
    <div className="stack">
      <form
        className="row"
        style={{ alignItems: 'end' }}
        onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied(query) }}
        role="search"
        aria-label="Search orders"
      >
        <Field id="ao-search" label="Search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Order no., email or name" />
        <Field id="ao-status" as="select" label="Status" value={status} onChange={(e) => { setPage(0); setStatus(e.target.value) }}>
          <option value="">All</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </Field>
        <Button type="submit" variant="secondary">Search</Button>
      </form>

      {error && <Notice tone="error" title="Orders could not be loaded"><p><button type="button" className="link-inline" onClick={reload}>Try again</button></p></Notice>}
      {loading && !data && <p className="muted" role="status">Loading orders…</p>}

      {data && (
        <>
          <p className="small muted" role="status" aria-live="polite">{data.count} {data.count === 1 ? 'order' : 'orders'}</p>
          {data.rows.length === 0 ? <p className="muted">No orders match.</p> : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Orders, newest first</caption>
                <thead><tr><th scope="col">Order</th><th scope="col">Placed</th><th scope="col">Customer</th><th scope="col">Status</th><th scope="col">Flags</th><th scope="col" className="num">Total</th></tr></thead>
                <tbody>
                  {data.rows.map((o) => (
                    <tr key={o.id}>
                      <td><Link to={`/admin/orders/${o.id}`}>{o.order_number}</Link></td>
                      <td>{formatDateTime(o.created_at)}</td>
                      <td>{o.ship_name}<br /><span className="small muted">{o.contact_email}</span></td>
                      <td><StatusBadge status={o.status} /></td>
                      <td>{o.payments.some((p) => p.refund_required) && <span className="badge badge--bad"><i aria-hidden="true" />Refund needed</span>}</td>
                      <td className="num money">{formatINR(o.total_paise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div className="row">
              <Button type="button" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="small muted">Page {page + 1} of {pages}</span>
              <Button type="button" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
