const LABEL = { info: 'Note', success: 'Success', warning: 'Please note', error: 'Problem' }

/** Inline message. tone: info | success | warning | error. Errors are announced immediately (role=alert). */
export default function Notice({ tone = 'info', title, children, className = '', ...rest }) {
  return (
    <div className={`notice notice--${tone} ${className}`.trim()} role={tone === 'error' ? 'alert' : 'status'} {...rest}>
      <p className="notice__title">
        <span className="notice__tag">{LABEL[tone]}</span>
        {title && <strong>{title}</strong>}
      </p>
      {children && <div className="notice__body">{children}</div>}
    </div>
  )
}
