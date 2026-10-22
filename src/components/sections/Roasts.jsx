import { Link } from 'react-router-dom'
import Figure from '../ui/Figure'
import Button from '../ui/Button'
import Notice from '../ui/Notice'
import { SkeletonCards } from '../ui/PageLoading'
import { provisionalNote } from '../../data/products'
import { useCatalogue } from '../../catalogue/useCatalogue'
import { isSoldOut } from '../../catalogue/mapProduct'
import { useCart } from '../../cart/useCart'
import { formatINR } from '../../lib/money'
import { LineReveal, Reveal, RevealGroup, RevealItem, Rule } from '../../motion/Reveal'
import './Roasts.css'

function RoastMeter({ level, label }) {
  return (
    <span className="meter" role="img" aria-label={`Roast level: ${label}, ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= level ? 'is-on' : ''} />
      ))}
    </span>
  )
}

function ProductCard({ roast }) {
  const { id, name, origin, level, levelLabel, notes, pricePaise, weight, img, ratio, feature, objectPosition } = roast
  const { addToBag } = useCart()
  const note = provisionalNote(roast)
  const soldOut = isSoldOut(roast)
  return (
    <RevealItem as="article" className={`roast group${feature ? ' roast--feature' : ''}`}>
      {img && <Figure {...img} ratio={ratio} zoom parallax={false} objectPosition={objectPosition} className="roast__figure" />}
      <div className="roast__body">
        <div className="roast__top">
          <p className="eyebrow">{origin}</p>
          {level && <RoastMeter level={level} label={levelLabel} />}
        </div>
        <h3 className="roast__name"><Link to={`/shop/${id}`}>{name}</Link></h3>
        <p className="roast__notes">{notes.join(' · ')}</p>
        <div className="roast__foot">
          <p className="roast__price">
            <span>{formatINR(pricePaise)}</span> <small>/ {weight}{note && ` · ${note}`}</small>
          </p>
          <Button type="button" variant="link" arrow={!soldOut} disabled={soldOut} aria-label={soldOut ? `${name} is sold out` : `Add ${name} to bag`} onClick={() => addToBag(id)}>
            {soldOut ? 'Sold out' : 'Add to bag'}
          </Button>
        </div>
      </div>
    </RevealItem>
  )
}

export default function Roasts() {
  const { products, status, reload } = useCatalogue()
  return (
    <section id="roasts" className="section roasts" data-theme="light" aria-labelledby="roasts-title">
      <div className="container">
        <div className="section__head">
          <div>
            <Reveal className="section__label">
              <span className="section__num">01</span>
              <Rule />
              <span className="eyebrow">The roasts</span>
            </Reveal>
            <LineReveal id="roasts-title" className="section__title" lines={['Three roasts,', ['one ', { em: 'slow' }, ' fire']]} />
          </div>
          <Reveal as="p" className="section__lead">
            Roasted in small batches every week and rested for five days. We sell what we have, when it is at its best.
          </Reveal>
        </div>

        {status === 'loading' && <SkeletonCards />}
        {status === 'error' && (
          <Notice tone="error" title="The roasts could not be loaded">
            <p>Please check your connection and <button type="button" className="link-inline" onClick={reload}>try again</button>.</p>
          </Notice>
        )}
        {status === 'ready' && (
          <RevealGroup className="roasts__grid">
            {products.map((r) => (
              <ProductCard key={r.id} roast={r} />
            ))}
          </RevealGroup>
        )}

        <Reveal as="p" className="roasts__note">
          Prices and weights are provisional while we confirm them.{' '}
          <Link to="/shop" className="link-inline">See the full shop</Link>.
        </Reveal>
      </div>
    </section>
  )
}
