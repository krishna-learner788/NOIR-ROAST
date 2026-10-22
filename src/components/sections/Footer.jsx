import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { Reveal } from '../../motion/Reveal'
import './Footer.css'

// Section links target the homepage so they work from every route.
const EXPLORE = [
  ['Roasts', { pathname: '/', hash: '#roasts' }],
  ['Our craft', { pathname: '/', hash: '#craft' }],
  ['Origins', { pathname: '/', hash: '#origins' }],
  ['Journal', { pathname: '/', hash: '#journal' }],
  ['Visit', { pathname: '/', hash: '#visit' }],
]

export default function Footer() {
  const { user } = useAuth()
  const toTop = () => window.scrollTo({ top: 0, left: 0 }) // follows CSS smooth-scroll when motion is allowed

  return (
    <footer className="footer" data-theme="dark">
      <div className="container">
        <Reveal className="footer__top">
          <Link to={{ pathname: '/', hash: '#top' }} className="footer__logo" aria-label="NOIR ROAST — back to top">
            NOIR <span>ROAST</span>
          </Link>
          <p className="footer__tag">Small-batch specialty coffee, roasted slowly in the dark.</p>
        </Reveal>

        <div className="footer__cols">
          <nav aria-label="Footer">
            <h2 className="eyebrow">Explore</h2>
            <ul>
              {EXPLORE.map(([label, to]) => (
                <li key={to.hash}><Link to={to}>{label}</Link></li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Shop and account">
            <h2 className="eyebrow">Shop</h2>
            <ul>
              <li><Link to="/shop">All roasts</Link></li>
              {user ? (
                <>
                  <li><Link to="/account">Account</Link></li>
                  <li><Link to="/account/orders">My orders</Link></li>
                </>
              ) : (
                <>
                  <li><Link to="/login">Sign in</Link></li>
                  <li><Link to="/register">Create an account</Link></li>
                </>
              )}
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
          <button type="button" className="footer__up" onClick={toTop}>Back to top ↑</button>
        </div>
      </div>
    </footer>
  )
}
