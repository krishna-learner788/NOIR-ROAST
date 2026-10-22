import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Notice from '../components/ui/Notice'
import PageLoading from '../components/ui/PageLoading'
import { useAuth } from './useAuth'

/** UX gate only. The real protection is RLS + server-side checks; this just avoids dead-end screens. */
export function RequireAuth() {
  const { enabled, loading, user } = useAuth()
  const location = useLocation()
  if (!enabled) {
    return (
      <div className="page-body">
        <div className="container">
          <Notice tone="info" title="Accounts are not available yet">
            This preview has no backend configured, so sign-in and checkout are switched off. Browsing and the bag still work.
          </Notice>
        </div>
      </div>
    )
  }
  if (loading) return <PageLoading label="Checking your session" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}

export function RequireAdmin() {
  const { loading, isAdmin, user } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoading label="Checking your access" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!isAdmin) {
    return (
      <div className="page-body">
        <div className="container">
          <Notice tone="error" title="Administrators only">
            Your account does not have access to this area.
          </Notice>
        </div>
      </div>
    )
  }
  return <Outlet />
}
