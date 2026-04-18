import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LocaleProvider } from './contexts/LocaleContext';
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
import RideTrackingPage from './pages/user/RideTrackingPage';
import FoodPage from './pages/user/FoodPage';
import RestaurantDetail from './pages/user/RestaurantDetail';
import CheckoutPage from './pages/user/CheckoutPage';
import OrderTracking from './pages/user/OrderTracking';
import WalletPage from './pages/user/WalletPage';
import ProfilePage from './pages/user/ProfilePage';
import HistoryPage from './pages/user/HistoryPage';
import SupportPage from './pages/user/SupportPage';
import ParcelPage from './pages/user/ParcelPage';
import ReferralPage from './pages/user/ReferralPage';
import DonationPage from './pages/user/DonationPage';
import LiveChatPage from './pages/user/LiveChatPage';
import ServicesPage from './pages/user/ServicesPage';
import AllDeliveryPage from './pages/user/AllDeliveryPage';
import AllServicesPage from './pages/user/AllServicesPage';
import CarPoolPage from './pages/user/CarPoolPage';
import MarketplacePage from './pages/user/MarketplacePage';
import NearbyBusinessPage from './pages/user/NearbyBusinessPage';
import BeautyServicesPage from './pages/user/BeautyServicesPage';
import PetServicesPage from './pages/user/PetServicesPage';
import CarCarePage from './pages/user/CarCarePage';
import TowingServicesPage from './pages/user/TowingServicesPage';
import MoreTaxiServicesPage from './pages/user/MoreTaxiServicesPage';
import VideoConsultPage from './pages/user/VideoConsultPage';
import BiddingPage from './pages/user/BiddingPage';
import IntercityRidePage from './pages/user/IntercityRidePage';
import ParkingPage from './pages/user/ParkingPage';
import GiftCardsPage from './pages/user/GiftCardsPage';
import TrackingServicePage from './pages/user/TrackingServicePage';

// SB Drive Chauffeur Pages
import ChauffeurWelcome from './pages/chauffeur/ChauffeurWelcome';
import ChauffeurLogin from './pages/chauffeur/ChauffeurLogin';
import ChauffeurRegister from './pages/chauffeur/ChauffeurRegister';
import DriverHome from './pages/driver/DriverHome';
import DriverRegisterPage from './pages/driver/DriverRegisterPage';
import DriverEarningsPage from './pages/driver/DriverEarningsPage';
import DriverHistoryPage from './pages/driver/DriverHistoryPage';
import DriverProfilePage from './pages/driver/DriverProfilePage';

// Merchant Pages
import MerchantLayout from './pages/merchant/MerchantLayout';
import MerchantDashboard from './pages/merchant/MerchantDashboard';
import MerchantProducts from './pages/merchant/MerchantProducts';
import MerchantOrders from './pages/merchant/MerchantOrders';

// Admin Pages
import AdminLayout from './pages/admin/AdminLayout';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminDrivers from './pages/admin/AdminDrivers';
import AdminUsers from './pages/admin/AdminUsers';
import AdminRides from './pages/admin/AdminRides';
import AdminRevenue from './pages/admin/AdminRevenue';
import AdminSupport from './pages/admin/AdminSupport';
import AdminSettings from './pages/admin/AdminSettings';
import AdminGodsView from './pages/admin/AdminGodsView';
import AdminHeatView from './pages/admin/AdminHeatView';
import AdminPromocodes from './pages/admin/AdminPromocodes';
import AdminPlaceholder from './pages/admin/AdminPlaceholder';

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
      <Route path="/" element={user && user.role === 'user' ? <Navigate to="/home" replace /> : !user ? <ClientWelcome /> : <Navigate to={user.role === 'driver' ? '/chauffeur/home' : user.role === 'merchant' ? '/merchant' : user.role === 'admin' ? '/admin' : '/home'} replace />} />
      <Route path="/home" element={<ProtectedRoute allowedRoles={['user']}><UserHome /></ProtectedRoute>} />
      <Route path="/login" element={user ? <Navigate to="/home" replace /> : <LoginPage />} />
      <Route path="/admin-login" element={user?.role === 'admin' ? <Navigate to="/admin" replace /> : <AdminLoginPage />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Client Protected Routes */}
      <Route path="/ride" element={<ProtectedRoute allowedRoles={['user']}><RideBookingPage /></ProtectedRoute>} />
      <Route path="/ride/:rideId" element={<ProtectedRoute allowedRoles={['user']}><RideTrackingPage /></ProtectedRoute>} />
      <Route path="/food" element={<ProtectedRoute allowedRoles={['user']}><FoodPage /></ProtectedRoute>} />
      <Route path="/food/:merchantId" element={<ProtectedRoute allowedRoles={['user']}><RestaurantDetail /></ProtectedRoute>} />
      <Route path="/checkout/:merchantId" element={<ProtectedRoute allowedRoles={['user']}><CheckoutPage /></ProtectedRoute>} />
      <Route path="/order/:orderId" element={<ProtectedRoute allowedRoles={['user']}><OrderTracking /></ProtectedRoute>} />
      <Route path="/parcel" element={<ProtectedRoute allowedRoles={['user']}><ParcelPage /></ProtectedRoute>} />
      <Route path="/services" element={<ProtectedRoute allowedRoles={['user']}><ServicesPage /></ProtectedRoute>} />
      <Route path="/all-delivery" element={<ProtectedRoute allowedRoles={['user']}><AllDeliveryPage /></ProtectedRoute>} />
      <Route path="/all-services" element={<ProtectedRoute allowedRoles={['user']}><AllServicesPage /></ProtectedRoute>} />
      <Route path="/carpool" element={<ProtectedRoute allowedRoles={['user']}><CarPoolPage /></ProtectedRoute>} />
      <Route path="/marketplace/:type" element={<ProtectedRoute allowedRoles={['user']}><MarketplacePage /></ProtectedRoute>} />
      <Route path="/nearby" element={<ProtectedRoute allowedRoles={['user']}><NearbyBusinessPage /></ProtectedRoute>} />
      <Route path="/beauty" element={<ProtectedRoute allowedRoles={['user']}><BeautyServicesPage /></ProtectedRoute>} />
      <Route path="/pet-care" element={<ProtectedRoute allowedRoles={['user']}><PetServicesPage /></ProtectedRoute>} />
      <Route path="/car-care" element={<ProtectedRoute allowedRoles={['user']}><CarCarePage /></ProtectedRoute>} />
      <Route path="/towing" element={<ProtectedRoute allowedRoles={['user']}><TowingServicesPage /></ProtectedRoute>} />
      <Route path="/more-taxi" element={<ProtectedRoute allowedRoles={['user']}><MoreTaxiServicesPage /></ProtectedRoute>} />
      <Route path="/video-consult" element={<ProtectedRoute allowedRoles={['user']}><VideoConsultPage /></ProtectedRoute>} />
      <Route path="/bidding" element={<ProtectedRoute allowedRoles={['user']}><BiddingPage /></ProtectedRoute>} />
      <Route path="/intercity" element={<ProtectedRoute allowedRoles={['user']}><IntercityRidePage /></ProtectedRoute>} />
      <Route path="/parking" element={<ProtectedRoute allowedRoles={['user']}><ParkingPage /></ProtectedRoute>} />
      <Route path="/giftcards" element={<ProtectedRoute allowedRoles={['user']}><GiftCardsPage /></ProtectedRoute>} />
      <Route path="/tracking" element={<ProtectedRoute allowedRoles={['user']}><TrackingServicePage /></ProtectedRoute>} />
      <Route path="/wallet" element={<ProtectedRoute allowedRoles={['user', 'driver', 'merchant']}><WalletPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute allowedRoles={['user']}><ProfilePage /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute allowedRoles={['user']}><HistoryPage /></ProtectedRoute>} />
      <Route path="/referral" element={<ProtectedRoute allowedRoles={['user']}><ReferralPage /></ProtectedRoute>} />
      <Route path="/donation" element={<ProtectedRoute allowedRoles={['user']}><DonationPage /></ProtectedRoute>} />
      <Route path="/livechat" element={<ProtectedRoute allowedRoles={['user']}><LiveChatPage /></ProtectedRoute>} />
      <Route path="/support" element={<ProtectedRoute allowedRoles={['user', 'driver', 'merchant']}><SupportPage /></ProtectedRoute>} />

      {/* ======= SB DRIVE CHAUFFEUR (App Chauffeur) ======= */}
      <Route path="/chauffeur" element={user && user.role === 'driver' ? <Navigate to="/chauffeur/home" replace /> : !user ? <ChauffeurWelcome /> : <Navigate to="/" replace />} />
      <Route path="/chauffeur/login" element={user ? <Navigate to="/chauffeur/home" replace /> : <ChauffeurLogin />} />
      <Route path="/chauffeur/register" element={user ? <Navigate to="/chauffeur/home" replace /> : <ChauffeurRegister />} />
      <Route path="/chauffeur/home" element={<ProtectedRoute allowedRoles={['driver']}><DriverHome /></ProtectedRoute>} />
      <Route path="/chauffeur/earnings" element={<ProtectedRoute allowedRoles={['driver']}><DriverEarningsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/history" element={<ProtectedRoute allowedRoles={['driver']}><DriverHistoryPage /></ProtectedRoute>} />
      <Route path="/chauffeur/profile" element={<ProtectedRoute allowedRoles={['driver']}><DriverProfilePage /></ProtectedRoute>} />
      <Route path="/chauffeur/livechat" element={<ProtectedRoute allowedRoles={['driver']}><LiveChatPage /></ProtectedRoute>} />
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
        {/* MEMBERS */}
        <Route path="users" element={<AdminUsers />} />
        <Route path="drivers" element={<AdminDrivers />} />
        {/* SERVICES */}
        <Route path="rides" element={<AdminRides />} />
        {/* BOOKINGS & REPORTS */}
        <Route path="trips" element={<AdminRides />} />
        <Route path="reviews" element={<AdminSupport />} />
        <Route path="revenue" element={<AdminRevenue />} />
        {/* LOCATION */}
        <Route path="gods-view" element={<AdminGodsView />} />
        <Route path="heat-view" element={<AdminHeatView />} />
        {/* PROMOTIONS */}
        <Route path="promocodes" element={<AdminPromocodes />} />
        {/* SYSTEM */}
        <Route path="settings" element={<AdminSettings />} />
        {/* Placeholder for all other admin routes */}
        <Route path="monitoring" element={<AdminPlaceholder />} />
        <Route path="admins" element={<AdminPlaceholder />} />
        <Route path="groups" element={<AdminPlaceholder />} />
        <Route path="vehicles" element={<AdminPlaceholder />} />
        <Route path="requests" element={<AdminPlaceholder />} />
        <Route path="company" element={<AdminPlaceholder />} />
        <Route path="stores" element={<AdminPlaceholder />} />
        <Route path="hotels" element={<AdminPlaceholder />} />
        <Route path="organization" element={<AdminPlaceholder />} />
        <Route path="vehicle-types" element={<AdminPlaceholder />} />
        <Route path="parcels" element={<AdminPlaceholder />} />
        <Route path="store-delivery" element={<AdminPlaceholder />} />
        <Route path="genie" element={<AdminPlaceholder />} />
        <Route path="runner" element={<AdminPlaceholder />} />
        <Route path="ondemand" element={<AdminPlaceholder />} />
        <Route path="video" element={<AdminPlaceholder />} />
        <Route path="bids" element={<AdminPlaceholder />} />
        <Route path="marketplace" element={<AdminPlaceholder />} />
        <Route path="medical" element={<AdminPlaceholder />} />
        <Route path="rideshare" element={<AdminPlaceholder />} />
        <Route path="nearby" element={<AdminPlaceholder />} />
        <Route path="tracking" element={<AdminPlaceholder />} />
        <Route path="manual-booking" element={<AdminPlaceholder />} />
        <Route path="later-bookings" element={<AdminPlaceholder />} />
        <Route path="create-order" element={<AdminPlaceholder />} />
        <Route path="payout" element={<AdminPlaceholder />} />
        <Route path="geo-fence" element={<AdminPlaceholder />} />
        <Route path="restricted" element={<AdminPlaceholder />} />
        <Route path="location-fare" element={<AdminPlaceholder />} />
        <Route path="airport" element={<AdminPlaceholder />} />
        <Route path="country" element={<AdminPlaceholder />} />
        <Route path="state" element={<AdminPlaceholder />} />
        <Route path="giftcards" element={<AdminPlaceholder />} />
        <Route path="referral" element={<AdminPlaceholder />} />
        <Route path="banners" element={<AdminPlaceholder />} />
        <Route path="news" element={<AdminPlaceholder />} />
        <Route path="newsletter" element={<AdminPlaceholder />} />
        <Route path="pages" element={<AdminPlaceholder />} />
        <Route path="app-home" element={<AdminPlaceholder />} />
        <Route path="intro" element={<AdminPlaceholder />} />
        <Route path="labels" element={<AdminPlaceholder />} />
        <Route path="email-templates" element={<AdminPlaceholder />} />
        <Route path="sms-templates" element={<AdminPlaceholder />} />
        <Route path="cancel-reasons" element={<AdminPlaceholder />} />
        <Route path="support" element={<AdminSupport />} />
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
        <LocaleProvider>
          <AppRouter />
          <Toaster position="top-center" />
        </LocaleProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
