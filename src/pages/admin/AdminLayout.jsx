import { NavLink, Outlet } from 'react-router-dom'
import PageHero from '../../components/ui/PageHero'
import { usePageMeta } from '../../lib/meta'

// NavLink sets aria-current="page" on the active tab (styled in pages.css), including for nested
// routes such as /admin/orders/:id.
export default function AdminLayout() {
  usePageMeta({ title: 'Admin', noindex: true })
  return (
    <>
      <PageHero eyebrow="Administration" title={[['The ', { em: 'back room' }]]} />
      <section className="page-body" data-theme="light">
        <div className="container">
          <nav className="tabs" aria-label="Admin sections">
            <NavLink to="/admin/orders">Orders</NavLink>
            <NavLink to="/admin/products">Products</NavLink>
          </nav>
          <Outlet />
        </div>
      </section>
    </>
  )
}
