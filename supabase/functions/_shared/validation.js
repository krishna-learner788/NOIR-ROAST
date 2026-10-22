// Input validation shared by the browser (instant feedback) and the Edge Functions (the real gate).
// Pure ES module: no DOM, no Deno, no Node APIs, so it runs in all three places and in tests.
// The database enforces the same rules with CHECK constraints, so a bug here cannot let bad data in.

// Keep in sync with public.is_indian_state() in the schema migration (tests/validation.test.js).
export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
]

export const MAX_QTY_PER_LINE = 10
export const MAX_LINES = 20

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const PINCODE_RE = /^[1-9][0-9]{5}$/
const MOBILE_RE = /^[6-9][0-9]{9}$/
const PRODUCT_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

const str = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '')

/** "+91 98765-43210", "098765 43210", "9876543210" -> "9876543210" (digits only, no country code). */
export function normalizePhone(value) {
  let d = String(value ?? '').replace(/[\s\-()]/g, '')
  if (d.startsWith('+91')) d = d.slice(3)
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return d
}

export function validateEmail(value) {
  const v = str(value).toLowerCase()
  return EMAIL_RE.test(v) && v.length <= 254 ? { ok: true, value: v } : { ok: false, error: 'Enter a valid email address.' }
}

/** Returns { ok, value, errors } where errors is { field: message }. Never throws. */
export function validateShipping(raw) {
  const input = raw && typeof raw === 'object' ? raw : {}
  const errors = {}
  const value = {
    name: str(input.name),
    phone: normalizePhone(input.phone),
    line1: str(input.line1),
    line2: str(input.line2),
    city: str(input.city),
    state: str(input.state),
    pincode: String(input.pincode ?? '').replace(/\s/g, ''),
  }
  if (value.name.length < 2 || value.name.length > 120) errors.name = 'Enter the recipient’s full name.'
  if (!MOBILE_RE.test(value.phone)) errors.phone = 'Enter a 10-digit Indian mobile number.'
  if (value.line1.length < 3 || value.line1.length > 200) errors.line1 = 'Enter the street address (house, building, street).'
  if (value.line2.length > 200) errors.line2 = 'Keep this under 200 characters.'
  if (value.city.length < 2 || value.city.length > 80) errors.city = 'Enter the city or town.'
  if (!INDIAN_STATES.includes(value.state)) errors.state = 'Choose a state or union territory.'
  if (!PINCODE_RE.test(value.pincode)) errors.pincode = 'Enter a valid 6-digit PIN code.'
  return { ok: Object.keys(errors).length === 0, value, errors }
}

/**
 * Validates the *shape* of cart lines sent to checkout: [{ product_id, quantity }].
 * It deliberately cannot validate prices — there are none in the request, and the server
 * never accepts any. Existence, availability and stock are checked in the database.
 */
export function validateOrderItems(raw, { maxQty = MAX_QTY_PER_LINE, maxLines = MAX_LINES } = {}) {
  if (!Array.isArray(raw) || raw.length < 1) return { ok: false, error: 'Your bag is empty.' }
  if (raw.length > maxLines) return { ok: false, error: `A single order can have at most ${maxLines} different products.` }
  const seen = new Set()
  const value = []
  for (const line of raw) {
    const id = line && typeof line.product_id === 'string' ? line.product_id : ''
    const qty = line?.quantity
    if (!PRODUCT_ID_RE.test(id) || id.length > 60) return { ok: false, error: 'An item in your bag is not valid.' }
    if (!Number.isInteger(qty) || qty < 1 || qty > maxQty) return { ok: false, error: `Quantity must be between 1 and ${maxQty}.` }
    if (seen.has(id)) return { ok: false, error: 'The same product appears twice in your bag.' }
    seen.add(id)
    value.push({ product_id: id, quantity: qty })
  }
  return { ok: true, value }
}

export const isUuid = (v) =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
