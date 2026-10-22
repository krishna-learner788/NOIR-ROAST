import { useEffect, useRef } from 'react'
import Notice from '../../components/ui/Notice'
import PageHero from '../../components/ui/PageHero'
import { useAuth } from '../../auth/useAuth'

/** Dark hero + light form column shared by the auth pages. */
export default function AuthLayout({ eyebrow, title, lead, children }) {
  const { enabled } = useAuth()
  return (
    <>
      <PageHero eyebrow={eyebrow} title={title} lead={lead} />
      <section className="page-body" data-theme="light">
        <div className="container">
          <div className="form-narrow stack">
            {!enabled && (
              <Notice tone="info" title="Accounts are not available yet">
                This preview has no backend configured, so sign-in and registration are switched off.
              </Notice>
            )}
            {children}
          </div>
        </div>
      </section>
    </>
  )
}

/**
 * Error summary that takes focus when it appears (design-system §8: "error summary focus after
 * failed submit"), so keyboard and screen-reader users land on the problem.
 */
export function ErrorSummary({ message, children }) {
  const ref = useRef(null)
  useEffect(() => {
    if (message) ref.current?.focus()
  }, [message])
  if (!message) return null
  return (
    <div ref={ref} tabIndex={-1} className="error-summary">
      <Notice tone="error" title={message}>{children}</Notice>
    </div>
  )
}
