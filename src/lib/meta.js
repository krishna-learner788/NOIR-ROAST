import { useEffect } from 'react'
import { config } from './config'
import { serializeJsonLd } from './jsonLd'

const SITE = 'NOIR ROAST'

function setMeta(selector, attr, value, create) {
  let el = document.head.querySelector(selector)
  if (!el && create) {
    el = document.createElement(create.tag)
    for (const [k, v] of Object.entries(create.attrs)) el.setAttribute(k, v)
    document.head.appendChild(el)
  }
  if (el) el.setAttribute(attr, value)
}

/**
 * Per-page SEO foundations: title, description, canonical, Open Graph and robots. Restores the
 * defaults on unmount. `noindex` for account, checkout and admin pages.
 * `jsonLd` (optional) is injected as a single <script type="application/ld+json">.
 */
export function usePageMeta({ title, description, path, noindex = false, image, jsonLd }) {
  const ldString = jsonLd ? serializeJsonLd(jsonLd) : ''
  useEffect(() => {
    const prevTitle = document.title
    const prevDesc = document.head.querySelector('meta[name="description"]')?.getAttribute('content')
    const fullTitle = title ? `${title} — ${SITE}` : `${SITE} — Specialty Coffee`
    document.title = fullTitle
    if (description) setMeta('meta[name="description"]', 'content', description, { tag: 'meta', attrs: { name: 'description' } })

    const base = config.siteUrl || window.location.origin
    const url = `${base}${path ?? window.location.pathname}`
    setMeta('link[rel="canonical"]', 'href', url, { tag: 'link', attrs: { rel: 'canonical' } })
    setMeta('meta[property="og:title"]', 'content', fullTitle, { tag: 'meta', attrs: { property: 'og:title' } })
    setMeta('meta[property="og:type"]', 'content', 'website', { tag: 'meta', attrs: { property: 'og:type' } })
    setMeta('meta[property="og:url"]', 'content', url, { tag: 'meta', attrs: { property: 'og:url' } })
    if (description) setMeta('meta[property="og:description"]', 'content', description, { tag: 'meta', attrs: { property: 'og:description' } })
    if (image) setMeta('meta[property="og:image"]', 'content', image.startsWith('http') ? image : `${base}${image}`, { tag: 'meta', attrs: { property: 'og:image' } })
    setMeta('meta[name="robots"]', 'content', noindex ? 'noindex, nofollow' : 'index, follow', { tag: 'meta', attrs: { name: 'robots' } })

    let ld
    if (ldString) {
      ld = document.createElement('script')
      ld.type = 'application/ld+json'
      ld.textContent = ldString
      document.head.appendChild(ld)
    }
    return () => {
      document.title = prevTitle
      if (prevDesc != null) setMeta('meta[name="description"]', 'content', prevDesc)
      setMeta('meta[name="robots"]', 'content', 'index, follow')
      ld?.remove()
    }
  }, [title, description, path, noindex, image, ldString])
}
