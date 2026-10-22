// Pure helpers for the shop listing (no React), so they can be tested with `npm test`.

export const SORTS = [
  { key: 'featured', label: 'Featured' },
  { key: 'price-asc', label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
  { key: 'roast-asc', label: 'Roast: light to dark' },
  { key: 'roast-desc', label: 'Roast: dark to light' },
  { key: 'name', label: 'Name: A to Z' },
]

const by = (fn, dir = 1) => (a, b) => {
  const x = fn(a)
  const y = fn(b)
  if (x === y) return 0
  if (x == null) return 1 // unknown values sort last in either direction
  if (y == null) return -1
  return (x < y ? -1 : 1) * dir
}

/** Returns a new array; `featured` keeps the catalogue's own (database sort_order) order. */
export function sortProducts(products, key = 'featured') {
  const list = [...products]
  switch (key) {
    case 'price-asc': return list.sort(by((p) => p.pricePaise))
    case 'price-desc': return list.sort(by((p) => p.pricePaise, -1))
    case 'roast-asc': return list.sort(by((p) => p.level))
    case 'roast-desc': return list.sort(by((p) => p.level, -1))
    case 'name': return list.sort(by((p) => p.name.toLowerCase()))
    default: return list
  }
}

/** Distinct roast labels in light -> dark order, for the filter chips. */
export function roastOptions(products) {
  const seen = new Map()
  for (const p of products) if (p.levelLabel && !seen.has(p.levelLabel)) seen.set(p.levelLabel, p.level ?? 0)
  return [...seen].sort((a, b) => a[1] - b[1]).map(([label]) => label)
}

export function filterProducts(products, { roast = '', query = '' } = {}) {
  const q = query.trim().toLowerCase()
  return products.filter((p) => {
    if (roast && p.levelLabel !== roast) return false
    if (!q) return true
    return [p.name, p.origin, ...(p.notes ?? [])].some((v) => String(v ?? '').toLowerCase().includes(q))
  })
}
