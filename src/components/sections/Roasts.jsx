import Figure from '../ui/Figure'
import Button from '../ui/Button'
import { LineReveal, Reveal, RevealGroup, RevealItem, Rule } from '../../motion/Reveal'
import './Roasts.css'

const ROASTS = [
  {
    id: 'noir',
    name: 'Noir Reserve',
    origin: 'Yirgacheffe, Ethiopia',
    level: 5,
    levelLabel: 'Dark',
    notes: ['Dark cherry', 'Bittersweet cocoa', 'Smoked copper'],
    price: '$24',
    weight: '250 g',
    img: { src: '/images/roast-noir.jpg', width: 1400, height: 933, alt: 'Dark roasted coffee beans scattered on a slate surface' },
    ratio: '5 / 4',
    feature: true,
  },
  {
    id: 'copper',
    name: 'Copper Hour',
    origin: 'Huila, Colombia',
    level: 3,
    levelLabel: 'Medium',
    notes: ['Toasted hazelnut', 'Brown sugar', 'Orange peel'],
    price: '$21',
    weight: '250 g',
    img: { src: '/images/roast-copper.jpg', width: 1400, height: 933, alt: 'Ground coffee and whole beans on a dark wooden board, seen from above' },
    ratio: '3 / 2',
  },
  {
    id: 'first-light',
    name: 'First Light',
    origin: 'Antigua, Guatemala',
    level: 2,
    levelLabel: 'Light',
    notes: ['Honey', 'Red apple', 'Jasmine'],
    price: '$22',
    weight: '250 g',
    img: { src: '/images/roast-light.jpg', width: 1000, height: 1500, alt: 'Portafilters holding whole beans and freshly ground coffee on a pale steel counter' },
    ratio: '3 / 2',
    objectPosition: '50% 78%',
  },
]

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
  const { name, origin, level, levelLabel, notes, price, weight, img, ratio, feature, objectPosition } = roast
  const subject = encodeURIComponent(`Order enquiry: ${name}`)
  const body = encodeURIComponent(`Hello NOIR ROAST,\n\nI'd like to order ${name} (${weight}). Please let me know how to pay and when it ships.\n`)
  return (
    <RevealItem as="article" className={`roast group${feature ? ' roast--feature' : ''}`}>
      <Figure {...img} ratio={ratio} zoom parallax={false} objectPosition={objectPosition} className="roast__figure" />
      <div className="roast__body">
        <div className="roast__top">
          <p className="eyebrow">{origin}</p>
          <RoastMeter level={level} label={levelLabel} />
        </div>
        <h3 className="roast__name">{name}</h3>
        <p className="roast__notes">{notes.join(' · ')}</p>
        <div className="roast__foot">
          <p className="roast__price">
            <span>{price}</span> <small>/ {weight} · sample price</small>
          </p>
          <Button href={`mailto:hello@noirroast.example?subject=${subject}&body=${body}`} variant="link" arrow>
            Enquire to order
          </Button>
        </div>
      </div>
    </RevealItem>
  )
}

export default function Roasts() {
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

        <RevealGroup className="roasts__grid">
          {ROASTS.map((r) => (
            <ProductCard key={r.id} roast={r} />
          ))}
        </RevealGroup>

        <Reveal as="p" className="roasts__note">
          Online checkout is not open yet. Prices are sample prices; "Enquire to order" opens an email to us with your chosen roast filled in.
        </Reveal>
      </div>
    </section>
  )
}
