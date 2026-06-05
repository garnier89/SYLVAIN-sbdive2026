import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LocaleProvider } from './contexts/LocaleContext';
import { Toaster } from './components/ui/sonner';
import InstallPWA from './components/InstallPWA';
import ProtectedRoute from './components/ProtectedRoute';
import AuthCallback from './components/AuthCallback';

// Auth Pages
import LoginPage from './pages/auth/LoginPage';
import EmailLoginPage from './pages/auth/EmailLoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// Landing Page
import LandingPage from './pages/LandingPage';
import VoiceAssistant from './components/VoiceAssistant';

// SB Drive Client Pages
import ClientWelcome from './pages/client/ClientWelcome';
import UserHome from './pages/user/UserHome';
import RideBookingPage from './pages/user/RideBookingPage';
import RideTrackingPage from './pages/user/RideTrackingPage';
import RideReceiptPage from './pages/user/RideReceiptPage';
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
import MedicalAppointmentPage from './pages/user/MedicalAppointmentPage';
import MedicalTransportPage from './pages/user/MedicalTransportPage';
import DeliveryTrackingPage from './pages/user/DeliveryTrackingPage';
import DeliveryJobsPage from './pages/driver/DeliveryJobsPage';
import RealEstatePage from './pages/user/realestate/RealEstatePage';
import PropertyDetailPage from './pages/user/realestate/PropertyDetailPage';
import PostPropertyPage from './pages/user/realestate/PostPropertyPage';
import MyPropertiesPage from './pages/user/realestate/MyPropertiesPage';
import PharmacyPage from './pages/user/pharmacy/PharmacyPage';
import PharmacyCatalogPage from './pages/user/pharmacy/PharmacyCatalogPage';
import PharmacyPrescriptionPage from './pages/user/pharmacy/PharmacyPrescriptionPage';
import PharmacyOrdersPage from './pages/user/pharmacy/PharmacyOrdersPage';
import BiddingPage from './pages/user/BiddingPage';
import TaxiBiddingPage from './pages/user/TaxiBiddingPage';
import AdvancedTaxiBookingPage from './pages/user/AdvancedTaxiBookingPage';
import CorporateAccountPage from './pages/user/CorporateAccountPage';
import TaxiHubPage from './pages/user/TaxiHubPage';
import ServicesHubPage from './pages/user/ServicesHubPage';
import ServiceBookingFlow from './components/ServiceBookingFlow';
import MyServiceBookingsPage from './pages/user/MyServiceBookingsPage';
import ScheduledRidesPage from './pages/user/ScheduledRidesPage';
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
import DriverScorePage from './pages/driver/DriverScorePage';
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
import AdminLiveRides from './pages/admin/AdminLiveRides';
import AdminAutoDispatch from './pages/admin/AdminAutoDispatch';
import AdminManageAdmins from './pages/admin/AdminManageAdmins';
import { AdminGroups, AdminVehicles, AdminCompany, AdminHotels, AdminOrganization, AdminRequests,
  AdminVehicleMakes, AdminVehicleModels, AdminMasterServices, AdminCancelReasons,
  AdminEmailTemplates, AdminSmsTemplates, AdminSosRequests, AdminContactRequests,
  AdminWithdrawRequests, AdminOrderHelpRequests, AdminTripHelpRequests, AdminPushNotifications,
  AdminPayoutsCrud, AdminSettlementsCrud, AdminDisputesCrud, AdminDocumentsCrud,
  AdminWeatherSurcharge, AdminPersonalDriver, AdminAutoPromotions, AdminVouchers,
  AdminFaqs, AdminHelpArticles, AdminDonations
} from './pages/admin/AdminCrudPages';
import AdminServiceConfig from './pages/admin/AdminServiceConfig';
import AdminRewards from './pages/admin/AdminRewards';
import AdminPriorityDrivers from './pages/admin/AdminPriorityDrivers';
import AdminTopDriversSettings from './pages/admin/AdminTopDriversSettings';
import AdminDbBackup from './pages/admin/AdminDbBackup';
import AdminNegotiationGapReport from './pages/admin/AdminNegotiationGapReport';
import AdminFeaturedListings from './pages/admin/AdminFeaturedListings';
import AdminRealEstate from './pages/admin/AdminRealEstate';
import AdminPharmacy from './pages/admin/AdminPharmacy';
import AdminServiceSettings from './pages/admin/AdminServiceSettings';
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

// SB Drive Tab (Kiosk)
import KioskApp from './pages/kiosk/KioskApp';
import AdminKiosks from './pages/admin/AdminKiosks';

// Role-based Panels (Dispatch, Billing, Server, Users-Admin, Drivers-Admin, Merchants-Admin)
import PanelLayout from './pages/panels/PanelLayout';
import PanelHome from './pages/panels/PanelHome';

// V3Cube enhancements (Iteration 74-75)
import AdminACL from './pages/admin/AdminACL';
import AdminAuditLogs from './pages/admin/AdminAuditLogs';
import AdminOrganizations from './pages/admin/AdminOrganizations';
import AdminCorporate from './pages/admin/AdminCorporate';
import AdminHomeCategories from './pages/admin/AdminHomeCategories';
import AdminI18n from './pages/admin/AdminI18n';
import AdminGroupsPage from './pages/admin/AdminGroupsPage';
import AdminUserEdit from './pages/admin/AdminUserEdit';
import DriverSubscriptions from './pages/driver/DriverSubscriptions';

// V3Cube Pack B — Driver Pro
import ManageVehiclesPage from './pages/driver/ManageVehiclesPage';
import BankDetailsPage from './pages/driver/BankDetailsPage';
import DriverEarningsStatsPage from './pages/driver/DriverEarningsStatsPage';
import DriverGalleryPage from './pages/driver/DriverGalleryPage';
import AdminCancellationReasonsPage from './pages/admin/AdminCancellationReasonsPage';
import AdminScheduling from './pages/admin/AdminScheduling';
import AdminServiceCategories from './pages/admin/AdminServiceCategories';
import AdminDynamicPricing from './pages/admin/AdminDynamicPricing';
import AdminTaxiConfigs from './pages/admin/AdminTaxiConfigs';
import AdminRentalPackages from './pages/admin/AdminRentalPackages';
import AdminRideProfiles from './pages/admin/AdminRideProfiles';

import './index.css';

const AppRouter = () => {
  const location = useLocation();
  const { user } = useAuth();

  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  // Mount global voice FAB ONLY on the passenger home screen (/home)
  const showVoiceFab = !!user && user.role === 'user' && location.pathname === '/home';

  return (
    <>
      {showVoiceFab && <VoiceAssistant />}
      <Routes>
      {/* ======= LANDING PAGE / WEBSITE ======= */}
      <Route path="/website" element={<LandingPage />} />

      {/* ======= SB DRIVE TAB (Kiosk libre-service) ======= */}
      <Route path="/kiosk" element={<KioskApp />} />
      <Route path="/tab" element={<KioskApp />} />

      {/* ======= SB DRIVE CLIENT (App Passager) ======= */}
      <Route path="/" element={user && user.role === 'user' ? <Navigate to="/home" replace /> : !user ? <LandingPage /> : <Navigate to={user.role === 'driver' ? '/chauffeur/home' : user.role === 'merchant' ? '/merchant' : user.role === 'admin' ? '/admin' : '/home'} replace />} />
      <Route path="/top-chauffeurs" element={<TopDriversPage />} />
      <Route path="/ride/:rideId/chat" element={<ProtectedRoute><RideChatPage /></ProtectedRoute>} />
      <Route path="/safety" element={<ProtectedRoute><EmergencyContactsPage /></ProtectedRoute>} />
      <Route path="/favorite-drivers" element={<ProtectedRoute><FavoriteDriversPage /></ProtectedRoute>} />      <Route path="/home" element={<ProtectedRoute allowedRoles={['user']}><UserHome /></ProtectedRoute>} />
      <Route path="/app" element={user ? <Navigate to="/home" replace /> : <ClientWelcome />} />
      <Route path="/login" element={user ? <Navigate to="/home" replace /> : <LoginPage />} />
      <Route path="/login/email" element={user ? <Navigate to="/home" replace /> : <EmailLoginPage />} />
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
      <Route path="/services-hub" element={<ProtectedRoute allowedRoles={['user']}><ServicesHubPage /></ProtectedRoute>} />
      <Route path="/service/:serviceKey" element={<ProtectedRoute allowedRoles={['user']}><ServiceBookingFlow /></ProtectedRoute>} />
      <Route path="/my-bookings" element={<ProtectedRoute allowedRoles={['user']}><MyServiceBookingsPage /></ProtectedRoute>} />
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
      <Route path="/medical/appointment" element={<ProtectedRoute allowedRoles={['user']}><MedicalAppointmentPage /></ProtectedRoute>} />
      <Route path="/medical/transport" element={<ProtectedRoute allowedRoles={['user']}><MedicalTransportPage /></ProtectedRoute>} />
      <Route path="/track/:type/:id" element={<ProtectedRoute allowedRoles={['user']}><DeliveryTrackingPage /></ProtectedRoute>} />
      <Route path="/real-estate" element={<ProtectedRoute allowedRoles={['user']}><RealEstatePage /></ProtectedRoute>} />
      <Route path="/real-estate/post" element={<ProtectedRoute allowedRoles={['user']}><PostPropertyPage /></ProtectedRoute>} />
      <Route path="/real-estate/edit/:id" element={<ProtectedRoute allowedRoles={['user']}><PostPropertyPage /></ProtectedRoute>} />
      <Route path="/real-estate/my" element={<ProtectedRoute allowedRoles={['user']}><MyPropertiesPage /></ProtectedRoute>} />
      <Route path="/real-estate/:id" element={<ProtectedRoute allowedRoles={['user']}><PropertyDetailPage /></ProtectedRoute>} />
      <Route path="/pharmacy" element={<ProtectedRoute allowedRoles={['user']}><PharmacyPage /></ProtectedRoute>} />
      <Route path="/pharmacy/catalog" element={<ProtectedRoute allowedRoles={['user']}><PharmacyCatalogPage /></ProtectedRoute>} />
      <Route path="/pharmacy/prescription" element={<ProtectedRoute allowedRoles={['user']}><PharmacyPrescriptionPage /></ProtectedRoute>} />
      <Route path="/pharmacy/orders" element={<ProtectedRoute allowedRoles={['user']}><PharmacyOrdersPage /></ProtectedRoute>} />
      <Route path="/chauffeur/livraisons" element={<ProtectedRoute allowedRoles={['driver']}><DeliveryJobsPage /></ProtectedRoute>} />
      <Route path="/bidding" element={<ProtectedRoute allowedRoles={['user']}><BiddingPage /></ProtectedRoute>} />
      <Route path="/services-bidding" element={<ProtectedRoute allowedRoles={['user']}><BiddingPage /></ProtectedRoute>} />
      <Route path="/taxi-bidding" element={<ProtectedRoute allowedRoles={['user']}><TaxiBiddingPage /></ProtectedRoute>} />
      <Route path="/taxi-advanced" element={<ProtectedRoute allowedRoles={['user']}><AdvancedTaxiBookingPage /></ProtectedRoute>} />
      <Route path="/taxi" element={<ProtectedRoute allowedRoles={['user']}><TaxiHubPage /></ProtectedRoute>} />
      <Route path="/scheduled-rides" element={<ProtectedRoute allowedRoles={['user']}><ScheduledRidesPage /></ProtectedRoute>} />
      <Route path="/corporate" element={<ProtectedRoute allowedRoles={['user']}><CorporateAccountPage /></ProtectedRoute>} />
      <Route path="/runner" element={<ProtectedRoute allowedRoles={['user']}><RunnerPage /></ProtectedRoute>} />
      <Route path="/intercity" element={<ProtectedRoute allowedRoles={['user']}><IntercityRidePage /></ProtectedRoute>} />
      <Route path="/parking" element={<ProtectedRoute allowedRoles={['user']}><ParkingPage /></ProtectedRoute>} />
      <Route path="/giftcards" element={<ProtectedRoute allowedRoles={['user']}><GiftCardsPage /></ProtectedRoute>} />
      <Route path="/tracking" element={<ProtectedRoute allowedRoles={['user']}><TrackingServicePage /></ProtectedRoute>} />
      <Route path="/finance" element={<ProtectedRoute allowedRoles={['user', 'driver']}><FinancePage /></ProtectedRoute>} />
      <Route path="/ride/:rideId/waybill" element={<ProtectedRoute allowedRoles={['user', 'driver']}><WaybillPage /></ProtectedRoute>} />
      <Route path="/ride/:rideId/receipt" element={<ProtectedRoute allowedRoles={['user']}><RideReceiptPage /></ProtectedRoute>} />
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
      <Route path="/chauffeur/score" element={<ProtectedRoute allowedRoles={['driver']}><DriverScorePage /></ProtectedRoute>} />
      <Route path="/chauffeur/subscriptions" element={<ProtectedRoute allowedRoles={['driver']}><DriverSubscriptions /></ProtectedRoute>} />
      <Route path="/chauffeur/support/:section" element={<ProtectedRoute allowedRoles={['driver']}><DriverSupportPage /></ProtectedRoute>} />
      <Route path="/chauffeur/wallet" element={<ProtectedRoute allowedRoles={['driver']}><DriverWalletPage /></ProtectedRoute>} />
      <Route path="/chauffeur/documents" element={<ProtectedRoute allowedRoles={['driver']}><DriverDocumentsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/notifications" element={<ProtectedRoute allowedRoles={['driver']}><DriverNotificationsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/livechat" element={<ProtectedRoute allowedRoles={['driver']}><LiveChatPage /></ProtectedRoute>} />
      {/* Pack B — Driver Pro */}
      <Route path="/chauffeur/vehicles" element={<ProtectedRoute allowedRoles={['driver']}><ManageVehiclesPage /></ProtectedRoute>} />
      <Route path="/chauffeur/bank" element={<ProtectedRoute allowedRoles={['driver']}><BankDetailsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/earnings/stats" element={<ProtectedRoute allowedRoles={['driver']}><DriverEarningsStatsPage /></ProtectedRoute>} />
      <Route path="/chauffeur/gallery" element={<ProtectedRoute allowedRoles={['driver']}><DriverGalleryPage /></ProtectedRoute>} />
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
        <Route path="users/new" element={<AdminUserEdit />} />
        <Route path="users/:id" element={<AdminUserEdit />} />
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
        <Route path="live-rides" element={<AdminLiveRides />} />
        <Route path="auto-dispatch" element={<AdminAutoDispatch />} />
        <Route path="admins" element={<AdminManageAdmins />} />
        <Route path="groups" element={<AdminGroupsPage />} />
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
        <Route path="cancel-reasons" element={<AdminCancellationReasonsPage />} />
        <Route path="cancel-reasons-legacy" element={<AdminCancelReasons />} />
        <Route path="scheduling" element={<AdminScheduling />} />
        <Route path="service-categories" element={<AdminServiceCategories />} />
        <Route path="dynamic-pricing" element={<AdminDynamicPricing />} />
        <Route path="taxi-configs" element={<AdminTaxiConfigs />} />
        <Route path="rental-packages" element={<AdminRentalPackages />} />
        <Route path="ride-profiles" element={<AdminRideProfiles />} />
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
        <Route path="real-estate" element={<AdminRealEstate />} />
        <Route path="pharmacy" element={<AdminPharmacy />} />
        <Route path="services-settings" element={<AdminServiceSettings />} />
        <Route path="kiosks" element={<AdminKiosks />} />
        <Route path="acl" element={<AdminACL />} />
        <Route path="audit-logs" element={<AdminAuditLogs />} />
        <Route path="organizations" element={<AdminOrganizations />} />
        <Route path="corporate" element={<AdminCorporate />} />
        <Route path="home-categories" element={<AdminHomeCategories />} />
        <Route path="i18n" element={<AdminI18n />} />
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
        <Route path="support" element={<AdminSupport />} />
        {/* Parité V3Cube : nouvelles pages */}
        <Route path="weather-surcharge" element={<AdminWeatherSurcharge />} />
        <Route path="personal-driver" element={<AdminPersonalDriver />} />
        <Route path="auto-promotions" element={<AdminAutoPromotions />} />
        <Route path="vouchers" element={<AdminVouchers />} />
        <Route path="faqs" element={<AdminFaqs />} />
        <Route path="help-articles" element={<AdminHelpArticles />} />
        <Route path="donations" element={<AdminDonations />} />
      </Route>

      {/* ======= DISPATCHER ======= */}
      <Route path="/dispatcher" element={<ProtectedRoute allowedRoles={['dispatcher', 'admin']}><DispatcherPanel /></ProtectedRoute>} />

      {/* ======= 6 ROLE-BASED PANELS (Phase B) ======= */}
      {/* DISPATCH */}
      <Route path="/dispatch" element={<ProtectedRoute allowedRoles={['admin']}><PanelLayout panelKey="dispatch" /></ProtectedRoute>}>
        <Route index element={<PanelHome panelKey="dispatch" />} />
        <Route path="live-rides" element={<AdminLiveRides />} />
        <Route path="auto-dispatch" element={<AdminAutoDispatch />} />
        <Route path="monitoring" element={<AdminMonitoring />} />
        <Route path="drivers" element={<AdminDrivers />} />
        <Route path="priority-drivers" element={<AdminPriorityDrivers />} />
        <Route path="rides" element={<AdminRides />} />
        <Route path="sos-requests" element={<AdminSosRequests />} />
        <Route path="trip-help-requests" element={<AdminTripHelpRequests />} />
        <Route path="disputes" element={<AdminDisputesCrud />} />
      </Route>
      {/* BILLING */}
      <Route path="/billing" element={<ProtectedRoute allowedRoles={['admin']}><PanelLayout panelKey="billing" /></ProtectedRoute>}>
        <Route index element={<PanelHome panelKey="billing" />} />
        <Route path="revenue" element={<AdminRevenue />} />
        <Route path="settlements" element={<AdminSettlementsCrud />} />
        <Route path="payout" element={<AdminPayoutsCrud />} />
        <Route path="wallet-requests" element={<AdminWithdrawRequests />} />
        <Route path="disputes" element={<AdminDisputesCrud />} />
        <Route path="promocodes" element={<AdminPromocodes />} />
        <Route path="giftcards" element={<AdminGiftCards />} />
        <Route path="payment-methods" element={<AdminPaymentMethods />} />
        <Route path="currency" element={<AdminServiceConfig serviceKey="currency" />} />
        <Route path="reports/negotiation-gap" element={<AdminNegotiationGapReport />} />
      </Route>
      {/* SERVER (SysAdmin) */}
      <Route path="/server" element={<ProtectedRoute allowedRoles={['admin']}><PanelLayout panelKey="server" /></ProtectedRoute>}>
        <Route index element={<PanelHome panelKey="server" />} />
        <Route path="monitoring" element={<AdminMonitoring />} />
        <Route path="db-backup" element={<AdminDbBackup />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="language" element={<AdminServiceConfig serviceKey="language" />} />
        <Route path="currency" element={<AdminServiceConfig serviceKey="currency" />} />
        <Route path="maps-api" element={<AdminServiceConfig serviceKey="maps-api" />} />
        <Route path="seo" element={<AdminServiceConfig serviceKey="seo" />} />
        <Route path="geo-fence" element={<AdminGeoFence />} />
        <Route path="airport" element={<AdminGeoFence />} />
        <Route path="sbpaygo-zones" element={<AdminSbPayGoZones />} />
        <Route path="email-templates" element={<AdminEmailTemplates />} />
        <Route path="sms-templates" element={<AdminSmsTemplates />} />
        <Route path="push-notifications" element={<AdminPushNotifications />} />
        <Route path="vehicle-makes" element={<AdminVehicleMakes />} />
        <Route path="vehicle-models" element={<AdminVehicleModels />} />
        <Route path="vehicle-types" element={<AdminVehicleTypes />} />
        <Route path="master-services" element={<AdminMasterServices />} />
        <Route path="cancel-reasons" element={<AdminCancelReasons />} />
      </Route>
      {/* USERS ADMIN (CRM Clients) */}
      <Route path="/users-admin" element={<ProtectedRoute allowedRoles={['admin']}><PanelLayout panelKey="users_admin" /></ProtectedRoute>}>
        <Route index element={<PanelHome panelKey="users_admin" />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="referral" element={<AdminReferralSettings />} />
        <Route path="news" element={<AdminNewsletter />} />
        <Route path="newsletter" element={<AdminNewsletter />} />
        <Route path="banners" element={<AdminBanners />} />
        <Route path="promocodes" element={<AdminPromocodes />} />
        <Route path="contact-requests" element={<AdminContactRequests />} />
        <Route path="sos-requests" element={<AdminSosRequests />} />
        <Route path="order-help-requests" element={<AdminOrderHelpRequests />} />
      </Route>
      {/* DRIVERS ADMIN (CRM Chauffeurs) */}
      <Route path="/drivers-admin" element={<ProtectedRoute allowedRoles={['admin']}><PanelLayout panelKey="drivers_admin" /></ProtectedRoute>}>
        <Route index element={<PanelHome panelKey="drivers_admin" />} />
        <Route path="drivers" element={<AdminDrivers />} />
        <Route path="priority-drivers" element={<AdminPriorityDrivers />} />
        <Route path="top-drivers" element={<AdminTopDriversSettings />} />
        <Route path="documents" element={<AdminDocumentsCrud />} />
        <Route path="requests" element={<AdminRequests />} />
        <Route path="rewards" element={<AdminRewards />} />
        <Route path="rewards-reports" element={<AdminRewards />} />
        <Route path="rides" element={<AdminRides />} />
      </Route>
      {/* MERCHANTS ADMIN (CRM Marchands) */}
      <Route path="/merchants-admin" element={<ProtectedRoute allowedRoles={['admin']}><PanelLayout panelKey="merchants_admin" /></ProtectedRoute>}>
        <Route index element={<PanelHome panelKey="merchants_admin" />} />
        <Route path="stores" element={<AdminStores />} />
        <Route path="company" element={<AdminCompany />} />
        <Route path="hotels" element={<AdminHotels />} />
        <Route path="kiosks" element={<AdminKiosks />} />
        <Route path="store-orders" element={<AdminOrders />} />
        <Route path="parcels" element={<AdminOrders />} />
        <Route path="featured-listings" element={<AdminFeaturedListings />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LocaleProvider>
          <AppRouter />
          <Toaster position="top-center" />
          <InstallPWA />
        </LocaleProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
