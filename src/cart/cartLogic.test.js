import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PRODUCTS, provisionalNote } from '../data/products.js'
import { formatINR } from '../lib/money.js'
import {
  MAX_QTY, STORAGE_KEY, addItem, buildOrderEmail, cartReducer, focusIndexAfterRemove, readStoredCart,
  removeItem, sanitizeItems, setQuantity, summarize, toOrderRequest, writeStoredCart,
} from './cartLogic.js'

const [A, B] = PRODUCTS
const fakeStorage = (initial = {}) => {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v) },
    removeItem: (k) => { delete data[k] },
  }
}

describe('catalogue', () => {
  it('has unique ids and integer-paise prices', () => {
    assert.equal(new Set(PRODUCTS.map((p) => p.id)).size, PRODUCTS.length)
    for (const p of PRODUCTS) {
      assert.ok(Number.isInteger(p.pricePaise) && p.pricePaise > 0, `${p.id} price`)
      assert.equal(p.priceStatus, 'provisional')
      assert.equal(p.weightStatus, 'provisional')
    }
  })
})

describe('add / quantity / remove', () => {
  it('adds a new line and increments an existing one', () => {
    let items = addItem([], A.id)
    assert.deepEqual(items, [{ productId: A.id, quantity: 1 }])
    items = addItem(items, A.id)
    assert.equal(items[0].quantity, 2)
  })

  it('ignores unknown products', () => {
    assert.deepEqual(addItem([], 'not-a-product'), [])
  })

  it('caps quantity at MAX_QTY', () => {
    assert.equal(addItem([{ productId: A.id, quantity: MAX_QTY }], A.id)[0].quantity, MAX_QTY)
    assert.equal(setQuantity([{ productId: A.id, quantity: 1 }], A.id, 999)[0].quantity, MAX_QTY)
  })

  it('setQuantity to 0 or below removes the line', () => {
    assert.deepEqual(setQuantity([{ productId: A.id, quantity: 3 }], A.id, 0), [])
  })

  it('removes only the targeted line', () => {
    const items = [{ productId: A.id, quantity: 1 }, { productId: B.id, quantity: 2 }]
    assert.deepEqual(removeItem(items, A.id), [{ productId: B.id, quantity: 2 }])
  })

  it('reducer handles add, setQuantity, remove, clear, replace', () => {
    let s = cartReducer([], { type: 'add', productId: A.id })
    s = cartReducer(s, { type: 'setQuantity', productId: A.id, qty: 4 })
    assert.equal(s[0].quantity, 4)
    s = cartReducer(s, { type: 'remove', productId: A.id })
    assert.deepEqual(s, [])
    assert.deepEqual(cartReducer([{ productId: A.id, quantity: 1 }], { type: 'clear' }), [])
    assert.deepEqual(cartReducer([], { type: 'replace', items: [{ productId: 'bogus', quantity: 1 }] }), [])
  })
})

describe('sanitizeItems (untrusted input)', () => {
  it('drops unknown ids, junk entries and non-arrays', () => {
    assert.deepEqual(sanitizeItems('nope'), [])
    assert.deepEqual(sanitizeItems([null, 7, {}, { productId: 'x', quantity: 1 }, { productId: 5, quantity: 1 }]), [])
  })

  it('merges duplicates and clamps quantities', () => {
    const out = sanitizeItems([
      { productId: A.id, quantity: 4 }, { productId: A.id, quantity: 9 },
      { productId: B.id, quantity: -3 }, { productId: B.id, quantity: 'abc' },
    ])
    assert.equal(out.find((i) => i.productId === A.id).quantity, MAX_QTY)
    assert.equal(out.find((i) => i.productId === B.id).quantity, 2)
  })
})

describe('summarize', () => {
  it('computes totals from catalogue prices only', () => {
    const items = [{ productId: A.id, quantity: 2 }, { productId: B.id, quantity: 1 }]
    const s = summarize(items)
    assert.equal(s.itemCount, 3)
    assert.equal(s.subtotalPaise, A.pricePaise * 2 + B.pricePaise)
    assert.equal(s.hasProvisionalPrices, true)
  })

  it('ignores any price smuggled into a stored line', () => {
    const tampered = [{ productId: A.id, quantity: 1, pricePaise: 1, price: 0 }]
    assert.equal(summarize(tampered).subtotalPaise, A.pricePaise)
  })
})

describe('order request', () => {
  it('contains ids and quantities only, never prices', () => {
    const req = toOrderRequest([{ productId: A.id, quantity: 2, pricePaise: 1 }])
    assert.deepEqual(req, [{ productId: A.id, quantity: 2 }])
  })
})

describe('persistence', () => {
  it('round-trips and never stores prices', () => {
    const storage = fakeStorage()
    writeStoredCart(storage, [{ productId: A.id, quantity: 3 }])
    const raw = storage.data[STORAGE_KEY]
    assert.ok(!/price/i.test(raw))
    assert.deepEqual(readStoredCart(storage), [{ productId: A.id, quantity: 3 }])
  })

  it('an empty cart clears the key', () => {
    const storage = fakeStorage()
    writeStoredCart(storage, [{ productId: A.id, quantity: 1 }])
    writeStoredCart(storage, [])
    assert.equal(STORAGE_KEY in storage.data, false)
  })

  it('survives corrupt, wrong-version or missing storage', () => {
    assert.deepEqual(readStoredCart(fakeStorage({ [STORAGE_KEY]: '{not json' })), [])
    assert.deepEqual(readStoredCart(fakeStorage({ [STORAGE_KEY]: JSON.stringify({ v: 99, items: [{ productId: A.id, quantity: 1 }] }) })), [])
    assert.deepEqual(readStoredCart(null), [])
  })

  it('re-validates edited storage on load', () => {
    const forged = JSON.stringify({ v: 1, items: [{ productId: A.id, quantity: 500 }, { productId: 'free-coffee', quantity: 1 }] })
    assert.deepEqual(readStoredCart(fakeStorage({ [STORAGE_KEY]: forged })), [{ productId: A.id, quantity: MAX_QTY }])
  })

  it('does not throw when storage throws', () => {
    const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('full') }, removeItem() { throw new Error('x') } }
    assert.deepEqual(readStoredCart(broken), [])
    assert.doesNotThrow(() => writeStoredCart(broken, [{ productId: A.id, quantity: 1 }]))
  })
})

describe('formatINR', () => {
  it('formats paise as rupees', () => {
    assert.match(formatINR(89900), /^₹899$/)
    assert.match(formatINR(129950), /^₹1,299\.50$/)
    assert.match(formatINR(10000000), /^₹1,00,000$/)
  })
})

describe('provisionalNote', () => {
  it('labels both weight and price while either is unconfirmed', () => {
    for (const p of PRODUCTS) assert.equal(provisionalNote(p), 'provisional weight and price')
  })

  it('labels only what is still unconfirmed, and nothing once confirmed', () => {
    assert.equal(provisionalNote({ weightStatus: 'confirmed', priceStatus: 'provisional' }), 'provisional price')
    assert.equal(provisionalNote({ weightStatus: 'provisional', priceStatus: 'confirmed' }), 'provisional weight')
    assert.equal(provisionalNote({ weightStatus: 'confirmed', priceStatus: 'confirmed' }), '')
  })
})

describe('buildOrderEmail', () => {
  const lines = summarize([{ productId: A.id, quantity: 2 }, { productId: B.id, quantity: 1 }]).lines
  const body = decodeURIComponent(buildOrderEmail(lines).split('&body=')[1])

  it('marks every weight as provisional and says prices are unconfirmed', () => {
    assert.ok(body.includes(`- ${A.name} (250 g, provisional weight) x 2`), body)
    assert.ok(body.includes(`- ${B.name} (250 g, provisional weight) x 1`), body)
    assert.match(body, /weights and prices shown on the site are provisional and not yet confirmed/)
  })

  it('never includes prices', () => {
    assert.ok(!body.includes('₹'))
    for (const p of PRODUCTS) assert.ok(!body.includes(String(p.pricePaise / 100)))
  })

  it('is a mailto link', () => {
    assert.match(buildOrderEmail(lines), /^mailto:[^?]+\?subject=/)
  })
})

describe('focusIndexAfterRemove', () => {
  it('picks the line now in the removed ones place, or the last', () => {
    assert.equal(focusIndexAfterRemove(0, 2), 0)
    assert.equal(focusIndexAfterRemove(1, 2), 1)
    assert.equal(focusIndexAfterRemove(2, 2), 1) // removed the last of three
  })

  it('returns -1 when the bag is empty', () => {
    assert.equal(focusIndexAfterRemove(0, 0), -1)
  })
})
