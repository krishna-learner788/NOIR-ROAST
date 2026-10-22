// Regenerates tests/protected-files.json: SHA-256 of every "protected" original file as it was in
// the BASELINE commit (the original NOIR ROAST site). Run only when you deliberately accept a
// change to an original animation/design file:  node scripts/update-protected-files.mjs
// Hashes come from git history (not the working tree), so editing a file and re-running this
// cannot silently bless the edit unless you also move the baseline.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, writeFileSync } from 'node:fs'

const BASELINE = '4e76a697cc159c8fc3a41d0952520b943280fbf1' // "Initial NOIR ROAST website"

const TEXT = [
  'src/components/sections/Hero.jsx', 'src/components/sections/Hero.css',
  'src/components/sections/Craft.jsx', 'src/components/sections/Craft.css',
  'src/components/sections/CraftJourney.jsx', 'src/components/sections/CraftJourney.css',
  'src/components/sections/CraftStatic.jsx', 'src/components/sections/craftScene.js',
  'src/components/sections/Origins.jsx', 'src/components/sections/Origins.css',
  'src/components/sections/Journal.jsx', 'src/components/sections/Journal.css',
  'src/components/sections/Visit.jsx', 'src/components/sections/Visit.css',
  'src/components/sections/Roasts.css',
  'src/components/ui/Figure.jsx', 'src/components/ui/Figure.css',
  'src/components/ui/Button.jsx', 'src/components/ui/Button.css',
  'src/components/ui/ScrollProgress.jsx',
  'src/motion/Reveal.jsx', 'src/motion/tokens.js', 'src/motion/useParallaxEnabled.js',
  'src/index.css', 'design-system.md',
]
const images = readdirSync('public/images').map((f) => `public/images/${f}`)

const show = (path) => execFileSync('git', ['show', `${BASELINE}:${path}`], { maxBuffer: 64 * 1024 * 1024 })
const sha = (buf) => createHash('sha256').update(buf).digest('hex')
const lf = (buf) => Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'))

const files = {}
for (const p of TEXT) files[p] = { text: true, sha256: sha(lf(show(p))) }
for (const p of images) files[p] = { text: false, sha256: sha(show(p)) }

writeFileSync('tests/protected-files.json', `${JSON.stringify({ baseline: BASELINE, files }, null, 2)}\n`)
console.log(`Recorded ${Object.keys(files).length} protected files from ${BASELINE.slice(0, 7)}`)
