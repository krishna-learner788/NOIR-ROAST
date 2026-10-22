// Directional entrances for the NEW pages (shop, product, account...). Additive on purpose:
// the original motion files (Reveal, Figure, Hero, Craft*) are untouched, so the homepage keeps
// exactly the behaviour it shipped with. Same tokens, same viewport rule, same reduced-motion
// handling (MotionConfig reducedMotion="user" strips x/y/scale and keeps the opacity fade).
import { useRef } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { dur, ease, viewport } from './tokens'
import useParallaxEnabled from './useParallaxEnabled'
import './directional.css'

const OFFSET = {
  up: { y: 24 },
  down: { y: -24 },
  left: { x: -56 },
  right: { x: 56 },
  depth: { scale: 0.94, y: 12 },
}

const entrance = (from = 'up', delay = 0) => ({
  hidden: { opacity: 0, ...(OFFSET[from] ?? OFFSET.up) },
  show: { opacity: 1, x: 0, y: 0, scale: 1, transition: { duration: dur.reveal, ease: ease.out, delay } },
})

/** Scroll-triggered entrance from a chosen direction: up | down | left | right | depth. */
export function RevealFrom({ as = 'div', from = 'up', delay = 0, className, children, ...rest }) {
  const Tag = motion[as]
  return (
    <Tag className={className} variants={entrance(from, delay)} initial="hidden" whileInView="show" viewport={viewport} {...rest}>
      {children}
    </Tag>
  )
}

/** Child of the original <RevealGroup>: inherits its stagger, enters from `from`. */
export function RevealItemFrom({ as = 'div', from = 'up', className, children, ...rest }) {
  const Tag = motion[as]
  return (
    <Tag className={className} variants={entrance(from)} {...rest}>
      {children}
    </Tag>
  )
}

const HIDDEN_CLIP = {
  left: 'inset(0 100% 0 0)',
  right: 'inset(0 0 0 100%)',
  top: 'inset(0 0 100% 0)',
  bottom: 'inset(100% 0 0 0)',
}

/**
 * Image frame that is unmasked from a chosen edge while the image settles from a slight zoom,
 * with optional scroll parallax (tablet and up, never under reduced motion). Fixed aspect ratio,
 * so nothing shifts when it reveals.
 */
export function MaskImage({ src, alt, width, height, ratio = '4 / 5', from = 'left', parallax = true, eager = false, objectPosition, className = '' }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const enabled = useParallaxEnabled() && parallax
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], ['-6%', '6%'])

  return (
    <div ref={ref} className={`mask-image ${className}`} style={{ aspectRatio: ratio }}>
      <motion.div
        className="mask-image__clip"
        initial={reduce ? false : { clipPath: HIDDEN_CLIP[from] ?? HIDDEN_CLIP.left }}
        animate={eager ? { clipPath: 'inset(0 0 0 0)', transition: { duration: dur.image, ease: ease.out } } : undefined}
        whileInView={eager ? undefined : { clipPath: 'inset(0 0 0 0)', transition: { duration: dur.image, ease: ease.out } }}
        viewport={viewport}
      >
        <motion.div
          className="mask-image__move"
          style={enabled ? { y } : undefined}
          initial={{ scale: 1.12 }}
          animate={eager ? { scale: 1, transition: { duration: dur.image * 1.2, ease: ease.out } } : undefined}
          whileInView={eager ? undefined : { scale: 1, transition: { duration: dur.image * 1.2, ease: ease.out } }}
          viewport={viewport}
        >
          <img
            className="mask-image__img"
            src={src}
            alt={alt}
            width={width}
            height={height}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            style={objectPosition ? { objectPosition } : undefined}
          />
        </motion.div>
      </motion.div>
    </div>
  )
}
