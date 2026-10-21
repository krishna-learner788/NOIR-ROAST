import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValueEvent, useScroll, useTransform } from 'framer-motion'
import { ease } from '../../motion/tokens'
import './CraftJourney.css'

// The story, as data. Each chapter owns a scroll window: [fade-in start, fully in, fade-out start, gone].
const CHAPTERS = [
  {
    num: '01',
    label: 'Sourcing',
    title: ['Chosen', ['at ', { em: 'altitude' }]],
    text: 'Dense, slow-ripened cherries from farms above 1,800 metres. We cup every lot and buy only what surprises us on the table.',
    win: [0, 0, 0.17, 0.22],
  },
  {
    num: '02',
    label: 'Roasting',
    title: ['Slow heat,', ['steady ', { em: 'hands' }]],
    text: 'A small drum, low and slow. Sugars caramelise, the green turns to gold, then to brown, and the whole room smells of toasted bread.',
    win: [0.24, 0.29, 0.4, 0.45],
  },
  {
    num: '03',
    label: 'First crack',
    title: ['Listen for', ['the ', { em: 'crack' }]],
    text: 'Around 196°C the beans pop like dry wood. From here, seconds decide everything, so we stop by colour, sound and smell. Never a timer.',
    win: [0.47, 0.52, 0.64, 0.69],
  },
  {
    num: '04',
    label: 'Rest',
    title: ['Then we', [{ em: 'wait' }]],
    text: 'Five days of rest let the gas settle and the sweetness arrive. Roast date on the bag, and a plain note on how to brew it.',
    win: [0.89, 0.94, 1, 1],
    ink: true,
  },
]

const STAGES = [
  [0.2, 'Green'],
  [0.34, 'Drying'],
  [0.48, 'Browning'],
  [0.55, 'First crack'],
  [0.68, 'Development'],
  [0.86, 'Cooling'],
  [1.01, 'Resting'],
]

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
// Drum temperature along the story, in °C.
function tempAt(p) {
  if (p < 0.22) return 22 + smooth(0, 0.22, p) * 16
  if (p < 0.5) return 38 + smooth(0.22, 0.5, p) * 158
  if (p < 0.64) return 196 + smooth(0.5, 0.64, p) * 22
  return 218 - smooth(0.64, 0.98, p) * 194
}

function Title({ lines }) {
  return lines.map((line, i) => (
    <span className="jline" key={i}>
      {(Array.isArray(line) ? line : [line]).map((part, j) =>
        typeof part === 'string' ? part : <em key={j}>{part.em}</em>,
      )}
    </span>
  ))
}

function Panel({ chapter, progress, active }) {
  const [a, b, c, d] = chapter.win
  const opacity = useTransform(progress, [a, b, c, d], [a === b ? 1 : 0, 1, 1, c === d ? 1 : 0])
  const y = useTransform(progress, [a, b, c, d], [a === b ? 0 : 28, 0, 0, c === d ? 0 : -28])
  const ghostY = useTransform(progress, [a, d], [60, -60])
  return (
    <motion.article className={`panel${chapter.ink ? ' panel--ink' : ''}`} style={{ opacity }} aria-labelledby={`jt-${chapter.num}`}>
      <motion.span className="panel__ghost" aria-hidden="true" style={{ y: ghostY }}>{chapter.num}</motion.span>
      <motion.div className="panel__body" style={{ y }}>
        <p className="eyebrow panel__eyebrow">{chapter.num} — {chapter.label}</p>
        <h3 id={`jt-${chapter.num}`} className="panel__title"><Title lines={chapter.title} /></h3>
        <p className="panel__text">{chapter.text}</p>
        {chapter.ink && (
          <a href="#roasts" className="panel__cta" tabIndex={active ? 0 : -1}>
            <span>Choose your roast</span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </a>
        )}
      </motion.div>
    </motion.article>
  )
}

export default function CraftJourney({ onFail }) {
  const sectionRef = useRef(null)
  const canvasRef = useRef(null)
  const tempRef = useRef(null)
  const stageRef = useRef(null)
  const [ctaActive, setCtaActive] = useState(false)
  const [ready, setReady] = useState(false)
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] })

  // HUD driven directly from the scroll value (no React re-render per frame)
  useMotionValueEvent(scrollYProgress, 'change', (p) => {
    if (tempRef.current) tempRef.current.textContent = String(Math.round(tempAt(p)))
    if (stageRef.current) stageRef.current.textContent = (STAGES.find(([t]) => p < t) || STAGES[STAGES.length - 1])[1]
    setCtaActive((v) => (p > 0.9) === v ? v : p > 0.9)
  })

  // Load three + build the scene only when the section is about to be seen.
  useEffect(() => {
    const section = sectionRef.current
    const canvas = canvasRef.current
    let scene
    let cancelled = false
    let started = false

    const boot = async () => {
      if (started) return
      started = true
      try {
        const { createRoastScene } = await import('./craftScene.js')
        if (cancelled) return
        const mobile = window.matchMedia('(max-width: 767px)').matches
        const finePointer = window.matchMedia('(pointer: fine)').matches
        scene = createRoastScene(canvas, { getProgress: () => scrollYProgress.get(), mobile, finePointer })
        window.__roastStats = scene.stats // dev/inspection hook
        setReady(true)
      } catch (err) {
        console.warn('NOIR ROAST: WebGL scene unavailable, using static layout.', err)
        if (!cancelled) onFail?.()
      }
    }

    const io = new IntersectionObserver(([e]) => e.isIntersecting && boot(), { rootMargin: '1200px 0px' })
    io.observe(section)
    return () => {
      cancelled = true
      io.disconnect()
      scene?.dispose()
      delete window.__roastStats
    }
  }, [scrollYProgress, onFail])

  const progressScale = useTransform(scrollYProgress, [0, 1], [0, 1])
  const hudOpacity = useTransform(scrollYProgress, [0.8, 0.9], [1, 0])
  const scrimOpacity = useTransform(scrollYProgress, [0.78, 0.9], [1, 0])
  const hintOpacity = useTransform(scrollYProgress, [0, 0.04], [1, 0])

  return (
    <section ref={sectionRef} id="craft" className="journey" data-theme="dark" aria-labelledby="craft-title">
      <h2 id="craft-title" className="sr-only">Our craft: from green bean to rested roast</h2>

      <div className="journey__stage">
        <canvas ref={canvasRef} className={`journey__canvas${ready ? ' is-ready' : ''}`} aria-hidden="true" />
        <motion.div className="journey__scrim" style={{ opacity: scrimOpacity }} aria-hidden="true" />

        <motion.div className="journey__top container" style={{ opacity: hudOpacity }}>
          <p className="eyebrow"><span className="section__num">02</span> Our craft</p>
        </motion.div>

        <div className="journey__panels container">
          {CHAPTERS.map((c) => (
            <Panel key={c.num} chapter={c} progress={scrollYProgress} active={ctaActive} />
          ))}
        </div>

        <motion.div className="journey__hud container" style={{ opacity: hudOpacity }} aria-hidden="true">
          <div className="hud__temp">
            <span className="hud__label">Drum</span>
            <span className="hud__value"><b ref={tempRef}>22</b>°C</span>
            <span ref={stageRef} className="hud__stage">Green</span>
          </div>
          <div className="hud__rail">
            <motion.i style={{ scaleY: progressScale }} transition={{ ease: ease.out }} />
            {CHAPTERS.map((c) => <span key={c.num}>{c.num}</span>)}
          </div>
        </motion.div>

        <motion.p className="journey__hint" style={{ opacity: hintOpacity }} aria-hidden="true">
          Scroll to roast
        </motion.p>
      </div>
    </section>
  )
}
