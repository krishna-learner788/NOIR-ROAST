// Customer-facing wording for order and payment states. Colour is secondary: the label always says it.
export const ORDER_STATUS = {
  pending_payment: ['Awaiting payment', 'warn'],
  paid: ['Paid', 'good'],
  processing: ['Preparing', 'good'],
  shipped: ['Shipped', 'good'],
  delivered: ['Delivered', 'good'],
  cancelled: ['Cancelled', 'bad'],
  expired: ['Expired', 'bad'],
}

export const PAYMENT_STATUS = {
  created: ['Not paid yet', 'warn'],
  authorized: ['Authorised', 'warn'],
  captured: ['Paid', 'good'],
  failed: ['Attempt failed', 'bad'],
  refunded: ['Refunded', 'neutral'],
}

export const orderStatusLabel = (s) => ORDER_STATUS[s]?.[0] ?? s
export const paymentStatusLabel = (s) => PAYMENT_STATUS[s]?.[0] ?? s
