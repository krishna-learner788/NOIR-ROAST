import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import LinkButton from '../../components/ui/LinkButton'
import Notice from '../../components/ui/Notice'
import PageHero from '../../components/ui/PageHero'
import PageLoading from '../../components/ui/PageLoading'
import StatusBadge from '../../components/ui/StatusBadge'
import { usePageMeta } from '../../lib/meta'
import { formatINR } from '../../lib/money'
import { supabase } from '../../lib/supabase'
import useAsync from '../../lib/useAsync'
import { formatDate } from '../../lib/format'

export default function Orders() {
  usePageMeta({ title: 'Your orders', noindex: true })
  const { user } = useAuth()
  const { data: orders, loading, error, reload } = useAsync(async () => {
    // RLS already limits a customer to their own rows, but an ADMIN can read every order, so
    // this customer-facing list must filter by owner explicitly.
    const { data, error: e } = await supabase
      .from('orders')
      .select('id, order_number, status, total_paise, created_at, order_items(quantity)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (e) throw e
    return data
  }, [user.id])

  return (
    <>
      <PageHero eyebrow="Account" title={[['Your ', { em: 'orders' }]]} />
      <section className="page-body" data-theme="light">
        <div className="container stack">
          {loading && !orders && <PageLoading label="Loading your orders" />}
          {error && (
            <Notice tone="error" title="We could not load your orders">
              <p><button type="button" className="link-inline" onClick={reload}>Try again</button></p>
            </Notice>
          )}
          {orders?.length === 0 && (
            <div className="stack form-narrow">
              <p className="section-title">No orders yet</p>
              <p className="muted">When you place an order it will appear here.</p>
              <div><LinkButton to="/shop" arrow>Browse the roasts</LinkButton></div>
            </div>
          )}
          {orders?.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Your orders, newest first</caption>
                <thead>
                  <tr><th scope="col">Order</th><th scope="col">Placed</th><th scope="col">Items</th><th scope="col">Status</th><th scope="col" className="num">Total</th></tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td><Link to={`/orders/${o.id}`}>{o.order_number}</Link></td>
                      <td>{formatDate(o.created_at)}</td>
                      <td>{o.order_items.reduce((n, i) => n + i.quantity, 0)}</td>
                      <td><StatusBadge status={o.status} /></td>
                      <td className="num money">{formatINR(o.total_paise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
