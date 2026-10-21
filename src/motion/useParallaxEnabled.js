import { useEffect, useState } from 'react'

const QUERY = '(min-width: 768px) and (prefers-reduced-motion: no-preference)'

/** Parallax runs only from tablet width up and never under reduced motion (design-system §6.5, §8). */
export default function useParallaxEnabled() {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const update = () => setOn(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return on
}
