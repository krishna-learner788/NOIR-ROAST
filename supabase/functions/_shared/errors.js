// One catalogue of error codes -> [HTTP status, customer-facing message].
// The Edge Functions return { error: { code, message } }; the browser shows `message` (or maps `code`).
// Internal detail (SQL text, stack traces, provider bodies) is never returned to the client.
export const ERRORS = {
  unauthorized:            [401, 'Please sign in to continue.'],
  bad_request:             [400, 'The request was not valid.'],
  method_not_allowed:      [405, 'Method not allowed.'],
  validation_failed:       [422, 'Please check the highlighted fields.'],
  invalid_items:           [422, 'Your bag contains an item that is not valid.'],
  invalid_quantity:        [422, 'One of the quantities in your bag is out of range.'],
  duplicate_item:          [422, 'The same product appears twice in your bag.'],
  invalid_shipping:        [422, 'Please check your delivery details.'],
  order_too_large:         [422, 'This order is larger than we can process online.'],
  product_unavailable:     [409, 'One of the products in your bag is no longer available.'],
  out_of_stock:            [409, 'One of the products in your bag does not have enough stock.'],
  too_many_pending_orders: [429, 'You have several unpaid orders. Please complete or cancel one before placing another.'],
  order_not_found:         [404, 'We could not find that order.'],
  order_not_payable:       [409, 'This order can no longer be paid.'],
  order_expired:           [409, 'This order has expired. Please place it again.'],
  checkout_not_permitted:  [403, 'Online checkout is not open yet.'],
  payment_provider_error:  [502, 'The payment provider could not be reached. Please try again.'],
  invalid_signature:       [400, 'The payment could not be verified.'],
  payment_mismatch:        [409, 'The payment did not match the order.'],
  amount_mismatch:         [409, 'The payment amount did not match the order total.'],
  internal_error:          [500, 'Something went wrong on our side. Please try again.'],
}

export function errorBody(code) {
  const [, message] = ERRORS[code] ?? ERRORS.internal_error
  return { error: { code: ERRORS[code] ? code : 'internal_error', message } }
}

export const errorStatus = (code) => (ERRORS[code] ?? ERRORS.internal_error)[0]

/** Map a PostgREST/Postgres error (from rpc) to one of our codes. Unknown errors become internal_error. */
export function codeFromDbError(error) {
  const msg = error?.message
  if (msg && ERRORS[msg]) return msg
  if (error?.code === '23514') return 'invalid_shipping' // CHECK violation on shipping fields
  return 'internal_error'
}
