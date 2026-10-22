// Product catalogue — display data for the storefront.
//
// This file is the *client-side* catalogue. It exists to render the page and the bag.
// It is NOT a source of truth for payment: when checkout is built, the server re-reads
// price and availability from the database by `id` and ignores anything sent by the browser.
//
// Money is stored as integer paise (₹1 = 100 paise) to avoid floating-point rounding.
//
// `priceStatus: 'provisional'` marks placeholder prices that the owner has not confirmed.
// Weights come from the existing page copy and are likewise unconfirmed (`weightStatus`). There is no stock
// or variant data yet; both arrive with the database (Phase 2).
export const PRODUCTS = [
  {
    id: 'noir-reserve',
    name: 'Noir Reserve',
    origin: 'Yirgacheffe, Ethiopia',
    level: 5,
    levelLabel: 'Dark',
    notes: ['Dark cherry', 'Bittersweet cocoa', 'Smoked copper'],
    pricePaise: 89900,
    priceStatus: 'provisional',
    weight: '250 g',
    weightGrams: 250,
    weightStatus: 'provisional',
    img: { src: '/images/roast-noir.jpg', width: 1400, height: 933, alt: 'Dark roasted coffee beans scattered on a slate surface' },
    ratio: '5 / 4',
    feature: true,
  },
  {
    id: 'copper-hour',
    name: 'Copper Hour',
    origin: 'Huila, Colombia',
    level: 3,
    levelLabel: 'Medium',
    notes: ['Toasted hazelnut', 'Brown sugar', 'Orange peel'],
    pricePaise: 79900,
    priceStatus: 'provisional',
    weight: '250 g',
    weightGrams: 250,
    weightStatus: 'provisional',
    img: { src: '/images/roast-copper.jpg', width: 1400, height: 933, alt: 'Ground coffee and whole beans on a dark wooden board, seen from above' },
    ratio: '3 / 2',
  },
  {
    id: 'first-light',
    name: 'First Light',
    origin: 'Antigua, Guatemala',
    level: 2,
    levelLabel: 'Light',
    notes: ['Honey', 'Red apple', 'Jasmine'],
    pricePaise: 84900,
    priceStatus: 'provisional',
    weight: '250 g',
    weightGrams: 250,
    weightStatus: 'provisional',
    img: { src: '/images/roast-light.jpg', width: 1000, height: 1500, alt: 'Portafilters holding whole beans and freshly ground coffee on a pale steel counter' },
    ratio: '3 / 2',
    objectPosition: '50% 78%',
  },
]

export function getProduct(id, catalogue = PRODUCTS) {
  return catalogue.find((p) => p.id === id)
}

// "provisional weight and price" / "provisional price" / '' — one wording for every place a
// weight or price is shown, driven by the data so confirming a value removes its label.
export function provisionalNote(product) {
  const parts = []
  if (product.weightStatus === 'provisional') parts.push('weight')
  if (product.priceStatus === 'provisional') parts.push('price')
  return parts.length ? `provisional ${parts.join(' and ')}` : ''
}
