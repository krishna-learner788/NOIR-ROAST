import { callFunction } from './api'
import { openCheckout } from './razorpay'

/**
 * Runs the browser side of a payment for a server-created session.
 *   1. open Razorpay Checkout
 *   2. if the customer completes it, send the result to our server (verify-payment)
 * The server decides whether the order is paid. This returns the SERVER's verdict:
 *   'paid'      the server verified signature + provider record and marked the order paid
 *   'pending'   payment looks fine but confirmation is still in flight (webhook will finish it)
 *   'failed'    the provider reports the attempt failed
 *   'dismissed' the customer closed the payment window without paying
 */
export async function runPayment({ session, prefill, description }) {
  const result = await openCheckout({ session: session.payment, prefill, description })
  if (result.dismissed) return { outcome: 'dismissed' }
  const { data } = await callFunction('verify-payment', {
    razorpay_order_id: result.response.razorpay_order_id,
    razorpay_payment_id: result.response.razorpay_payment_id,
    razorpay_signature: result.response.razorpay_signature,
  })
  return { outcome: data.status }
}
