import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '../../auth/useAuth'
import { dur, ease, stagger } from '../../motion/tokens'
import CartButton from '../cart/CartButton'
import './Nav.css'

// Section links point at the homepage ("/#roasts") so they work from every route.
const LINKS = [
  { label: 'Roasts', hash: '#roasts' },
  { label: 'Craft', hash: '#craft' },
  { label: 'Journal', hash: '#journal' },
  { label: 'Visit', hash: '#visit' },
]

const FOCUSABLE = 'a[href], button:not([disabled])'

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('')
  const toggleRef = useRef(null)
  const overlayRef = useRef(null)
  const { pathname } = useLocation()
  const { user } = useAuth()
  const isHome = pathname === '/'
  const accountLabel = user ? 'Account' : 'Sign in'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Highlight the link for the section currently in view (homepage only: other routes have no sections).
  useEffect(() => {
    if (!isHome) return undefined
    const els = [...LINKS.map((l) => document.getElementById(l.hash.slice(1))), document.getElementById('origins')].filter(Boolean)
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id === 'origins' ? '#craft' : '#' + e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' },
    )
    els.forEach((el) => io.observe(el))
    const hero = document.getElementById('top')
    const heroIo = new IntersectionObserver(([e]) => e.isIntersecting && setActive(''), { rootMargin: '-45% 0px -50% 0px' })
    if (hero) heroIo.observe(hero)
    return () => { io.disconnect(); heroIo.disconnect() }
  }, [isHome])

  // Close the menu whenever the route changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false)
  }, [pathname])

  // Lock scroll, close on Esc, trap focus while the menu is open.
  useEffect(() => {
    if (!open) return
    const toggle = toggleRef.current
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }
      if (e.key !== 'Tab' || !overlayRef.current) return
      const nodes = [toggle, ...overlayRef.current.querySelectorAll(FOCUSABLE)]
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    const desktop = window.matchMedia('(min-width: 1024px)')
    const onChange = (e) => e.matches && setOpen(false)

    document.addEventListener('keydown', onKey)
    desktop.addEventListener('change', onChange)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
      desktop.removeEventListener('change', onChange)
      toggle?.focus()
    }
  }, [open])

  const currentActive = isHome ? active : ''
  const menuItems = [
    ...LINKS.map((l) => ({ label: l.label, to: { pathname: '/', hash: l.hash } })),
    { label: 'Shop', to: '/shop' },
    { label: accountLabel, to: user ? '/account' : '/login' },
  ]

  // Inner pages can start with a light section, so their header is always solid; the homepage
  // keeps its original transparent-to-solid scroll behaviour.
  return (
    <header className={`nav${scrolled || open || !isHome ? ' nav--solid' : ''}`} data-theme="dark">
      <div className="container nav__inner">
        <Link to={{ pathname: '/', hash: '#top' }} className="nav__logo" aria-label="NOIR ROAST — home" onClick={() => setOpen(false)}>
          NOIR <span>ROAST</span>
        </Link>

        <nav className="nav__links" aria-label="Primary">
          {LINKS.map((l) => (
            <Link key={l.hash} to={{ pathname: '/', hash: l.hash }} className="nav__link" aria-current={currentActive === l.hash ? 'location' : undefined}>{l.label}</Link>
          ))}
        </nav>

        <div className="nav__actions">
          <Link to="/shop" className="nav__shop" aria-current={pathname.startsWith('/shop') ? 'page' : undefined}>Shop the roast</Link>
          <Link to={user ? '/account' : '/login'} className="nav__account">{accountLabel}</Link>
          <CartButton onOpen={() => setOpen(false)} />
          <button
            ref={toggleRef}
            type="button"
            className="nav__toggle"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="nav__toggle-label">{open ? 'Close' : 'Menu'}</span>
            <span className={`nav__burger${open ? ' is-open' : ''}`} aria-hidden="true">
              <i /><i />
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            ref={overlayRef}
            className="menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ clipPath: 'inset(0 0 100% 0)' }}
            animate={{ clipPath: 'inset(0 0 0% 0)', transition: { duration: 0.4, ease: ease.inOut } }}
            exit={{ clipPath: 'inset(0 0 100% 0)', transition: { duration: 0.28, ease: ease.in } }}
          >
            <ul className="menu__list">
              {menuItems.map((item, i) => (
                <motion.li
                  key={item.label}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: dur.reveal * 0.75, ease: ease.out, delay: 0.15 + i * stagger } }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                >
                  <Link to={item.to} className="menu__link" onClick={() => setOpen(false)}>
                    <span className="menu__num">0{i + 1}</span>
                    {item.label}
                  </Link>
                </motion.li>
              ))}
            </ul>
            <motion.p
              className="menu__foot"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.55, duration: dur.reveal } }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
            >
              Small-batch specialty coffee, roasted slowly in the dark.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
