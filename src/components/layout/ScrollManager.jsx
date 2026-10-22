import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// Route changes scroll to the top (instantly, like a new page); "/#section" links scroll to the
// section using the browser's own behaviour, so the CSS smooth-scroll + scroll-padding (and its
// reduced-motion opt-out) from the original homepage still apply.
export default function ScrollManager() {
  const { pathname, hash, key } = useLocation()
  const first = useRef(true)

  useEffect(() => {
    if (hash) {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)))
      if (el) {
        el.scrollIntoView()
        first.current = false
        return
      }
    }
    if (first.current) {
      first.current = false
      return
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, hash, key])

  return null
}
