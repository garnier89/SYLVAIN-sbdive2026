import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Toaster } from './components/ui/sonner';
import ProtectedRoute from './components/ProtectedRoute';
import AuthCallback from './components/AuthCallback';

// Auth Pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// SB Drive Client Pages
import ClientWelcome from './pages/client/ClientWelcome';
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
import ParcelPage from './pages/user/ParcelPage';
import ServicesPage from './pages/user/ServicesPage';

// SB Drive Chauffeur Pages
import ChauffeurWelcome from './pages/chauffeur/ChauffeurWelcome';
import ChauffeurLogin from './pages/chauffeur/ChauffeurLogin';
import ChauffeurRegister from './pages/chauffeur/ChauffeurRegister';
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

const AppRouter = () => {
  const location = useLocation();
  const { user } = useAuth();

  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      {/* ======= SB DRIVE CLIENT (App Passager) ======= */}
      <Route path="/" element={user && user.role === 'user' ? <UserHome /> : !user ? <ClientWelcome /> : <Navigate to={user.role === 'driver' ? '/chauffeur/home' : user.role === 'merchant' ? '/merchant' : user.role === 'admin' ? '/admin' : '/'} replace />} />
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Client Protected Routes */}
      <Route path="/ride" element={<ProtectedRoute allowedRoles={['user']}><RideBookingPage /></ProtectedRoute>} />
      <Route path="/food" element={<ProtectedRoute allowedRoles={['user']}><FoodPage /></ProtectedRoute>} />
      <Route path="/food/:merchantId" element={<ProtectedRoute allowedRoles={['user']}><RestaurantDetail /></ProtectedRoute>} />
      <Route path="/checkout/:merchantId" element={<ProtectedRoute allowedRoles={['user']}><CheckoutPage /></ProtectedRoute>} />
      <Route path="/order/:orderId" element={<ProtectedRoute allowedRoles={['user']}><OrderTracking /></ProtectedRoute>} />
      <Route path="/parcel" element={<ProtectedRoute allowedRoles={['user']}><ParcelPage /></ProtectedRoute>} />
      <Route path="/services" element={<ProtectedRoute allowedRoles={['user']}><ServicesPage /></ProtectedRoute>} />
      <Route path="/wallet" element={<ProtectedRoute allowedRoles={['user', 'driver', 'merchant']}><WalletPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute allowedRoles={['user']}><ProfilePage /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute allowedRoles={['user']}><HistoryPage /></ProtectedRoute>} />
      <Route path="/support" element={<ProtectedRoute allowedRoles={['user', 'driver', 'merchant']}><SupportPage /></ProtectedRoute>} />

      {/* ======= SB DRIVE CHAUFFEUR (App Chauffeur) ======= */}
      <Route path="/chauffeur" element={user && user.role === 'driver' ? <Navigate to="/chauffeur/home" replace /> : !user ? <ChauffeurWelcome /> : <Navigate to="/" replace />} />
      <Route path="/chauffeur/login" element={user ? <Navigate to="/chauffeur/home" replace /> : <ChauffeurLogin />} />
      <Route path="/chauffeur/register" element={user ? <Navigate to="/chauffeur/home" replace /> : <ChauffeurRegister />} />
      <Route path="/chauffeur/home" element={<ProtectedRoute allowedRoles={['driver']}><DriverHome /></ProtectedRoute>} />
      <Route path="/chauffeur/earnings" element={<ProtectedRoute allowedRoles={['driver']}><DriverHome /></ProtectedRoute>} />
      <Route path="/driver/register" element={<ProtectedRoute allowedRoles={['user', 'driver']}><DriverRegisterPage /></ProtectedRoute>} />

      {/* ======= MERCHANT ======= */}
      <Route path="/merchant" element={<ProtectedRoute allowedRoles={['merchant']}><MerchantLayout /></ProtectedRoute>}>
        <Route index element={<MerchantDashboard />} />
        <Route path="orders" element={<MerchantOrders />} />
        <Route path="products" element={<MerchantProducts />} />
        <Route path="promotions" element={<MerchantDashboard />} />
        <Route path="analytics" element={<MerchantDashboard />} />
        <Route path="settings" element={<MerchantDashboard />} />
      </Route>

      {/* ======= ADMIN ======= */}
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminDashboard />} />
        <Route path="drivers" element={<AdminDrivers />} />
        <Route path="merchants" element={<AdminDashboard />} />
        <Route path="orders" element={<AdminDashboard />} />
        <Route path="rides" element={<AdminDashboard />} />
        <Route path="support" element={<AdminDashboard />} />
        <Route path="settings" element={<AdminDashboard />} />
      </Route>

      {/* ======= DISPATCHER ======= */}
      <Route path="/dispatcher" element={<ProtectedRoute allowedRoles={['dispatcher', 'admin']}><DispatcherPanel /></ProtectedRoute>} />

      {/* Catch-all */}
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
