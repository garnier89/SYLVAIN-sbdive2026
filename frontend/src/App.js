import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Toaster } from './components/ui/sonner';
import ProtectedRoute from './components/ProtectedRoute';
import AuthCallback from './components/AuthCallback';

// Auth Pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// User Pages
import UserHome from './pages/user/UserHome';
import RideBookingPage from './pages/user/RideBookingPage';
import FoodPage from './pages/user/FoodPage';
import RestaurantDetail from './pages/user/RestaurantDetail';
import CheckoutPage from './pages/user/CheckoutPage';
import OrderTracking from './pages/user/OrderTracking';
import WalletPage from './pages/user/WalletPage';
import ProfilePage from './pages/user/ProfilePage';
import HistoryPage from './pages/user/HistoryPage';
import SupportPage from './pages/user/SupportPage';

// Driver Pages
import DriverHome from './pages/driver/DriverHome';
import DriverRegisterPage from './pages/driver/DriverRegisterPage';

// Merchant Pages
import MerchantLayout from './pages/merchant/MerchantLayout';
import MerchantDashboard from './pages/merchant/MerchantDashboard';
import MerchantProducts from './pages/merchant/MerchantProducts';
import MerchantOrders from './pages/merchant/MerchantOrders';

// Admin Pages
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminDrivers from './pages/admin/AdminDrivers';

// Dispatcher Pages
import DispatcherPanel from './pages/dispatcher/DispatcherPanel';

import './index.css';

// AppRouter component that checks for session_id in hash
const AppRouter = () => {
  const location = useLocation();
  const { user, loading } = useAuth();

  // Check URL fragment for session_id (OAuth callback)
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      {/* Auth Routes */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* User Routes */}
      <Route path="/" element={
        <ProtectedRoute allowedRoles={['user']}>
          <UserHome />
        </ProtectedRoute>
      } />
      <Route path="/ride" element={
        <ProtectedRoute allowedRoles={['user']}>
          <RideBookingPage />
        </ProtectedRoute>
      } />
      <Route path="/food" element={
        <ProtectedRoute allowedRoles={['user']}>
          <FoodPage />
        </ProtectedRoute>
      } />
      <Route path="/food/:merchantId" element={
        <ProtectedRoute allowedRoles={['user']}>
          <RestaurantDetail />
        </ProtectedRoute>
      } />
      <Route path="/checkout/:merchantId" element={
        <ProtectedRoute allowedRoles={['user']}>
          <CheckoutPage />
        </ProtectedRoute>
      } />
      <Route path="/order/:orderId" element={
        <ProtectedRoute allowedRoles={['user']}>
          <OrderTracking />
        </ProtectedRoute>
      } />
      <Route path="/parcel" element={
        <ProtectedRoute allowedRoles={['user']}>
          <RideBookingPage />
        </ProtectedRoute>
      } />
      <Route path="/wallet" element={
        <ProtectedRoute allowedRoles={['user', 'driver', 'merchant']}>
          <WalletPage />
        </ProtectedRoute>
      } />
      <Route path="/profile" element={
        <ProtectedRoute allowedRoles={['user']}>
          <ProfilePage />
        </ProtectedRoute>
      } />
      <Route path="/history" element={
        <ProtectedRoute allowedRoles={['user']}>
          <HistoryPage />
        </ProtectedRoute>
      } />
      <Route path="/support" element={
        <ProtectedRoute allowedRoles={['user', 'driver', 'merchant']}>
          <SupportPage />
        </ProtectedRoute>
      } />

      {/* Driver Routes */}
      <Route path="/driver" element={
        <ProtectedRoute allowedRoles={['driver']}>
          <DriverHome />
        </ProtectedRoute>
      } />
      <Route path="/driver/register" element={
        <ProtectedRoute allowedRoles={['user', 'driver']}>
          <DriverRegisterPage />
        </ProtectedRoute>
      } />
      <Route path="/driver/earnings" element={
        <ProtectedRoute allowedRoles={['driver']}>
          <DriverHome />
        </ProtectedRoute>
      } />

      {/* Merchant Routes */}
      <Route path="/merchant" element={
        <ProtectedRoute allowedRoles={['merchant']}>
          <MerchantLayout />
        </ProtectedRoute>
      }>
        <Route index element={<MerchantDashboard />} />
        <Route path="orders" element={<MerchantOrders />} />
        <Route path="products" element={<MerchantProducts />} />
        <Route path="promotions" element={<MerchantDashboard />} />
        <Route path="analytics" element={<MerchantDashboard />} />
        <Route path="settings" element={<MerchantDashboard />} />
      </Route>

      {/* Admin Routes */}
      <Route path="/admin" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <AdminLayout />
        </ProtectedRoute>
      }>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminDashboard />} />
        <Route path="drivers" element={<AdminDrivers />} />
        <Route path="merchants" element={<AdminDashboard />} />
        <Route path="orders" element={<AdminDashboard />} />
        <Route path="rides" element={<AdminDashboard />} />
        <Route path="support" element={<AdminDashboard />} />
        <Route path="settings" element={<AdminDashboard />} />
      </Route>

      {/* Dispatcher Routes */}
      <Route path="/dispatcher" element={
        <ProtectedRoute allowedRoles={['dispatcher', 'admin']}>
          <DispatcherPanel />
        </ProtectedRoute>
      } />

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
        <Toaster position="top-center" />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
