import { motion, useScroll, useSpring } from 'framer-motion'

/** 2px copper hairline at the very top of the viewport; transform-only. */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, restDelta: 0.001 })
  return (
    <motion.div
      aria-hidden="true"
      style={{
        scaleX,
        position: 'fixed',
        inset: '0 0 auto 0',
        height: 2,
        background: 'var(--copper-500)',
        transformOrigin: 'left',
        zIndex: 30,
        pointerEvents: 'none',
      }}
    />
  )
}
