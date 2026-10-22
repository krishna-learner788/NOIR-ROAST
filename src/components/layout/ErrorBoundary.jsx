import { Component } from 'react'
import { Link } from 'react-router-dom'

// Catches render errors in a page so a bug never leaves a blank screen. Resets when the route changes.
export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error('Page error:', error)
  }

  componentDidUpdate(prev) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="page-body" data-theme="light">
        <div className="container stack form-narrow">
          <p className="eyebrow">Something went wrong</p>
          <h1 className="section-title">This page hit a problem.</h1>
          <p className="muted">Your bag is safe. Try reloading, or head back to the shop.</p>
          <div className="row">
            <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}><span>Reload</span></button>
            <Link className="btn btn--secondary" to="/shop"><span>Back to the shop</span></Link>
          </div>
        </div>
      </section>
    )
  }
}
