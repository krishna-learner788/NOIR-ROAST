import { lazy } from 'react'
import { MotionConfig } from 'framer-motion'
import { Navigate, Route, Routes } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider'
import { RequireAdmin, RequireAuth } from './auth/Guards'
import CartProvider from './cart/CartProvider'
import CatalogueProvider from './catalogue/CatalogueProvider'
import Layout from './components/layout/Layout'
import Home from './pages/Home'

// Only the homepage is in the main bundle (it is the original experience and the LCP page).
// Everything else loads on demand, so shop/account/admin code never slows the first visit.
const Shop = lazy(() => import('./pages/shop/Shop'))
const ProductPage = lazy(() => import('./pages/shop/ProductPage'))
const Login = lazy(() => import('./pages/auth/Login'))
const Register = lazy(() => import('./pages/auth/Register'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'))
const Account = lazy(() => import('./pages/account/Account'))
const Orders = lazy(() => import('./pages/account/Orders'))
const OrderDetail = lazy(() => import('./pages/account/OrderDetail'))
const Checkout = lazy(() => import('./pages/Checkout'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'))
const AdminOrderDetail = lazy(() => import('./pages/admin/AdminOrderDetail'))
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'))
const NotFound = lazy(() => import('./pages/NotFound'))

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <CatalogueProvider>
          <CartProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="shop" element={<Shop />} />
                <Route path="shop/:id" element={<ProductPage />} />
                <Route path="login" element={<Login />} />
                <Route path="register" element={<Register />} />
                <Route path="forgot-password" element={<ForgotPassword />} />
                <Route path="reset-password" element={<ResetPassword />} />

                <Route element={<RequireAuth />}>
                  <Route path="account" element={<Account />} />
                  <Route path="account/orders" element={<Orders />} />
                  <Route path="orders/:id" element={<OrderDetail />} />
                  <Route path="checkout" element={<Checkout />} />
                </Route>

                <Route path="admin" element={<RequireAdmin />}>
                  <Route element={<AdminLayout />}>
                    <Route index element={<Navigate to="orders" replace />} />
                    <Route path="orders" element={<AdminOrders />} />
                    <Route path="orders/:id" element={<AdminOrderDetail />} />
                    <Route path="products" element={<AdminProducts />} />
                  </Route>
                </Route>

                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </CartProvider>
        </CatalogueProvider>
      </AuthProvider>
    </MotionConfig>
  )
}
