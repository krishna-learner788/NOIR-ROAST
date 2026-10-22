// Pure cart logic — no React, no DOM — so it can be unit-tested with `npm test`.
//
// TRUST MODEL: the cart holds only { productId, quantity }. Prices are never stored in the
// cart or in localStorage; they are looked up from the catalogue at render time. Anything in
// localStorage is user-editable, so it is re-validated on every load. When checkout exists,
// send `toOrderRequest(items)` to the server, which must re-read prices and stock from the
// database and reject unknown ids or out-of-range quantities itself.
import { PRODUCTS, getProduct } from '../data/products.js'

export const STORAGE_KEY = 'noir-roast:cart'
export const STORAGE_VERSION = 1
export const MAX_QTY = 10 // per-line UX cap; the server enforces its own limits and real stock

const toQty = (n) => {
  const q = Math.floor(Number(n))
  return Number.isFinite(q) ? Math.min(MAX_QTY, Math.max(1, q)) : 1
}

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

// Keep only well-formed lines, merge duplicates, clamp quantities. With a catalogue, also drop
// unknown products. Pass `null` for shape-only checks (used before the catalogue has loaded, so a
// restored cart is not wiped while products are still being fetched).
export function sanitizeItems(raw, catalogue = PRODUCTS) {
  if (!Array.isArray(raw)) return []
  const merged = new Map()
  for (const entry of raw) {
    const id = entry && typeof entry.productId === 'string' && ID_RE.test(entry.productId) && entry.productId.length <= 60
      ? entry.productId
      : null
    if (!id || (catalogue && !getProduct(id, catalogue))) continue
    merged.set(id, toQty((merged.get(id) ?? 0) + toQty(entry.quantity)))
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }))
}

export function addItem(items, productId, qty = 1, catalogue = PRODUCTS) {
  if (!getProduct(productId, catalogue)) return items
  const current = items.find((i) => i.productId === productId)
  if (!current) return [...items, { productId, quantity: toQty(qty) }]
  return items.map((i) => (i.productId === productId ? { ...i, quantity: toQty(i.quantity + qty) } : i))
}

// qty <= 0 removes the line.
export function setQuantity(items, productId, qty) {
  if (!(qty > 0)) return removeItem(items, productId)
  return items.map((i) => (i.productId === productId ? { ...i, quantity: toQty(qty) } : i))
}

export function removeItem(items, productId) {
  return items.filter((i) => i.productId !== productId)
}

export function cartReducer(items, action) {
  switch (action.type) {
    case 'add': return addItem(items, action.productId, action.qty ?? 1, action.catalogue)
    case 'setQuantity': return setQuantity(items, action.productId, action.qty)
    case 'remove': return removeItem(items, action.productId)
    case 'clear': return []
    case 'replace': return sanitizeItems(action.items, action.catalogue)
    case 'prune': return sanitizeItems(items, action.catalogue) // drop lines the live catalogue no longer has
    default: return items
  }
}

// Display summary. Prices come from the catalogue, never from the stored cart.
export function summarize(items, catalogue = PRODUCTS) {
  const lines = []
  for (const { productId, quantity } of items) {
    const product = getProduct(productId, catalogue)
    if (!product) continue
    lines.push({ product, quantity, lineTotalPaise: product.pricePaise * quantity })
  }
  return {
    lines,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    subtotalPaise: lines.reduce((sum, l) => sum + l.lineTotalPaise, 0),
    hasProvisionalPrices: lines.some((l) => l.product.priceStatus === 'provisional'),
  }
}

// The only cart data that should ever be sent to a server: ids and quantities, no prices.
export function toOrderRequest(items) {
  return items.map(({ productId, quantity }) => ({ productId, quantity }))
}

// Which "Remove" button should take focus once the line at `index` is gone, given how many
// lines remain: the one now in its place (or the last), or -1 when the bag is empty.
export function focusIndexAfterRemove(index, remainingCount) {
  return remainingCount > 0 ? Math.min(index, remainingCount - 1) : -1
}

// Pre-filled order enquiry. Weights and prices are unconfirmed, so say so; no prices are sent.
export function buildOrderEmail(lines) {
  const list = lines
    .map((l) => {
      const { name, weight, weightStatus } = l.product
      return `- ${name} (${weightStatus === 'provisional' ? `${weight}, provisional weight` : weight}) x ${l.quantity}`
    })
    .join('\n')
  const body = `Hello NOIR ROAST,\n\nI'd like to order:\n${list}\n\nNote: weights and prices shown on the site are provisional and not yet confirmed. Please confirm them, how to pay, and when it ships.\n`
  return `mailto:hello@noirroast.example?subject=${encodeURIComponent('Order enquiry')}&body=${encodeURIComponent(body)}`
}

// --- persistence (storage is injected so tests don't need a browser) ---

export function readStoredCart(storage, catalogue = PRODUCTS) { // catalogue = null -> shape-only
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null')
    if (!parsed || parsed.v !== STORAGE_VERSION) return []
    return sanitizeItems(parsed.items, catalogue)
  } catch {
    return []
  }
}

export function writeStoredCart(storage, items) {
  try {
    if (!storage) return
    if (items.length === 0) storage.removeItem(STORAGE_KEY)
    else storage.setItem(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, items: toOrderRequest(items) }))
  } catch {
    // Storage can be full or blocked (private mode); the bag still works for this visit.
  }
}
