import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PRODUCTS } from '../data/products.js'
import { filterProducts, roastOptions, sortProducts } from './sortFilter.js'

const ids = (list) => list.map((p) => p.id)

describe('sortProducts', () => {
  it('keeps catalogue order for "featured" and never mutates the input', () => {
    const copy = [...PRODUCTS]
    assert.deepEqual(ids(sortProducts(PRODUCTS, 'featured')), ids(PRODUCTS))
    sortProducts(PRODUCTS, 'price-desc')
    assert.deepEqual(PRODUCTS, copy)
  })
  it('sorts by price both ways', () => {
    assert.deepEqual(ids(sortProducts(PRODUCTS, 'price-asc')), ['copper-hour', 'first-light', 'noir-reserve'])
    assert.deepEqual(ids(sortProducts(PRODUCTS, 'price-desc')), ['noir-reserve', 'first-light', 'copper-hour'])
  })
  it('sorts by roast level and name', () => {
    assert.deepEqual(ids(sortProducts(PRODUCTS, 'roast-asc')), ['first-light', 'copper-hour', 'noir-reserve'])
    assert.deepEqual(ids(sortProducts(PRODUCTS, 'roast-desc')), ['noir-reserve', 'copper-hour', 'first-light'])
    assert.deepEqual(ids(sortProducts(PRODUCTS, 'name')), ['copper-hour', 'first-light', 'noir-reserve'])
  })
  it('puts products with an unknown roast level last in both directions', () => {
    const list = [{ id: 'x', name: 'X', level: null, pricePaise: 1 }, ...PRODUCTS]
    assert.equal(sortProducts(list, 'roast-asc').at(-1).id, 'x')
    assert.equal(sortProducts(list, 'roast-desc').at(-1).id, 'x')
  })
})

describe('roastOptions', () => {
  it('lists distinct roast labels from light to dark', () => {
    assert.deepEqual(roastOptions(PRODUCTS), ['Light', 'Medium', 'Dark'])
  })
})

describe('filterProducts', () => {
  it('filters by roast label', () => {
    assert.deepEqual(ids(filterProducts(PRODUCTS, { roast: 'Dark' })), ['noir-reserve'])
  })
  it('searches name, origin and tasting notes, case-insensitively', () => {
    assert.deepEqual(ids(filterProducts(PRODUCTS, { query: 'colombia' })), ['copper-hour'])
    assert.deepEqual(ids(filterProducts(PRODUCTS, { query: 'JASMINE' })), ['first-light'])
    assert.deepEqual(ids(filterProducts(PRODUCTS, { query: '  noir  ' })), ['noir-reserve'])
  })
  it('combines filters and returns everything when none are set', () => {
    assert.equal(filterProducts(PRODUCTS).length, 3)
    assert.deepEqual(filterProducts(PRODUCTS, { roast: 'Dark', query: 'jasmine' }), [])
  })
})
