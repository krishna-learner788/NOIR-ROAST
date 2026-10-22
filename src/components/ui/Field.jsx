const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5h.01" />
  </svg>
)

/**
 * Labelled form field per design-system §5.6: label above (eyebrow style), underline-only input,
 * hint beneath, error with icon + text linked through aria-describedby (never colour alone).
 * `as` may be "input" (default), "select" or "textarea".
 */
export default function Field({ id, label, error, hint, as = 'input', required = false, className = '', children, ...rest }) {
  const Tag = as
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div className={`field${error ? ' field--error' : ''} ${className}`.trim()}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required && <span className="field__req" aria-hidden="true"> *</span>}
      </label>
      <Tag
        id={id}
        className={`field__control field__control--${as}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        {...rest}
      >
        {children}
      </Tag>
      {hint && <p id={`${id}-hint`} className="field__hint">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="field__error">
          <AlertIcon />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
