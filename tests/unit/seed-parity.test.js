// The local catalogue (src/data/products.js) and the database seed (supabase/seed.sql) describe the
// same three roasts. This keeps them from drifting apart.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { PRODUCTS } from '../../src/data/products.js'

const sql = readFileSync(new URL('../../supabase/seed.sql', import.meta.url), 'utf8')
const ROW = /\('([a-z0-9-]+)', '([^']+)', '([^']+)', (\d), '([^']+)',\s*array\[([^\]]+)\], (\d+), '(\w+)',\s*(\d+), '(\w+)', (null|\d+), (true|false), (\d+),\s*'([^']+)', '([^']+)', (\d+), (\d+), (null|'[^']*')\)/g

const rows = [...sql.matchAll(ROW)].map((m) => ({
  id: m[1], name: m[2], origin: m[3], level: Number(m[4]), levelLabel: m[5],
  notes: [...m[6].matchAll(/'([^']+)'/g)].map((n) => n[1]),
  pricePaise: Number(m[7]), priceStatus: m[8], weightGrams: Number(m[9]), weightStatus: m[10],
  stock: m[11] === 'null' ? null : Number(m[11]), isActive: m[12] === 'true',
  imgSrc: m[14], imgAlt: m[15], imgWidth: Number(m[16]), imgHeight: Number(m[17]),
  objectPosition: m[18] === 'null' ? undefined : m[18].slice(1, -1),
}))

describe('seed.sql matches src/data/products.js', () => {
  it('parses every seeded product', () => {
    assert.equal(rows.length, PRODUCTS.length)
  })
  PRODUCTS.forEach((p, i) => {
    it(p.id, () => {
      const r = rows[i]
      assert.equal(r.id, p.id)
      assert.equal(r.name, p.name)
      assert.equal(r.origin, p.origin)
      assert.equal(r.level, p.level)
      assert.equal(r.levelLabel, p.levelLabel)
      assert.deepEqual(r.notes, p.notes)
      assert.equal(r.pricePaise, p.pricePaise)
      assert.equal(r.priceStatus, p.priceStatus)
      assert.equal(r.weightGrams, p.weightGrams)
      assert.equal(r.weightStatus, p.weightStatus)
      assert.equal(r.stock, null, 'stock is never invented')
      assert.equal(r.isActive, true)
      assert.equal(r.imgSrc, p.img.src)
      assert.equal(r.imgAlt, p.img.alt)
      assert.equal(r.imgWidth, p.img.width)
      assert.equal(r.imgHeight, p.img.height)
      assert.equal(r.objectPosition, p.objectPosition)
    })
  })
  it('keeps every seeded value provisional (no invented final data)', () => {
    for (const r of rows) {
      assert.equal(r.priceStatus, 'provisional')
      assert.equal(r.weightStatus, 'provisional')
    }
  })
})
