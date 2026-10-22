import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatINR, paiseToInput, parseRupeesToPaise } from './money.js'

describe('parseRupeesToPaise', () => {
  it('parses whole and fractional rupees exactly', () => {
    assert.equal(parseRupeesToPaise('899'), 89900)
    assert.equal(parseRupeesToPaise('899.5'), 89950)
    assert.equal(parseRupeesToPaise('899.50'), 89950)
    assert.equal(parseRupeesToPaise('₹1,299.05'), 129905)
    assert.equal(parseRupeesToPaise(' 0.07 '), 7)
  })
  it('avoids floating-point drift (19.99 * 100 is 1998.9999999999998 in JS)', () => {
    assert.equal(parseRupeesToPaise('19.99'), 1999)
    assert.equal(parseRupeesToPaise('1.15'), 115)
  })
  it('rejects anything that is not a plain amount with at most two decimals', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1e3', '1,2,3.4x', '.5', '5.', null, undefined]) {
      assert.equal(parseRupeesToPaise(bad), null, String(bad))
    }
  })
  it('round-trips with paiseToInput', () => {
    for (const paise of [1, 7, 100, 89900, 89950, 129905]) assert.equal(parseRupeesToPaise(paiseToInput(paise)), paise)
  })
})

describe('formatINR', () => {
  it('uses Indian digit grouping', () => {
    assert.equal(formatINR(10000000), '₹1,00,000')
  })
})
