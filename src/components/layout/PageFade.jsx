import { motion } from 'framer-motion'
import { dur, ease } from '../../motion/tokens'

// Page transition for inner routes (design-system §6.1: fade + 12px shift, 600ms, inOut).
// Not used for the homepage: it has its own choreography and pinned scroll scenes that must not
// sit inside a transformed ancestor. Under reduced motion the shift is dropped, the fade stays.
export default function PageFade({ children }) {
  return (
    <motion.div
      className="page-fade"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: { duration: dur.page, ease: ease.inOut } }}
    >
      {children}
    </motion.div>
  )
}
