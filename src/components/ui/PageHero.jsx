import { LineReveal, Reveal, Rule } from '../../motion/Reveal'

/**
 * Dark editorial header band for inner pages (the homepage keeps its own hero).
 * `title` is LineReveal's `lines`: an array of lines, each a string or an array of parts that may
 * include { em: 'word' }, e.g. [['Your ', { em: 'bag' }]].
 */
export default function PageHero({ eyebrow, title, lead, children }) {
  return (
    <section className="page-hero" data-theme="dark">
      <div className="container page-hero__inner">
        {eyebrow && (
          <Reveal className="section__label">
            <Rule />
            <span className="eyebrow">{eyebrow}</span>
          </Reveal>
        )}
        <LineReveal as="h1" className="page-hero__title" lines={title} />
        {lead && <Reveal as="p" className="page-hero__lead" delay={0.15}>{lead}</Reveal>}
        {children}
      </div>
    </section>
  )
}
