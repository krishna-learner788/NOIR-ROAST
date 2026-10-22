import { usePageMeta } from '../lib/meta'
import LinkButton from '../components/ui/LinkButton'
import PageHero from '../components/ui/PageHero'

/** Used for unknown routes and for unknown records (`what`), e.g. a product id that does not exist. */
export default function NotFound({ what = 'page' }) {
  usePageMeta({ title: 'Not found', noindex: true })
  return (
    <>
      <PageHero
        eyebrow="404"
        title={[['That ', what, ' has gone ', { em: 'cold' }]]}
        lead={`We could not find the ${what} you were looking for. It may have moved, or the link may be mistyped.`}
      />
      <section className="page-body" data-theme="light">
        <div className="container row">
          <LinkButton to="/shop" arrow>Browse the roasts</LinkButton>
          <LinkButton to="/" variant="secondary">Back to the homepage</LinkButton>
        </div>
      </section>
    </>
  )
}
