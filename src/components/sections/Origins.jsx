import Figure from '../ui/Figure'
import { LineReveal, Reveal, RevealGroup, RevealItem, Rule } from '../../motion/Reveal'
import './Origins.css'

const ORIGINS = [
  {
    country: 'Ethiopia',
    region: 'Yirgacheffe',
    altitude: '1,900 – 2,100 m',
    process: 'Washed',
    notes: 'Bergamot, honey, dark cherry',
  },
  {
    country: 'Colombia',
    region: 'Huila',
    altitude: '1,600 – 1,850 m',
    process: 'Honey',
    notes: 'Hazelnut, brown sugar, orange peel',
  },
  {
    country: 'Guatemala',
    region: 'Antigua',
    altitude: '1,500 – 1,700 m',
    process: 'Washed',
    notes: 'Red apple, cocoa nib, jasmine',
  },
]

export default function Origins() {
  return (
    <section id="origins" className="section origins" data-theme="light" aria-labelledby="origins-title">
      <div className="container origins__grid">
        <div className="origins__intro">
          <Reveal className="section__label">
            <span className="section__num">03</span>
            <Rule />
            <span className="eyebrow">Origins</span>
          </Reveal>
          <LineReveal id="origins-title" className="section__title" lines={['Three farms,', ['three ', { em: 'altitudes' }]]} />
          <Reveal as="p" className="section__lead">
            High, slow-ripening coffee has the density to carry a dark roast without turning bitter. These are the lots we return to every harvest.
          </Reveal>
        </div>

        <div className="origins__media">
          <Figure
            src="/images/origins-sack.jpg"
            width={1600}
            height={1066}
            ratio="3 / 2"
            alt="Roasted coffee beans spilling from a burlap sack against a black background"
            caption="Fig. 02 — Green to roasted"
          />
        </div>

        <RevealGroup as="ul" className="origins__list">
          {ORIGINS.map((o, i) => (
            <RevealItem as="li" className="origin" key={o.country}>
              <span className="origin__num">0{i + 1}</span>
              <div className="origin__main">
                <h3 className="origin__country">{o.country}</h3>
                <p className="origin__region">{o.region}</p>
              </div>
              <dl className="origin__facts">
                <div><dt>Altitude</dt><dd>{o.altitude}</dd></div>
                <div><dt>Process</dt><dd>{o.process}</dd></div>
                <div><dt>In the cup</dt><dd>{o.notes}</dd></div>
              </dl>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  )
}
