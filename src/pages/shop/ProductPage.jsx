import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useParams } from 'react-router-dom'
import { MAX_QTY } from '../../cart/cartLogic'
import { useCart } from '../../cart/useCart'
import { isLowStock, isSoldOut } from '../../catalogue/mapProduct'
import { useCatalogue } from '../../catalogue/useCatalogue'
import Button from '../../components/ui/Button'
import LinkButton from '../../components/ui/LinkButton'
import Notice from '../../components/ui/Notice'
import PageLoading from '../../components/ui/PageLoading'
import { provisionalNote } from '../../data/products'
import { usePageMeta } from '../../lib/meta'
import { formatINR } from '../../lib/money'
import { MaskImage, RevealFrom, RevealItemFrom } from '../../motion/directional'
import { LineReveal, RevealGroup, Rule } from '../../motion/Reveal'
import NotFound from '../NotFound'
import { RoastDots, ShopCard } from './Shop'
import './Shop.css'

/** schema.org Product. Offers are emitted only once the price is CONFIRMED, never for placeholders. */
function structuredData(product, url) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    brand: { '@type': 'Brand', name: 'NOIR ROAST' },
    url,
  }
  if (product.img) data.image = product.img.src
  if (product.description) data.description = product.description
  if (product.priceStatus === 'confirmed') {
    data.offers = {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: (product.pricePaise / 100).toFixed(2),
      url,
      ...(product.stock !== null && product.stock !== undefined
        ? { availability: product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' }
        : {}),
    }
  }
  return data
}

function Quantity({ value, onChange, name }) {
  return (
    <div className="qty" role="group" aria-label={`Quantity of ${name}`}>
      <button type="button" className="qty__btn" aria-label="Decrease quantity" disabled={value <= 1} onClick={() => onChange(value - 1)}><span aria-hidden="true">−</span></button>
      <span className="qty__value" aria-live="polite">{value}</span>
      <button type="button" className="qty__btn" aria-label="Increase quantity" disabled={value >= MAX_QTY} onClick={() => onChange(value + 1)}><span aria-hidden="true">+</span></button>
    </div>
  )
}

export default function ProductPage() {
  const { id } = useParams()
  const { products, status, getById, reload } = useCatalogue()
  const { addToBag } = useCart()
  const [qty, setQty] = useState(1)
  const product = getById(id)

  const url = `${window.location.origin}/shop/${id}`
  usePageMeta({
    title: product?.name ?? 'Roast',
    description: product
      ? `${product.name}${product.origin ? ` — ${product.origin}` : ''}${product.notes.length ? `. Notes of ${product.notes.join(', ').toLowerCase()}.` : '.'}`
      : undefined,
    path: `/shop/${id}`,
    image: product?.img?.src,
    jsonLd: product ? structuredData(product, url) : undefined,
  })

  if (status === 'loading') return <PageLoading label="Loading the roast" />
  if (status === 'error') {
    return (
      <section className="page-body" data-theme="light">
        <div className="container stack form-narrow">
          <Notice tone="error" title="This roast could not be loaded">
            <p>Please check your connection and <button type="button" className="link-inline" onClick={reload}>try again</button>.</p>
          </Notice>
        </div>
      </section>
    )
  }
  if (!product) return <NotFound what="roast" />

  const soldOut = isSoldOut(product)
  const note = provisionalNote(product)
  const others = products.filter((p) => p.id !== product.id).slice(0, 2)
  const add = () => addToBag(product.id, qty)

  return (
    <section className="page-body pdp-page" data-theme="light">
      <div className="container">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to="/shop">Shop</Link><span aria-hidden="true">/</span><span aria-current="page">{product.name}</span>
        </nav>

        <div className="pdp" style={{ marginTop: 'var(--space-8)' }}>
          <div className="pdp__media">
            {product.img ? (
              <MaskImage src={product.img.src} alt={product.img.alt} width={product.img.width} height={product.img.height} ratio="4 / 5" from="left" eager objectPosition={product.objectPosition} />
            ) : (
              <div className="shop-card__placeholder" aria-hidden="true">{product.name}</div>
            )}
          </div>

          <div className="stack">
            <RevealFrom from="right" className="row" delay={0.1}>
              <Rule />
              <span className="eyebrow">{product.origin || 'Single origin'}</span>
              <RoastDots level={product.level} label={product.levelLabel} />
            </RevealFrom>

            <LineReveal as="h1" className="pdp__title" lines={[product.name]} />

            {product.notes.length > 0 && (
              <RevealGroup as="ul" className="pdp__notes" aria-label="Tasting notes">
                {product.notes.map((n) => <RevealItemFrom as="li" from="right" key={n}>{n}</RevealItemFrom>)}
              </RevealGroup>
            )}

            {product.description && <RevealFrom as="p" from="up" className="muted">{product.description}</RevealFrom>}

            <RevealFrom from="depth" className="stack stack--tight">
              <p className="pdp__price">
                <strong className="money">{formatINR(product.pricePaise)}</strong>
                <span className="muted">/ {product.weight}</span>
              </p>
              {note && <p className="small muted"><span className="eyebrow">{note}</span></p>}
              {soldOut && <Notice tone="warning" title="Sold out">This roast is not available right now.</Notice>}
              {isLowStock(product) && <p className="small muted">Only {product.stock} left</p>}

              {!soldOut && (
                <div className="pdp__buy">
                  <Quantity value={qty} onChange={setQty} name={product.name} />
                  <Button type="button" arrow onClick={add}>Add to bag</Button>
                </div>
              )}
              <p className="small muted">Shipping and taxes are confirmed at checkout.</p>
            </RevealFrom>

            <RevealFrom from="up">
              <dl className="kv panel">
                <div><dt>Origin</dt><dd>{product.origin || '—'}</dd></div>
                <div><dt>Roast</dt><dd>{product.levelLabel || '—'}</dd></div>
                <div><dt>Pack size</dt><dd>{product.weight}{product.weightStatus === 'provisional' ? ' (provisional)' : ''}</dd></div>
              </dl>
            </RevealFrom>
          </div>
        </div>

        {others.length > 0 && (
          <div className="stack" style={{ marginTop: 'var(--space-24)' }}>
            <h2 className="section-title">More <em style={{ fontStyle: 'italic', fontWeight: 400, color: 'var(--accent)' }}>roasts</em></h2>
            <RevealGroup className="others">
              {others.map((p, i) => <ShopCard key={p.id} product={p} index={i === 0 ? 0 : 2} />)}
            </RevealGroup>
            <div><LinkButton to="/shop" variant="secondary">See all roasts</LinkButton></div>
          </div>
        )}
      </div>

      {!soldOut && createPortal(
        <div className="pdp-bar" data-theme="dark">
          <p className="pdp-bar__price">{formatINR(product.pricePaise * qty)}<small>{qty} × {product.weight}{note ? ' · provisional' : ''}</small></p>
          <Button type="button" onClick={add}>Add to bag</Button>
        </div>,
        document.body,
      )}
    </section>
  )
}
