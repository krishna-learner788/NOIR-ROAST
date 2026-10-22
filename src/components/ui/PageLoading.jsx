/** Quiet skeleton shown while a route chunk or data loads. Reserves space, no spinner (design-system §7). */
export default function PageLoading({ label = 'Loading' }) {
  return (
    <div className="page-body" aria-busy="true">
      <div className="container">
        <p className="sr-only" role="status">{label}…</p>
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--line" />
        <div className="skeleton skeleton--line skeleton--short" />
      </div>
    </div>
  )
}

export function SkeletonCards({ count = 3 }) {
  return (
    <div className="skeleton-cards" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton skeleton--image" />
          <div className="skeleton skeleton--line" />
          <div className="skeleton skeleton--line skeleton--short" />
        </div>
      ))}
    </div>
  )
}
