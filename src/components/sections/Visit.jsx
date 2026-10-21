import Figure from '../ui/Figure'
import Button from '../ui/Button'
import { LineReveal, Reveal, RevealGroup, RevealItem, Rule } from '../../motion/Reveal'
import './Visit.css'

const HOURS = [
  ['Mon – Fri', '7:30 – 17:00'],
  ['Saturday', '8:00 – 18:00'],
  ['Sunday', '9:00 – 15:00'],
]

export default function Visit() {
  return (
    <section id="visit" className="section visit" data-theme="light" aria-labelledby="visit-title">
      <div className="container visit__grid">
        <div className="visit__content">
          <Reveal className="section__label">
            <span className="section__num">05</span>
            <Rule />
            <span className="eyebrow">Visit</span>
          </Reveal>
          <LineReveal id="visit-title" className="section__title" lines={['Come in from', ['the ', { em: 'cold' }]]} />
          <Reveal as="p" className="section__lead">
            The roastery has a small tasting bar. Ask for a flight of the three roasts and we will walk you through each one.
          </Reveal>

          <RevealGroup className="visit__details">
            <RevealItem as="div" className="visit__block">
              <h3 className="eyebrow">Roastery &amp; tasting bar</h3>
              <address>
                18 Ember Lane<br />
                Old Foundry District<br />
                <small>Sample address — to be replaced</small>
              </address>
            </RevealItem>
            <RevealItem as="div" className="visit__block">
              <h3 className="eyebrow">Hours</h3>
              <dl className="visit__hours">
                {HOURS.map(([d, t]) => (
                  <div key={d}><dt>{d}</dt><dd>{t}</dd></div>
                ))}
              </dl>
            </RevealItem>
          </RevealGroup>

          <Reveal className="visit__cta">
            <Button href="mailto:hello@noirroast.example?subject=Tasting%20bar%20visit" arrow>Email the roastery</Button>
            <Button href="#top" variant="link">Back to top</Button>
          </Reveal>
          <Reveal as="p" className="visit__note">
            hello@noirroast.example is a placeholder address. Contact details and hours here are sample content.
          </Reveal>
        </div>

        <div className="visit__media">
          <Figure
            src="/images/visit-room.jpg"
            width={1600}
            height={1067}
            ratio="4 / 5"
            alt="A dark, moody cafe interior with long wooden tables and industrial windows"
            caption="The tasting room"
            objectPosition="40% 50%"
          />
        </div>
      </div>
    </section>
  )
}
