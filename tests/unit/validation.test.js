import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  INDIAN_STATES, MAX_QTY_PER_LINE, isUuid, normalizePhone, validateEmail, validateOrderItems, validateShipping,
} from '../../supabase/functions/_shared/validation.js'

const valid = { name: 'Asha Rao', phone: '98765 43210', line1: '12, MG Road', line2: '', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' }

describe('normalizePhone', () => {
  it('reduces common Indian formats to 10 digits', () => {
    for (const v of ['9876543210', '+91 98765 43210', '+919876543210', '919876543210', '09876543210', '98765-43210', '(98765) 43210']) {
      assert.equal(normalizePhone(v), '9876543210', v)
    }
  })
})

describe('validateShipping', () => {
  it('accepts a complete address and returns normalised values', () => {
    const r = validateShipping(valid)
    assert.equal(r.ok, true)
    assert.equal(r.value.phone, '9876543210')
    assert.deepEqual(r.errors, {})
  })
  it('collapses whitespace and trims', () => {
    assert.equal(validateShipping({ ...valid, name: '  Asha   Rao ' }).value.name, 'Asha Rao')
  })
  it('reports a message per bad field', () => {
    const r = validateShipping({ name: 'A', phone: '12345', line1: 'x', city: '', state: 'Narnia', pincode: '012345' })
    assert.equal(r.ok, false)
    assert.deepEqual(Object.keys(r.errors).sort(), ['city', 'line1', 'name', 'phone', 'pincode', 'state'])
  })
  it('enforces mobile (starts 6-9) and PIN (6 digits, not starting 0) rules', () => {
    assert.ok(validateShipping({ ...valid, phone: '5876543210' }).errors.phone)
    assert.ok(validateShipping({ ...valid, pincode: '56000' }).errors.pincode)
    assert.ok(validateShipping({ ...valid, pincode: '5600011' }).errors.pincode)
    assert.ok(validateShipping({ ...valid, pincode: '056001' }).errors.pincode)
  })
  it('never throws on junk input', () => {
    for (const junk of [null, undefined, 5, 'x', [], { name: {}, phone: [] }]) assert.doesNotThrow(() => validateShipping(junk))
    assert.equal(validateShipping(null).ok, false)
  })
  it('lists 28 states and 8 union territories, matching the database function', () => {
    assert.equal(INDIAN_STATES.length, 36)
    const sql = readFileSync(new URL('../../supabase/migrations/20261022000001_core_schema.sql', import.meta.url), 'utf8')
    const start = sql.indexOf('create function public.is_indian_state')
    const fn = sql.slice(start, sql.indexOf('$$;', start))
    const body = fn.slice(fn.indexOf('array['))
    const inSql = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1])
    assert.deepEqual(inSql, INDIAN_STATES)
  })
})

describe('validateEmail', () => {
  it('lower-cases valid emails and rejects bad ones', () => {
    assert.deepEqual(validateEmail(' Asha@Example.COM '), { ok: true, value: 'asha@example.com' })
    for (const bad of ['', 'a', 'a@b', '@b.co', 'a b@c.co', null]) assert.equal(validateEmail(bad).ok, false, String(bad))
  })
})

describe('validateOrderItems', () => {
  it('accepts well-formed lines', () => {
    const r = validateOrderItems([{ product_id: 'noir-reserve', quantity: 2 }])
    assert.equal(r.ok, true)
    assert.deepEqual(r.value, [{ product_id: 'noir-reserve', quantity: 2 }])
  })
  it('strips everything except product_id and quantity, so no price can ride along', () => {
    const r = validateOrderItems([{ product_id: 'noir-reserve', quantity: 1, price_paise: 1, total: 0 }])
    assert.deepEqual(Object.keys(r.value[0]).sort(), ['product_id', 'quantity'])
  })
  it('rejects empty, oversized, duplicate and invalid quantities', () => {
    assert.equal(validateOrderItems([]).ok, false)
    assert.equal(validateOrderItems('x').ok, false)
    assert.equal(validateOrderItems(Array.from({ length: 21 }, (_, i) => ({ product_id: `p-${i}`, quantity: 1 }))).ok, false)
    assert.equal(validateOrderItems([{ product_id: 'a', quantity: 1 }, { product_id: 'a', quantity: 1 }]).ok, false)
    for (const quantity of [1.5, '2', 0, -1, MAX_QTY_PER_LINE + 1, NaN, null]) {
      assert.equal(validateOrderItems([{ product_id: 'a', quantity }]).ok, false, String(quantity))
    }
  })
  it('rejects malformed ids', () => {
    for (const product_id of ['', 'Has Caps', 'a_b', '-a', 'a--b', 5, null, 'x'.repeat(61)]) {
      assert.equal(validateOrderItems([{ product_id, quantity: 1 }]).ok, false, String(product_id))
    }
  })
})

describe('isUuid', () => {
  it('recognises UUIDs only', () => {
    assert.equal(isUuid('a0000000-0000-0000-0000-000000000001'), true)
    assert.equal(isUuid('not-a-uuid'), false)
    assert.equal(isUuid(undefined), false)
  })
})
