import { motion } from 'framer-motion'
import { dur, ease, stagger, viewport, fadeUp } from './tokens'

const rule = {
  hidden: { scaleX: 0 },
  show: { scaleX: 1, transition: { duration: 0.9, ease: ease.out } },
}

/** Single element that fades up when scrolled into view. */
export function Reveal({ as = 'div', delay = 0, className, children, ...rest }) {
  const Tag = motion[as]
  return (
    <Tag
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={viewport}
      transition={delay ? { delay } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/** Parent that staggers its RevealItem children (max ~6, design-system §6.1). */
export function RevealGroup({ as = 'div', className, children, gap = stagger, ...rest }) {
  const Tag = motion[as]
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={viewport}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export function RevealItem({ as = 'div', className, children, ...rest }) {
  const Tag = motion[as]
  return (
    <Tag className={className} variants={fadeUp} {...rest}>
      {children}
    </Tag>
  )
}

/** Hairline that draws left → right. */
export function Rule({ className = '' }) {
  return (
    <motion.span
      className={`rule ${className}`}
      aria-hidden="true"
      variants={rule}
      initial="hidden"
      whileInView="show"
      viewport={viewport}
    />
  )
}

/** Headline revealed line by line. `lines` is an array of strings or [string, {em}] parts. */
export function LineReveal({ as = 'h2', className, lines, id }) {
  const Tag = motion[as]
  return (
    <Tag
      id={id}
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={viewport}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
    >
      {lines.map((line, i) => (
        <span className="line-mask" key={i}>
          <motion.span
            className="line-mask__inner"
            variants={{
              hidden: { y: '105%' },
              show: { y: '0%', transition: { duration: dur.reveal + 0.1, ease: ease.out } },
            }}
          >
            {(Array.isArray(line) ? line : [line]).map((part, j) =>
              typeof part === 'string' ? part : <em key={j}>{part.em}</em>,
            )}
          </motion.span>
        </span>
      ))}
    </Tag>
  )
}
