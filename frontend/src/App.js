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

// Landing Page
import LandingPage from './pages/LandingPage';

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
import TaxiBiddingPage from './pages/user/TaxiBiddingPage';
import RunnerPage from './pages/user/RunnerPage';
import IntercityRidePage from './pages/user/IntercityRidePage';
import ParkingPage from './pages/user/ParkingPage';
import GiftCardsPage from './pages/user/GiftCardsPage';
import TrackingServicePage from './pages/user/TrackingServicePage';
import FinancePage from './pages/user/FinancePage';
import WaybillPage from './pages/user/WaybillPage';

// SB Drive Chauffeur Pages
import ChauffeurWelcome from './pages/chauffeur/ChauffeurWelcome';
import ChauffeurLogin from './pages/chauffeur/ChauffeurLogin';
import ChauffeurRegister from './pages/chauffeur/ChauffeurRegister';
import DriverHome from './pages/driver/DriverHome';
import DriverRegisterPage from './pages/driver/DriverRegisterPage';
import DriverEarningsPage from './pages/driver/DriverEarningsPage';
import DriverHistoryPage from './pages/driver/DriverHistoryPage';
import DriverProfilePage from './pages/driver/DriverProfilePage';
import DriverSupportPage from './pages/driver/DriverSupportPage';
import DriverRewardsPage from './pages/driver/DriverRewardsPage';
import DriverWalletPage from './pages/driver/DriverWalletPage';
import DriverDocumentsPage from './pages/driver/DriverDocumentsPage';
import DriverNotificationsPage from './pages/driver/DriverNotificationsPage';

// Merchant Pages
import MerchantLayout from './pages/merchant/MerchantLayout';
import MerchantDashboard from './pages/merchant/MerchantDashboard';
import MerchantProducts from './pages/merchant/MerchantProducts';
import MerchantOrders from './pages/merchant/MerchantOrders';
import MerchantPromotions from './pages/merchant/MerchantPromotions';
import MerchantAnalytics from './pages/merchant/MerchantAnalytics';
import MerchantSettings from './pages/merchant/MerchantSettings';
import MerchantChat from './pages/merchant/MerchantChat';

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
import AdminVehicleTypes from './pages/admin/AdminVehicleTypes';
import AdminOrders from './pages/admin/AdminOrders';
import AdminStores from './pages/admin/AdminStores';
import AdminManualBooking from './pages/admin/AdminManualBooking';
import AdminBanners from './pages/admin/AdminBanners';
import AdminPayout from './pages/admin/AdminPayout';
import AdminGeoFence from './pages/admin/AdminGeoFence';
import AdminGiftCards from './pages/admin/AdminGiftCards';
import AdminReferralSettings from './pages/admin/AdminReferralSettings';
import AdminTemplates from './pages/admin/AdminTemplates';
import AdminNewsletter from './pages/admin/AdminNewsletter';
import AdminMonitoring from './pages/admin/AdminMonitoring';
import AdminManageAdmins from './pages/admin/AdminManageAdmins';
import { AdminGroups, AdminVehicles, AdminCompany, AdminHotels, AdminOrganization, AdminRequests,
  AdminVehicleMakes, AdminVehicleModels, AdminMasterServices, AdminCancelReasons,
  AdminEmailTemplates, AdminSmsTemplates, AdminSosRequests, AdminContactRequests,
  AdminWithdrawRequests, AdminOrderHelpRequests, AdminTripHelpRequests, AdminPushNotifications,
  AdminPayoutsCrud, AdminSettlementsCrud, AdminDisputesCrud, AdminDocumentsCrud
} from './pages/admin/AdminCrudPages';
import AdminServiceConfig from './pages/admin/AdminServiceConfig';
import AdminRewards from './pages/admin/AdminRewards';
import AdminPriorityDrivers from './pages/admin/AdminPriorityDrivers';
import AdminTopDriversSettings from './pages/admin/AdminTopDriversSettings';
import AdminDbBackup from './pages/admin/AdminDbBackup';
import AdminNegotiationGapReport from './pages/admin/AdminNegotiationGapReport';
import AdminFeaturedListings from './pages/admin/AdminFeaturedListings';
import AdminPaymentMethods from './pages/admin/AdminPaymentMethods';
import AdminSbPayGoZones from './pages/admin/AdminSbPayGoZones';
import TopDriversPage from './pages/TopDriversPage';
import RideChatPage from './pages/RideChatPage';
import EmergencyContactsPage from './pages/user/EmergencyContactsPage';
import FavoriteDriversPage from './pages/user/FavoriteDriversPage';
import AdminDocuments from './pages/admin/AdminDocuments';
import AdminDisputes from './pages/admin/AdminDisputes';
import AdminWalletRequests from './pages/admin/AdminWalletRequests';
import AdminSettlements from './pages/admin/AdminSettlements';

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
      {/* ======= LANDING PAGE / WEBSITE ======= */}
      <Route path="/website" element={<LandingPage />} />

      {/* ======= SB DRIVE CLIENT (App Passager) ======= */}
      <Route path="/" element={user && user.role === 'user' ? <Navigate to="/home" replace /> : !user ? <LandingPage /> : <Navigate to={user.role === 'driver' ? '/chauffeur/home' : user.role === 'merchant' ? '/merchant' : user.role === 'admin' ? '/admin' : '/home'} replace />} />
      <Route path="/top-chauffeurs" element={<TopDriversPage />} />
      <Route path="/ride/:rideId/chat" element={<ProtectedRoute><RideChatPage /></ProtectedRoute>} />
      <Route path="/safety" element={<ProtectedRoute><EmergencyContactsPage /></ProtectedRoute>} />
      <Route path="/favorite-drivers" element={<ProtectedRoute><FavoriteDriversPage /></ProtectedRoute>} />      <Route path="/home" element={<ProtectedRoute allowedRoles={['user']}><UserHome /></ProtectedRoute>} />
      <Route path="/app" element={user ? <Navigate to="/home" replace /> : <ClientWelcome />} />
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
      <Route path="/marketplace" element={<ProtectedRoute allowedRoles={['user']}><MarketplacePage /></ProtectedRoute>} />
      <Route path="/marketplace/:category" element={<ProtectedRoute allowedRoles={['user']}><MarketplacePage /></ProtectedRoute>} />
      <Route path="/nearby" element={<ProtectedRoute allowedRoles={['user']}><NearbyBusinessPage /></ProtectedRoute>} />
      <Route path="/beauty" element={<ProtectedRoute allowedRoles={['user']}><BeautyServicesPage /></ProtectedRoute>} />
      <Route path="/pet-care" element={<ProtectedRoute allowedRoles={['user']}><PetServicesPage /></ProtectedRoute>} />
      <Route path="/car-care" element={<ProtectedRoute allowedRoles={['user']}><CarCarePage /></ProtectedRoute>} />
      <Route path="/towing" element={<ProtectedRoute allowedRoles={['user']}><TowingServicesPage /></ProtectedRoute>} />
      <Route path="/more-taxi" element={<ProtectedRoute allowedRoles={['user']}><MoreTaxiServicesPage /></ProtectedRoute>} />
      <Route path="/video-consult" element={<ProtectedRoute allowedRoles={['user']}><VideoConsultPage /></ProtectedRoute>} />
      <Route path="/bidding" element={<ProtectedRoute allowedRoles={['user']}><BiddingPage /></ProtectedRoute>} />
      <Route path="/services-bidding" element={<ProtectedRoute allowedRoles={['user']}><BiddingPage /></ProtectedRoute>} />
      <Route path="/taxi-bidding" element={<ProtectedRoute allowedRoles={['user']}><TaxiBiddingPage /></ProtectedRoute>} />
      <Route path="/runner" element={<ProtectedRoute allowedRoles={['user']}><RunnerPage /></ProtectedRoute>} />
      <Route path="/intercity" element={<ProtectedRoute allowedRoles={['user']}><IntercityRidePage /></ProtectedRoute>} />
      <Route path="/parking" element={<ProtectedRoute allowedRoles={['user']}><ParkingPage /></ProtectedRoute>} />
      <Route path="/giftcards" element={<ProtectedRoute allowedRoles={['user']}><GiftCardsPage /></ProtectedRoute>} />
      <Route path="/tracking" element={<ProtectedRoute allowedRoles={['user']}><TrackingServicePage /></ProtectedRoute>} />
      <Route path="/finance" element={<ProtectedRoute allowedRoles={['user', 'driver']}><FinancePage /></ProtectedRoute>} />
      <Route path="/ride/:rideId/waybill" element={<ProtectedRoute allowedRoles={['user', 'driver']}><WaybillPage /></ProtectedRoute>} />
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
      <Route path="/chauffeur/rewards" element={<ProtectedRoute allowedRoles={['driver']}><DriverRewardsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/support/:section" element={<ProtectedRoute allowedRoles={['driver']}><DriverSupportPage /></ProtectedRoute>} />
      <Route path="/chauffeur/wallet" element={<ProtectedRoute allowedRoles={['driver']}><DriverWalletPage /></ProtectedRoute>} />
      <Route path="/chauffeur/documents" element={<ProtectedRoute allowedRoles={['driver']}><DriverDocumentsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/notifications" element={<ProtectedRoute allowedRoles={['driver']}><DriverNotificationsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/livechat" element={<ProtectedRoute allowedRoles={['driver']}><LiveChatPage /></ProtectedRoute>} />
      <Route path="/driver/register" element={<ProtectedRoute allowedRoles={['user', 'driver']}><DriverRegisterPage /></ProtectedRoute>} />

      {/* ======= MERCHANT ======= */}
      <Route path="/merchant" element={<ProtectedRoute allowedRoles={['merchant']}><MerchantLayout /></ProtectedRoute>}>
        <Route index element={<MerchantDashboard />} />
        <Route path="orders" element={<MerchantOrders />} />
        <Route path="products" element={<MerchantProducts />} />
        <Route path="promotions" element={<MerchantPromotions />} />
        <Route path="analytics" element={<MerchantAnalytics />} />
        <Route path="settings" element={<MerchantSettings />} />
        <Route path="chat" element={<MerchantChat />} />
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
        <Route path="monitoring" element={<AdminMonitoring />} />
        <Route path="admins" element={<AdminManageAdmins />} />
        <Route path="groups" element={<AdminGroups />} />
        <Route path="vehicles" element={<AdminVehicles />} />
        <Route path="requests" element={<AdminRequests />} />
        <Route path="documents" element={<AdminDocumentsCrud />} />
        <Route path="company" element={<AdminCompany />} />
        <Route path="hotels" element={<AdminHotels />} />
        <Route path="organization" element={<AdminOrganization />} />
        <Route path="vehicle-types" element={<AdminVehicleTypes />} />
        <Route path="parcels" element={<AdminOrders />} />
        <Route path="store-delivery" element={<AdminOrders />} />
        <Route path="genie" element={<AdminServiceConfig serviceKey="genie" />} />
        <Route path="runner" element={<AdminServiceConfig serviceKey="runner" />} />
        <Route path="ondemand" element={<AdminServiceConfig serviceKey="ondemand" />} />
        <Route path="video" element={<AdminServiceConfig serviceKey="video" />} />
        <Route path="bids" element={<AdminServiceConfig serviceKey="bids" />} />
        <Route path="marketplace" element={<AdminServiceConfig serviceKey="marketplace" />} />
        <Route path="medical" element={<AdminServiceConfig serviceKey="medical" />} />
        <Route path="rideshare" element={<AdminServiceConfig serviceKey="rideshare" />} />
        <Route path="nearby" element={<AdminServiceConfig serviceKey="nearby" />} />
        <Route path="tracking" element={<AdminServiceConfig serviceKey="tracking" />} />
        <Route path="manual-booking" element={<AdminManualBooking />} />
        <Route path="later-bookings" element={<AdminManualBooking />} />
        <Route path="create-order" element={<AdminManualBooking />} />
        <Route path="payout" element={<AdminPayoutsCrud />} />
        <Route path="settlements" element={<AdminSettlementsCrud />} />
        <Route path="disputes" element={<AdminDisputesCrud />} />
        <Route path="wallet-requests" element={<AdminWithdrawRequests />} />
        <Route path="rewards" element={<AdminRewards />} />
        <Route path="rewards-reports" element={<AdminRewards />} />
        <Route path="priority-drivers" element={<AdminPriorityDrivers />} />
        <Route path="top-drivers" element={<AdminTopDriversSettings />} />
        {/* NEW DASHBOARD MISSING PAGES */}
        <Route path="vehicle-makes" element={<AdminVehicleMakes />} />
        <Route path="vehicle-models" element={<AdminVehicleModels />} />
        <Route path="master-services" element={<AdminMasterServices />} />
        <Route path="cancel-reasons" element={<AdminCancelReasons />} />
        <Route path="email-templates" element={<AdminEmailTemplates />} />
        <Route path="sms-templates" element={<AdminSmsTemplates />} />
        <Route path="sos-requests" element={<AdminSosRequests />} />
        <Route path="contact-requests" element={<AdminContactRequests />} />
        <Route path="withdraw-requests" element={<AdminWithdrawRequests />} />
        <Route path="order-help-requests" element={<AdminOrderHelpRequests />} />
        <Route path="trip-help-requests" element={<AdminTripHelpRequests />} />
        <Route path="push-notifications" element={<AdminPushNotifications />} />
        {/* Settings & Utilities extras */}
        <Route path="payment-options" element={<AdminPaymentMethods />} />
        <Route path="payment-methods" element={<AdminPaymentMethods />} />
        <Route path="sbpaygo-zones" element={<AdminSbPayGoZones />} />
        <Route path="currency" element={<AdminServiceConfig serviceKey="currency" />} />
        <Route path="language" element={<AdminServiceConfig serviceKey="language" />} />
        <Route path="seo" element={<AdminServiceConfig serviceKey="seo" />} />
        <Route path="maps-api" element={<AdminServiceConfig serviceKey="maps-api" />} />
        <Route path="db-backup" element={<AdminDbBackup />} />
        <Route path="reports/negotiation-gap" element={<AdminNegotiationGapReport />} />
        <Route path="featured-listings" element={<AdminFeaturedListings />} />
        <Route path="store-orders" element={<AdminOrders />} />
        <Route path="geo-fence" element={<AdminGeoFence />} />
        <Route path="restricted" element={<AdminGeoFence />} />
        <Route path="location-fare" element={<AdminServiceConfig serviceKey="location-fare" />} />
        <Route path="airport" element={<AdminGeoFence />} />
        <Route path="country" element={<AdminServiceConfig serviceKey="country" />} />
        <Route path="state" element={<AdminServiceConfig serviceKey="state" />} />
        <Route path="giftcards" element={<AdminGiftCards />} />
        <Route path="referral" element={<AdminReferralSettings />} />
        <Route path="banners" element={<AdminBanners />} />
        <Route path="news" element={<AdminNewsletter />} />
        <Route path="stores" element={<AdminStores />} />
        <Route path="newsletter" element={<AdminNewsletter />} />
        <Route path="pages" element={<AdminServiceConfig serviceKey="pages" />} />
        <Route path="app-home" element={<AdminServiceConfig serviceKey="app-home" />} />
        <Route path="intro" element={<AdminServiceConfig serviceKey="intro" />} />
        <Route path="labels" element={<AdminServiceConfig serviceKey="labels" />} />
        <Route path="email-templates" element={<AdminTemplates />} />
        <Route path="sms-templates" element={<AdminTemplates />} />
        <Route path="cancel-reasons" element={<AdminServiceConfig serviceKey="cancel-reasons" />} />
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
