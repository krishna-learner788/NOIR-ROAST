import { Reveal } from '../../motion/Reveal'
import './Footer.css'

const EXPLORE = [
  ['Roasts', '#roasts'],
  ['Our craft', '#craft'],
  ['Origins', '#origins'],
  ['Journal', '#journal'],
  ['Visit', '#visit'],
]

export default function Footer() {
  return (
    <footer className="footer" data-theme="dark">
      <div className="container">
        <Reveal className="footer__top">
          <a href="#top" className="footer__logo" aria-label="NOIR ROAST — back to top">
            NOIR <span>ROAST</span>
          </a>
          <p className="footer__tag">Small-batch specialty coffee, roasted slowly in the dark.</p>
        </Reveal>

        <div className="footer__cols">
          <nav aria-label="Footer">
            <h2 className="eyebrow">Explore</h2>
            <ul>
              {EXPLORE.map(([label, href]) => (
                <li key={href}><a href={href}>{label}</a></li>
              ))}
            </ul>
          </nav>
          <div>
            <h2 className="eyebrow">Roastery</h2>
            <p>18 Ember Lane<br />Old Foundry District</p>
            <p className="footer__muted">Sample address</p>
          </div>
          <div>
            <h2 className="eyebrow">Say hello</h2>
            <p><a href="mailto:hello@noirroast.example" className="footer__mail">hello@noirroast.example</a></p>
            <p className="footer__muted">Placeholder address</p>
          </div>
        </div>

        <div className="footer__bottom">
          <p>© 2026 NOIR ROAST. Demo site — products, prices and contact details are sample content.</p>
          <a href="#top" className="footer__up">Back to top ↑</a>
        </div>
      </div>
    </footer>
  )
}
