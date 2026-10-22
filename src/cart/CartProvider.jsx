import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useCatalogue } from '../catalogue/useCatalogue'
import CartDrawer from '../components/cart/CartDrawer'
import { CartContext } from './cartContext'
import { STORAGE_KEY, cartReducer, readStoredCart, summarize, writeStoredCart } from './cartLogic'

const getStorage = () => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export default function CartProvider({ children }) {
  const { products, status } = useCatalogue()
  // Shape-only restore: the catalogue may still be loading, and a cart must survive that.
  const [items, dispatch] = useReducer(cartReducer, null, () => readStoredCart(getStorage(), null))
  const [isOpen, setIsOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const openerRef = useRef(null)
  const productsRef = useRef(products)

  useEffect(() => {
    productsRef.current = products
  }, [products])

  // Once the real catalogue is known, drop lines for products that no longer exist/are inactive.
  useEffect(() => {
    if (status === 'ready') dispatch({ type: 'prune', catalogue: products })
  }, [status, products])

  // Persist ids + quantities only (never prices).
  useEffect(() => {
    writeStoredCart(getStorage(), items)
  }, [items])

  // Keep multiple tabs in step.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY || e.key === null) {
        dispatch({ type: 'replace', items: readStoredCart(getStorage(), null), catalogue: productsRef.current })
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const openCart = useCallback(() => {
    openerRef.current = document.activeElement
    setIsOpen(true)
  }, [])

  // Hand focus back to whatever opened the bag, unless the caller is navigating elsewhere.
  const closeCart = useCallback((restoreFocus = true) => {
    setIsOpen(false)
    if (restoreFocus) openerRef.current?.focus?.({ preventScroll: true })
  }, [])

  const nameOf = (id) => products.find((p) => p.id === id)?.name ?? 'Item'

  const addToBag = useCallback((productId, qty = 1) => {
    dispatch({ type: 'add', productId, qty, catalogue: productsRef.current })
    setAnnouncement(`${productsRef.current.find((p) => p.id === productId)?.name ?? 'Item'} added to bag`)
    openCart()
  }, [openCart])
  const setQuantity = (productId, qty) => {
    dispatch({ type: 'setQuantity', productId, qty })
    setAnnouncement(`${nameOf(productId)}, quantity ${Math.max(0, qty)}`)
  }
  const removeFromBag = (productId) => {
    dispatch({ type: 'remove', productId })
    setAnnouncement(`${nameOf(productId)} removed from bag`)
  }
  const clearBag = useCallback(() => dispatch({ type: 'clear' }), [])

  const summary = useMemo(() => summarize(items, products), [items, products])

  const value = {
    items,
    ...summary,
    isOpen,
    openCart,
    closeCart,
    addToBag,
    setQuantity,
    removeFromBag,
    clearBag,
  }

  return (
    <CartContext.Provider value={value}>
      {children}
      <CartDrawer />
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    </CartContext.Provider>
  )
}
