import { ORDER_STATUS, PAYMENT_STATUS } from '../../lib/statusLabels'

export default function StatusBadge({ kind = 'order', status }) {
  const [label, tone] = (kind === 'payment' ? PAYMENT_STATUS : ORDER_STATUS)[status] ?? [status, 'neutral']
  return <span className={`badge badge--${tone}`}><i aria-hidden="true" />{label}</span>
}
