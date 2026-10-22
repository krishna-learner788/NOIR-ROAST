// Guards the original NOIR ROAST look and motion. Every file listed in tests/protected-files.json
// (hero, 3D craft journey, reveals, parallax, image frame, tokens, original CSS, design system and
// photography) must be byte-identical to the baseline commit. New motion lives in new files
// (src/motion/directional.jsx, ...). If you DELIBERATELY change an original file, update the
// baseline with scripts/update-protected-files.mjs and say so in the commit message.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const manifest = JSON.parse(readFileSync(new URL('../protected-files.json', import.meta.url), 'utf8'))
const root = new URL('../../', import.meta.url)

const sha = (buf) => createHash('sha256').update(buf).digest('hex')

describe(`original files are unchanged since baseline ${manifest.baseline.slice(0, 7)}`, () => {
  const entries = Object.entries(manifest.files)
  it('protects a meaningful set of files', () => {
    assert.ok(entries.length >= 30)
    assert.ok(entries.some(([p]) => p.endsWith('CraftJourney.jsx')))
    assert.ok(entries.some(([p]) => p.endsWith('Hero.jsx')))
    assert.ok(entries.some(([p]) => p.endsWith('hero-beans.jpg')))
  })
  for (const [path, { text, sha256 }] of entries) {
    it(path, () => {
      const buf = readFileSync(new URL(path, root))
      const actual = text ? sha(Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'))) : sha(buf)
      assert.equal(actual, sha256, `${path} differs from the original. If intentional, run scripts/update-protected-files.mjs`)
    })
  }
})
