// Loads Razorpay's official Checkout script on demand (never at page load) and opens it.
// The browser only ever receives the public KEY ID; the signature it gets back is a CLAIM that
// the server verifies (see supabase/functions/verify-payment). Nothing here marks an order paid.
const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js'
let loading

export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay)
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT_URL
    s.async = true
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('razorpay_unavailable')))
    s.onerror = () => {
      loading = undefined
      s.remove()
      reject(new Error('razorpay_unavailable'))
    }
    document.head.appendChild(s)
  })
  return loading
}

/**
 * Opens Checkout for a server-created Razorpay order.
 * Resolves { dismissed: false, response } when the customer completes payment in the modal, or
 * { dismissed: true } when they close it. Rejects if the script cannot load.
 */
export async function openCheckout({ session, prefill, description }) {
  const Razorpay = await loadRazorpay()
  return new Promise((resolve) => {
    const rzp = new Razorpay({
      key: session.key_id,
      order_id: session.razorpay_order_id,
      amount: session.amount_paise,
      currency: session.currency,
      name: 'NOIR ROAST',
      description,
      prefill,
      theme: { color: '#C08A55' },
      handler: (response) => resolve({ dismissed: false, response }),
      modal: { ondismiss: () => resolve({ dismissed: true }), escape: true, confirm_close: true },
    })
    // A failed attempt keeps the modal open so the customer can retry; the server learns about
    // the failure from the webhook, so there is nothing to record here.
    rzp.on('payment.failed', () => {})
    rzp.open()
  })
}
