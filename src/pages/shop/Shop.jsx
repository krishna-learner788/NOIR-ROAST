import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../../cart/useCart'
import { isLowStock, isSoldOut } from '../../catalogue/mapProduct'
import { SORTS, filterProducts, roastOptions, sortProducts } from '../../catalogue/sortFilter'
import { useCatalogue } from '../../catalogue/useCatalogue'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import Notice from '../../components/ui/Notice'
import PageHero from '../../components/ui/PageHero'
import { SkeletonCards } from '../../components/ui/PageLoading'
import { provisionalNote } from '../../data/products'
import { usePageMeta } from '../../lib/meta'
import { formatINR } from '../../lib/money'
import { MaskImage, RevealItemFrom } from '../../motion/directional'
import { RevealGroup } from '../../motion/Reveal'
import './Shop.css'

// Cards enter from alternating directions so the grid reads as a composed sequence, not a list.
const FROM = ['left', 'up', 'right']
const MASK = ['left', 'bottom', 'right']

export function RoastDots({ level, label }) {
  if (!level) return null
  return (
    <span className="meter" role="img" aria-label={`Roast level: ${label}, ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= level ? 'is-on' : ''} />)}
    </span>
  )
}

export function ShopCard({ product, index = 0 }) {
  const { addToBag } = useCart()
  const { id, name, origin, level, levelLabel, notes, pricePaise, weight, img, objectPosition } = product
  const soldOut = isSoldOut(product)
  const note = provisionalNote(product)
  return (
    <RevealItemFrom as="article" from={FROM[index % FROM.length]} className="shop-card group">
      <Link to={`/shop/${id}`} className="shop-card__media" aria-label={`View ${name}`} tabIndex={-1}>
        {img ? (
          <MaskImage src={img.src} alt={img.alt} width={img.width} height={img.height} ratio="4 / 5" from={MASK[index % MASK.length]} parallax={false} objectPosition={objectPosition} />
        ) : (
          <div className="shop-card__placeholder" aria-hidden="true">{name}</div>
        )}
        {soldOut && <span className="shop-card__flag">Sold out</span>}
      </Link>
      <div className="shop-card__body">
        <div className="roast__top">
          <p className="eyebrow">{origin}</p>
          <RoastDots level={level} label={levelLabel} />
        </div>
        <h2 className="shop-card__name"><Link to={`/shop/${id}`}>{name}</Link></h2>
        {notes.length > 0 && <p className="roast__notes">{notes.join(' · ')}</p>}
        <div className="roast__foot">
          <p className="roast__price">
            <span>{formatINR(pricePaise)}</span> <small>/ {weight}{note && ` · ${note}`}</small>
          </p>
          <Button type="button" variant="link" arrow={!soldOut} disabled={soldOut} aria-label={soldOut ? `${name} is sold out` : `Add ${name} to bag`} onClick={() => addToBag(id)}>
            {soldOut ? 'Sold out' : 'Add to bag'}
          </Button>
        </div>
        {isLowStock(product) && <p className="small muted">Only {product.stock} left</p>}
      </div>
    </RevealItemFrom>
  )
}

export default function Shop() {
  const { products, status, reload } = useCatalogue()
  const [sort, setSort] = useState('featured')
  const [roast, setRoast] = useState('')
  const [query, setQuery] = useState('')

  usePageMeta({
    title: 'Shop',
    description: 'Small-batch specialty coffee, roasted weekly and rested for five days. Browse the NOIR ROAST roasts.',
    path: '/shop',
  })

  const options = useMemo(() => roastOptions(products), [products])
  const visible = useMemo(
    () => sortProducts(filterProducts(products, { roast, query }), sort),
    [products, roast, query, sort],
  )
  const showSearch = products.length > 6
  const filtered = Boolean(roast || query)

  return (
    <>
      <PageHero
        eyebrow="The shop"
        title={[['Choose your ', { em: 'roast' }]]}
        lead="Roasted in small batches every week and rested for five days. We sell what we have, when it is at its best."
      />

      <section className="page-body" data-theme="light" aria-labelledby="shop-results">
        <div className="container">
          <div className="shop-toolbar">
            <h2 id="shop-results" className="sr-only">Roasts</h2>
            {options.length > 1 && (
              <div className="chips" role="group" aria-label="Filter by roast">
                <button type="button" className="chip" aria-pressed={roast === ''} onClick={() => setRoast('')}>All</button>
                {options.map((o) => (
                  <button key={o} type="button" className="chip" aria-pressed={roast === o} onClick={() => setRoast(roast === o ? '' : o)}>{o}</button>
                ))}
              </div>
            )}
            <div className="shop-toolbar__right">
              {showSearch && (
                <Field id="shop-search" label="Search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, origin or note" autoComplete="off" />
              )}
              {products.length > 1 && (
                <Field id="shop-sort" as="select" label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)}>
                  {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </Field>
              )}
            </div>
          </div>

          <p className="small muted" role="status" aria-live="polite">
            {status === 'ready' && `${visible.length} ${visible.length === 1 ? 'roast' : 'roasts'}${filtered ? ' match your filters' : ''}`}
          </p>

          {status === 'loading' && <SkeletonCards />}
          {status === 'error' && (
            <Notice tone="error" title="The roasts could not be loaded">
              <p>Please check your connection and <button type="button" className="link-inline" onClick={reload}>try again</button>.</p>
            </Notice>
          )}
          {status === 'ready' && products.length === 0 && (
            <Notice tone="info" title="Nothing is on the shelf right now">
              <p>New roasts will appear here as soon as they are ready.</p>
            </Notice>
          )}
          {status === 'ready' && products.length > 0 && visible.length === 0 && (
            <Notice tone="info" title="No roast matches those filters">
              <p><button type="button" className="link-inline" onClick={() => { setRoast(''); setQuery('') }}>Clear the filters</button> to see everything.</p>
            </Notice>
          )}
          {status === 'ready' && visible.length > 0 && (
            <RevealGroup className="shop-grid" key={`${roast}|${query}|${sort}`}>
              {visible.map((p, i) => <ShopCard key={p.id} product={p} index={i} />)}
            </RevealGroup>
          )}

          <p className="shop-note">
            Prices and weights are provisional while we confirm them; shipping and taxes are confirmed at checkout.
          </p>
        </div>
      </section>
    </>
  )
}
