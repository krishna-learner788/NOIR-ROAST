// Motion tokens — design-system.md section 6.1
export const ease = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
  in: [0.55, 0, 1, 0.45],
}

export const dur = { micro: 0.2, ui: 0.3, reveal: 0.8, image: 1.1, page: 0.6 }

export const stagger = 0.08

// Reveal once, slightly before the element is fully in view (section 6.2).
export const viewport = { once: true, margin: '0px 0px -12% 0px' }

export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: dur.reveal, ease: ease.out } },
}
