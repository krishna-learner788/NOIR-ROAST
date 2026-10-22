import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MAX_QTY, buildOrderEmail, focusIndexAfterRemove } from '../../cart/cartLogic'
import { useCart } from '../../cart/useCart'
import { provisionalNote } from '../../data/products'
import { formatINR } from '../../lib/money'
import { dur, ease } from '../../motion/tokens'
import { isBackendConfigured } from '../../lib/config'
import Button from '../ui/Button'
import LinkButton from '../ui/LinkButton'
import './CartDrawer.css'

const FOCUSABLE = 'a[href], button:not([disabled])'

function BagLine({ line, onRemove }) {
  const { setQuantity } = useCart()
  const { product, quantity, lineTotalPaise } = line
  const { img } = product
  const minusRef = useRef(null)
  const plusRef = useRef(null)
  const note = provisionalNote(product)

  // A button that is about to disable itself must not be the one holding focus.
  const decrease = () => {
    if (quantity - 1 <= 1) plusRef.current?.focus()
    setQuantity(product.id, quantity - 1)
  }
  const increase = () => {
    if (quantity + 1 >= MAX_QTY) minusRef.current?.focus()
    setQuantity(product.id, quantity + 1)
  }
  return (
    <li className="bag__line">
      <img className="bag__thumb" src={img.src} width={72} height={72} alt="" loading="lazy" decoding="async" style={{ objectPosition: product.objectPosition }} />
      <div className="bag__info">
        <h3 className="bag__name">{product.name}</h3>
        <p className="bag__meta">{product.weight} · {formatINR(product.pricePaise)} each</p>
        {note && <p className="bag__prov">{note}</p>}
        <div className="bag__controls">
          <div className="qty" role="group" aria-label={`Quantity of ${product.name}`}>
            <button ref={minusRef} type="button" className="qty__btn" aria-label={`Decrease quantity of ${product.name}`} disabled={quantity <= 1} onClick={decrease}>
              <span aria-hidden="true">−</span>
            </button>
            <span className="qty__value">{quantity}</span>
            <button ref={plusRef} type="button" className="qty__btn" aria-label={`Increase quantity of ${product.name}`} disabled={quantity >= MAX_QTY} onClick={increase}>
              <span aria-hidden="true">+</span>
            </button>
          </div>
          <div className="bag__sum">
            <p className="bag__total">{formatINR(lineTotalPaise)}</p>
            {product.priceStatus === 'provisional' && <small className="bag__prov">provisional</small>}
          </div>
        </div>
        <button type="button" className="bag__remove" aria-label={`Remove ${product.name} from bag`} onClick={onRemove}>
          Remove
        </button>
      </div>
    </li>
  )
}

export default function CartDrawer() {
  const { isOpen, closeCart, removeFromBag, lines, itemCount, subtotalPaise, hasProvisionalPrices } = useCart()
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const afterRemove = useRef(null) // index of the line just removed, until focus has been re-homed

  // The focused Remove button disappears with its line; hand focus to the line that took its
  // place, or to the empty-state link, so it never falls back to <body>.
  useEffect(() => {
    const removedIndex = afterRemove.current
    if (removedIndex === null || !panelRef.current) return
    afterRemove.current = null
    const buttons = panelRef.current.querySelectorAll('.bag__remove')
    const i = focusIndexAfterRemove(removedIndex, buttons.length)
    const target = i >= 0 ? buttons[i] : panelRef.current.querySelector('.bag__empty a')
    target?.focus()
  }, [lines.length])

  // Lock scroll, move focus in, close on Esc, trap Tab inside the panel.
  useEffect(() => {
    if (!isOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        closeCart()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const nodes = panelRef.current.querySelectorAll(FOCUSABLE)
      if (!nodes.length) return
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
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen, closeCart])

  const empty = lines.length === 0

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="bag-backdrop"
          className="bag-backdrop"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.3 } }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          onClick={() => closeCart()}
        />
      )}
      {isOpen && (
        <motion.div
          key="bag-panel"
          ref={panelRef}
          id="bag"
          className="bag"
          data-theme="dark"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bag-title"
          initial={{ x: '100%' }}
          animate={{ x: 0, transition: { duration: dur.page * 0.7, ease: ease.out } }}
          exit={{ x: '100%', transition: { duration: 0.28, ease: ease.in } }}
        >
          <div className="bag__head">
            <div>
              <p className="eyebrow">Your selection</p>
              <h2 id="bag-title" className="bag__title">Bag{itemCount > 0 && <span className="bag__count"> · {itemCount}</span>}</h2>
            </div>
            <button ref={closeRef} type="button" className="bag__close" onClick={() => closeCart()}>
              Close
            </button>
          </div>

          {empty ? (
            <div className="bag__empty">
              <p className="bag__empty-title">Your bag is empty</p>
              <p className="bag__empty-text">Three roasts are waiting a short scroll away.</p>
              <LinkButton to="/shop" variant="secondary" onClick={() => closeCart(false)}>Browse the roasts</LinkButton>
            </div>
          ) : (
            <>
              <ul className="bag__lines" aria-label="Items in your bag">
                {lines.map((line, index) => (
                  <BagLine
                    key={line.product.id}
                    line={line}
                    onRemove={() => {
                      afterRemove.current = index
                      removeFromBag(line.product.id)
                    }}
                  />
                ))}
              </ul>
              <div className="bag__foot">
                <p className="bag__subtotal">
                  <span>Subtotal{hasProvisionalPrices && ' · provisional'}</span>
                  <strong>{formatINR(subtotalPaise)}</strong>
                </p>
                <p id="bag-note" className="bag__note">
                  {hasProvisionalPrices && 'Prices and weights are provisional and will be confirmed at checkout. '}
                  Shipping and any taxes are confirmed at checkout.{!isBackendConfigured && ' Online checkout is not open yet.'}
                </p>
                {isBackendConfigured ? (
                  <LinkButton to="/checkout" variant="primary" onClick={() => closeCart(false)} aria-describedby="bag-note">Checkout</LinkButton>
                ) : (
                  <>
                    <Button variant="primary" type="button" disabled aria-describedby="bag-note">Checkout opens soon</Button>
                    <Button variant="link" href={buildOrderEmail(lines)}>Enquire to order by email</Button>
                  </>
                )}
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
