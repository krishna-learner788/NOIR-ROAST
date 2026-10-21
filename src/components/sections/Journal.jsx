import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Figure from '../ui/Figure'
import { LineReveal, Reveal, RevealGroup, RevealItem, Rule } from '../../motion/Reveal'
import { dur, ease } from '../../motion/tokens'
import './Journal.css'

const ARTICLES = [
  {
    id: 'rest',
    category: 'Craft',
    read: '3 min read',
    title: 'Why we rest every roast for five days',
    excerpt: 'Freshly roasted coffee is loud with gas. Patience is what turns it into something you can taste.',
    body: [
      'Straight out of the drum, beans are still releasing carbon dioxide. Brew them too soon and the gas pushes water away from the grounds, giving a sharp, uneven cup.',
      'After four to five days the flavour settles. Sweetness comes forward, acidity softens, and the finish gets longer. That is when we ship.',
    ],
    img: { src: '/images/journal-1.jpg', width: 1000, height: 1500, alt: 'Black coffee in a white cup on a wooden table, seen from above' },
    ratio: '4 / 5',
    feature: true,
  },
  {
    id: 'pour',
    category: 'Brewing',
    read: '2 min read',
    title: 'The 60-second bloom',
    excerpt: 'One small pour, a short wait, and a noticeably better cup.',
    body: [
      'Wet the grounds with twice their weight in water and wait about forty-five seconds. The grounds swell and release trapped gas.',
      'Then pour the rest in slow circles. The bloom is the cheapest upgrade in brewing.',
    ],
    img: { src: '/images/journal-2.jpg', width: 1000, height: 1500, alt: 'Coffee pouring into a white cup on a dark tray' },
    ratio: '3 / 2',
    objectPosition: '50% 40%',
  },
  {
    id: 'altitude',
    category: 'Origin',
    read: '4 min read',
    title: 'Altitude, density and the dark roast',
    excerpt: 'Why the coffee we roast darkest comes from the highest farms.',
    body: [
      'Cherries grown above 1,800 metres ripen slowly and make denser beans. Density gives a bean the structure to take more heat without going flat.',
      'It is how a dark roast can still taste of fruit rather than smoke.',
    ],
    img: { src: '/images/journal-3.jpg', width: 1200, height: 800, alt: 'A small glass cup of black coffee on a dark table' },
    ratio: '3 / 2',
  },
]

function Article({ a }) {
  const [open, setOpen] = useState(false)
  const bodyId = `article-${a.id}`
  return (
    <RevealItem as="article" className={`note group${a.feature ? ' note--feature' : ''}`}>
      <Figure {...a.img} ratio={a.ratio} zoom parallax={false} objectPosition={a.objectPosition} />
      <div className="note__body">
        <p className="note__meta">
          <span className="eyebrow">{a.category}</span>
          <span aria-hidden="true">·</span>
          <span>{a.read}</span>
        </p>
        <h3 className="note__title">{a.title}</h3>
        <p className="note__excerpt">{a.excerpt}</p>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              id={bodyId}
              className="note__full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: dur.ui, ease: ease.out } }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
            >
              {a.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          className="note__toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{open ? 'Close note' : 'Read the note'}</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </RevealItem>
  )
}

export default function Journal() {
  return (
    <section id="journal" className="section journal" data-theme="dark" aria-labelledby="journal-title">
      <div className="container">
        <div className="section__head">
          <div>
            <Reveal className="section__label">
              <span className="section__num">04</span>
              <Rule />
              <span className="eyebrow">Journal</span>
            </Reveal>
            <LineReveal id="journal-title" className="section__title" lines={['Notes from', ['the ', { em: 'roastery' }]]} />
          </div>
          <Reveal as="p" className="section__lead">
            Short, practical writing about roasting, brewing and the farms behind the bag.
          </Reveal>
        </div>

        <RevealGroup className="journal__grid">
          {ARTICLES.map((a) => (
            <Article key={a.id} a={a} />
          ))}
        </RevealGroup>
      </div>
    </section>
  )
}
