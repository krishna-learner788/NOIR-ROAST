import { useCart } from '../../cart/useCart'
import './CartButton.css'

// Header trigger for the bag drawer. `onOpen` lets the nav close its mobile menu first.
export default function CartButton({ onOpen }) {
  const { openCart, itemCount, isOpen } = useCart()
  return (
    <button
      type="button"
      className="cart-btn"
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-controls="bag"
      aria-label={itemCount > 0 ? `Open bag, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : 'Open bag, empty'}
      onClick={() => {
        onOpen?.()
        openCart()
      }}
    >
      <span>Bag</span>
      {itemCount > 0 && <span className="cart-btn__count" aria-hidden="true">{itemCount}</span>}
    </button>
  )
}
