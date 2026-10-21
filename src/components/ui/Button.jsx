import { motion } from 'framer-motion'
import './Button.css'

const ArrowIcon = () => (
  <svg className="btn__arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

// variant: primary | secondary | link
export default function Button({ href, variant = 'primary', arrow = false, children, ...rest }) {
  const Tag = href ? motion.a : motion.button
  return (
    <Tag
      className={`btn btn--${variant}`}
      href={href}
      whileTap={variant === 'link' ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.12 }}
      {...rest}
    >
      <span>{children}</span>
      {arrow && <ArrowIcon />}
    </Tag>
  )
}
