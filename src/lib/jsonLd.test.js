import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { serializeJsonLd } from './jsonLd.js'

describe('serializeJsonLd', () => {
  it('cannot be broken out of a script tag', () => {
    const out = serializeJsonLd({ description: 'x</script><img src=x onerror=alert(1)>' })
    assert.ok(!out.includes('<') && !out.includes('>'))
  })
  it('round-trips to exactly the same data', () => {
    const data = { name: 'Noir & Co', description: '</script> <b>"quoted"</b>', n: [1, 2], line: 'a\u2028b' }
    assert.deepEqual(JSON.parse(serializeJsonLd(data)), data)
  })
})
