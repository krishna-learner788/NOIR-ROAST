import { useRef } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { dur, ease, viewport } from '../../motion/tokens'
import useParallaxEnabled from '../../motion/useParallaxEnabled'
import './Figure.css'

/**
 * Image frame with a clip-path wipe + scale settle on reveal, optional scroll parallax,
 * and a hover zoom that happens inside a fixed-ratio frame (no layout shift).
 * `ratio` is a CSS aspect-ratio (e.g. "4 / 5"); width/height are intrinsic sizes of the file.
 */
export default function Figure({ src, alt, width, height, ratio = '4 / 5', parallax = true, zoom = false, eager = false, caption, className = '', objectPosition }) {
  const ref = useRef(null)
  const reduce = useReducedMotion()
  const enabled = useParallaxEnabled() && parallax
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], ['-5%', '5%'])

  return (
    <figure className={`figure ${className}`}>
      <div ref={ref} className="figure__frame" style={{ aspectRatio: ratio }}>
        <motion.div
          className="figure__clip"
          initial={reduce ? false : { clipPath: 'inset(10% 0 0 0)' }}
          whileInView={{ clipPath: 'inset(0% 0 0 0)', transition: { duration: dur.image, ease: ease.out } }}
          viewport={viewport}
        >
          <motion.div
            className="figure__move"
            style={enabled ? { y } : undefined}
            initial={{ scale: 1.08 }}
            whileInView={{ scale: 1, transition: { duration: dur.image, ease: ease.out } }}
            viewport={viewport}
          >
            <img
              className={zoom ? 'figure__img figure__img--zoom' : 'figure__img'}
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
      {caption && <figcaption className="figure__caption">{caption}</figcaption>}
    </figure>
  )
}
