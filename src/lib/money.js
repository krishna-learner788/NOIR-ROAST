const whole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const exact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Integer paise -> "₹899" / "₹1,299.50". Display only; never parse this back into a price.
export function formatINR(paise) {
  return (paise % 100 === 0 ? whole : exact).format(paise / 100)
}

// "899", "₹1,299.50", "10.5" -> integer paise. Exact (no floating point); null when not a valid
// amount with at most two decimals. Used by the admin product form.
export function parseRupeesToPaise(input) {
  const s = String(input ?? '').replace(/[₹,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [rupees, frac = ''] = s.split('.')
  return Number(rupees) * 100 + Number(frac.padEnd(2, '0'))
}

// Integer paise -> "899.50" for an editable input (no symbol, no grouping).
export const paiseToInput = (paise) => (paise / 100).toFixed(2).replace(/\.00$/, '')
