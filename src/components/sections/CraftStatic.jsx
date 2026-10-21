import Figure from '../ui/Figure'
import { LineReveal, Reveal, RevealGroup, RevealItem, Rule } from '../../motion/Reveal'
import './Craft.css'

const CHAPTERS = [
  {
    num: '01',
    title: 'Sourcing',
    text: 'We buy directly from a handful of farms, paying well above commodity prices, and cup every lot before we commit. If it does not surprise us on the table, it does not come home.',
  },
  {
    num: '02',
    title: 'Roasting',
    text: 'Small drum, low and slow. We stop each batch by colour, sound and smell, not a timer, so the sweetness is developed and the bitterness never is.',
  },
  {
    num: '03',
    title: 'Craftsmanship',
    text: 'Every bag is rested, tasted and hand-sealed. Roast date on the front, a plain note on the back about what to expect in the cup.',
  },
]

export default function CraftStatic() {
  return (
    <section id="craft" className="section craft" data-theme="dark" aria-labelledby="craft-title">
      <div className="container craft__grid">
        <div className="craft__media">
          <Figure
            src="/images/craft-pour.jpg"
            width={1200}
            height={1800}
            ratio="4 / 5"
            alt="A barista pouring hot water over coffee grounds in a glass pour-over brewer"
            caption="Fig. 01 — The bloom"
          />
        </div>

        <div className="craft__content">
          <Reveal className="section__label">
            <span className="section__num">02</span>
            <Rule />
            <span className="eyebrow">Our craft</span>
          </Reveal>
          <LineReveal
            id="craft-title"
            className="section__title"
            lines={['Patience is', ['the ', { em: 'only' }, ' secret']]}
          />

          <RevealGroup className="craft__chapters" as="ol">
            {CHAPTERS.map((c) => (
              <RevealItem as="li" className="chapter" key={c.num}>
                <span className="chapter__num">{c.num}</span>
                <div>
                  <h3 className="chapter__title">{c.title}</h3>
                  <p className="chapter__text">{c.text}</p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>

          <Reveal as="blockquote" className="craft__quote">
            “A good roast should taste like the place the coffee came from, not the fire it went through.”
            <footer>— Head roaster</footer>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
