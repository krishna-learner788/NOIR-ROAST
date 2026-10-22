import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Footer from '../sections/Footer'
import Nav from '../sections/Nav'
import PageLoading from '../ui/PageLoading'
import ScrollProgress from '../ui/ScrollProgress'
import ErrorBoundary from './ErrorBoundary'
import PageFade from './PageFade'
import ScrollManager from './ScrollManager'
import '../../pages/pages.css'

// Same shell the single-page site had (skip link, progress hairline, nav, <main id="main">, footer);
// routes render inside <main>.
export default function Layout() {
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  const page = (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  )
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <ScrollProgress />
      <ScrollManager />
      <Nav />
      <main id="main">{isHome ? page : <PageFade key={pathname}>{page}</PageFade>}</main>
      <Footer />
    </>
  )
}
