import { useRef } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import useParallaxEnabled from '../../motion/useParallaxEnabled'
import Button from '../ui/Button'
import { dur, ease, stagger } from '../../motion/tokens'
import './Hero.css'

const HEADLINE = [
  ['The slow art'],
  ['of the ', { em: 'dark' }, ' roast'],
]

const META = [
  ['Origin', 'Yirgacheffe, Ethiopia'],
  ['Altitude', '1,950 m'],
  ['Roasted', 'Weekly, to order'],
]

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: dur.reveal, ease: ease.out, delay } },
})

export default function Hero() {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  // Parallax travel capped at 8% (design-system §6.3)
  const parallax = useParallaxEnabled()
  const reduce = useReducedMotion()
  const imgY = useTransform(scrollYProgress, [0, 1], ['0%', '8%'])

  return (
    <section ref={ref} id="top" className="hero" data-theme="dark" aria-labelledby="hero-title">
      <motion.div
        className="hero__media"
        style={parallax ? { y: imgY } : undefined}
        initial={reduce ? false : { scale: 1.08, clipPath: 'inset(8% 0 0 0)' }}
        animate={{ scale: 1, clipPath: 'inset(0% 0 0 0)', transition: { duration: dur.image, ease: ease.out } }}
      >
        <img
          src="/images/hero-beans.jpg"
          alt="Freshly roasted specialty coffee beans, close up, in low warm light"
          width="2000"
          height="1525"
          fetchPriority="high"
          decoding="async"
        />
      </motion.div>
      <div className="hero__scrim" aria-hidden="true" />

      <div className="container hero__inner">
        <motion.p className="eyebrow hero__eyebrow" {...fadeUp(0.2)}>
          <span className="hero__eyebrow-rule" aria-hidden="true" />
          Small-batch specialty coffee
        </motion.p>

        <h1 id="hero-title" className="hero__title">
          {HEADLINE.map((line, i) => (
            <span className="hero__line" key={i}>
              <motion.span
                className="hero__line-inner"
                initial={{ y: '105%' }}
                animate={{ y: '0%', transition: { duration: dur.reveal + 0.2, ease: ease.out, delay: 0.35 + i * stagger * 1.5 } }}
              >
                {line.map((part, j) =>
                  typeof part === 'string' ? part : <em key={j}>{part.em}</em>,
                )}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.p className="hero__lead" {...fadeUp(0.75)}>
          Single-origin beans, roasted slowly and shipped within days. Deep chocolate, dark cherry, a long copper finish.
        </motion.p>

        <motion.div className="hero__cta" {...fadeUp(0.9)}>
          <Button href="#roasts" arrow>Shop the roasts</Button>
          <Button href="#craft" variant="secondary">Our craft</Button>
        </motion.div>
      </div>

      <motion.dl className="container hero__meta" {...fadeUp(1.1)}>
        {META.map(([k, v]) => (
          <div key={k} className="hero__meta-item">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </motion.dl>
    </section>
  )
}
