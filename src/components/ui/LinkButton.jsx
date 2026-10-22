import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import './Button.css'

const MotionLink = motion.create(Link)

const ArrowIcon = () => (
  <svg className="btn__arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

// Router-aware twin of <Button>: same classes/CSS, so it looks and behaves identically.
// variant: primary | secondary | link
const LinkButton = forwardRef(function LinkButton({ to, variant = 'primary', arrow = false, children, ...rest }, ref) {
  return (
    <MotionLink
      ref={ref}
      to={to}
      className={`btn btn--${variant}`}
      whileTap={variant === 'link' ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.12 }}
      {...rest}
    >
      <span>{children}</span>
      {arrow && <ArrowIcon />}
    </MotionLink>
  )
})

export default LinkButton
