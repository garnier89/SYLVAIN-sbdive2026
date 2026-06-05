import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LocaleProvider } from './contexts/LocaleContext';
import { Toaster } from './components/ui/sonner';
import InstallPWA from './components/InstallPWA';
import ProtectedRoute from './components/ProtectedRoute';
import AuthCallback from './components/AuthCallback';

// Auth Pages
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const EmailLoginPage = lazy(() => import('./pages/auth/EmailLoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));

// Landing Page
const LandingPage = lazy(() => import('./pages/LandingPage'));
import VoiceAssistant from './components/VoiceAssistant';

// SB Drive Client Pages
const ClientWelcome = lazy(() => import('./pages/client/ClientWelcome'));
const UserHome = lazy(() => import('./pages/user/UserHome'));
const RideBookingPage = lazy(() => import('./pages/user/RideBookingPage'));
const RideChoosePage = lazy(() => import('./pages/user/RideChoosePage'));
const RideTrackingPage = lazy(() => import('./pages/user/RideTrackingPage'));
const RideReceiptPage = lazy(() => import('./pages/user/RideReceiptPage'));
const FoodPage = lazy(() => import('./pages/user/FoodPage'));
const RestaurantDetail = lazy(() => import('./pages/user/RestaurantDetail'));
const CheckoutPage = lazy(() => import('./pages/user/CheckoutPage'));
const OrderTracking = lazy(() => import('./pages/user/OrderTracking'));
const WalletPage = lazy(() => import('./pages/user/WalletPage'));
const ProfilePage = lazy(() => import('./pages/user/ProfilePage'));
const HistoryPage = lazy(() => import('./pages/user/HistoryPage'));
const SupportPage = lazy(() => import('./pages/user/SupportPage'));
const ParcelPage = lazy(() => import('./pages/user/ParcelPage'));
const ReferralPage = lazy(() => import('./pages/user/ReferralPage'));
const DonationPage = lazy(() => import('./pages/user/DonationPage'));
const LiveChatPage = lazy(() => import('./pages/user/LiveChatPage'));
const ServicesPage = lazy(() => import('./pages/user/ServicesPage'));
const AllDeliveryPage = lazy(() => import('./pages/user/AllDeliveryPage'));
const AllServicesPage = lazy(() => import('./pages/user/AllServicesPage'));
const CarPoolPage = lazy(() => import('./pages/user/CarPoolPage'));
const MarketplacePage = lazy(() => import('./pages/user/MarketplacePage'));
const NearbyBusinessPage = lazy(() => import('./pages/user/NearbyBusinessPage'));
const BeautyServicesPage = lazy(() => import('./pages/user/BeautyServicesPage'));
const PetServicesPage = lazy(() => import('./pages/user/PetServicesPage'));
const CarCarePage = lazy(() => import('./pages/user/CarCarePage'));
const TowingServicesPage = lazy(() => import('./pages/user/TowingServicesPage'));
const MoreTaxiServicesPage = lazy(() => import('./pages/user/MoreTaxiServicesPage'));
const VideoConsultPage = lazy(() => import('./pages/user/VideoConsultPage'));
const MedicalAppointmentPage = lazy(() => import('./pages/user/MedicalAppointmentPage'));
const MedicalTransportPage = lazy(() => import('./pages/user/MedicalTransportPage'));
const DeliveryTrackingPage = lazy(() => import('./pages/user/DeliveryTrackingPage'));
const DeliveryJobsPage = lazy(() => import('./pages/driver/DeliveryJobsPage'));
const RealEstatePage = lazy(() => import('./pages/user/realestate/RealEstatePage'));
const PropertyDetailPage = lazy(() => import('./pages/user/realestate/PropertyDetailPage'));
const PostPropertyPage = lazy(() => import('./pages/user/realestate/PostPropertyPage'));
const MyPropertiesPage = lazy(() => import('./pages/user/realestate/MyPropertiesPage'));
const PharmacyPage = lazy(() => import('./pages/user/pharmacy/PharmacyPage'));
const PharmacyCatalogPage = lazy(() => import('./pages/user/pharmacy/PharmacyCatalogPage'));
const PharmacyPrescriptionPage = lazy(() => import('./pages/user/pharmacy/PharmacyPrescriptionPage'));
const PharmacyOrdersPage = lazy(() => import('./pages/user/pharmacy/PharmacyOrdersPage'));
const BiddingPage = lazy(() => import('./pages/user/BiddingPage'));
const TaxiBiddingPage = lazy(() => import('./pages/user/TaxiBiddingPage'));
const AdvancedTaxiBookingPage = lazy(() => import('./pages/user/AdvancedTaxiBookingPage'));
const CorporateAccountPage = lazy(() => import('./pages/user/CorporateAccountPage'));
const TaxiHubPage = lazy(() => import('./pages/user/TaxiHubPage'));
const ServicesHubPage = lazy(() => import('./pages/user/ServicesHubPage'));
import ServiceBookingFlow from './components/ServiceBookingFlow';
const MyServiceBookingsPage = lazy(() => import('./pages/user/MyServiceBookingsPage'));
const ScheduledRidesPage = lazy(() => import('./pages/user/ScheduledRidesPage'));
const RunnerPage = lazy(() => import('./pages/user/RunnerPage'));
const IntercityRidePage = lazy(() => import('./pages/user/IntercityRidePage'));
const ParkingPage = lazy(() => import('./pages/user/ParkingPage'));
const GiftCardsPage = lazy(() => import('./pages/user/GiftCardsPage'));
const TrackingServicePage = lazy(() => import('./pages/user/TrackingServicePage'));
const FinancePage = lazy(() => import('./pages/user/FinancePage'));
const WaybillPage = lazy(() => import('./pages/user/WaybillPage'));

// SB Drive Chauffeur Pages
const ChauffeurWelcome = lazy(() => import('./pages/chauffeur/ChauffeurWelcome'));
const ChauffeurLogin = lazy(() => import('./pages/chauffeur/ChauffeurLogin'));
const ChauffeurRegister = lazy(() => import('./pages/chauffeur/ChauffeurRegister'));
const DriverHome = lazy(() => import('./pages/driver/DriverHome'));
const DriverRegisterPage = lazy(() => import('./pages/driver/DriverRegisterPage'));
const DriverEarningsPage = lazy(() => import('./pages/driver/DriverEarningsPage'));
const DriverWeeklyReportsPage = lazy(() => import('./pages/driver/DriverWeeklyReportsPage'));
const DriverHistoryPage = lazy(() => import('./pages/driver/DriverHistoryPage'));
const DriverProfilePage = lazy(() => import('./pages/driver/DriverProfilePage'));
const DriverSupportPage = lazy(() => import('./pages/driver/DriverSupportPage'));
const DriverRewardsPage = lazy(() => import('./pages/driver/DriverRewardsPage'));
const DriverScorePage = lazy(() => import('./pages/driver/DriverScorePage'));
const DriverWalletPage = lazy(() => import('./pages/driver/DriverWalletPage'));
const DriverDocumentsPage = lazy(() => import('./pages/driver/DriverDocumentsPage'));
const DriverNotificationsPage = lazy(() => import('./pages/driver/DriverNotificationsPage'));

// Merchant Pages
const MerchantLayout = lazy(() => import('./pages/merchant/MerchantLayout'));
const MerchantDashboard = lazy(() => import('./pages/merchant/MerchantDashboard'));
const MerchantProducts = lazy(() => import('./pages/merchant/MerchantProducts'));
const MerchantOrders = lazy(() => import('./pages/merchant/MerchantOrders'));
const MerchantPromotions = lazy(() => import('./pages/merchant/MerchantPromotions'));
const MerchantAnalytics = lazy(() => import('./pages/merchant/MerchantAnalytics'));
const MerchantSettings = lazy(() => import('./pages/merchant/MerchantSettings'));
const MerchantChat = lazy(() => import('./pages/merchant/MerchantChat'));

// Admin Pages
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminDrivers = lazy(() => import('./pages/admin/AdminDrivers'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminRides = lazy(() => import('./pages/admin/AdminRides'));
const AdminRevenue = lazy(() => import('./pages/admin/AdminRevenue'));
const AdminSupport = lazy(() => import('./pages/admin/AdminSupport'));
const AdminWeeklyReports = lazy(() => import('./pages/admin/AdminWeeklyReports'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminGodsView = lazy(() => import('./pages/admin/AdminGodsView'));
const AdminHeatView = lazy(() => import('./pages/admin/AdminHeatView'));
const AdminPromocodes = lazy(() => import('./pages/admin/AdminPromocodes'));
const AdminVehicleTypes = lazy(() => import('./pages/admin/AdminVehicleTypes'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminStores = lazy(() => import('./pages/admin/AdminStores'));
const AdminManualBooking = lazy(() => import('./pages/admin/AdminManualBooking'));
const AdminBanners = lazy(() => import('./pages/admin/AdminBanners'));
const AdminPayout = lazy(() => import('./pages/admin/AdminPayout'));
const AdminGeoFence = lazy(() => import('./pages/admin/AdminGeoFence'));
const AdminGiftCards = lazy(() => import('./pages/admin/AdminGiftCards'));
const AdminReferralSettings = lazy(() => import('./pages/admin/AdminReferralSettings'));
const AdminTemplates = lazy(() => import('./pages/admin/AdminTemplates'));
const AdminNewsletter = lazy(() => import('./pages/admin/AdminNewsletter'));
const AdminMonitoring = lazy(() => import('./pages/admin/AdminMonitoring'));
const AdminLiveRides = lazy(() => import('./pages/admin/AdminLiveRides'));
const AdminAutoDispatch = lazy(() => import('./pages/admin/AdminAutoDispatch'));
const AdminManageAdmins = lazy(() => import('./pages/admin/AdminManageAdmins'));
import { AdminGroups, AdminVehicles, AdminCompany, AdminHotels, AdminOrganization, AdminRequests,
  AdminVehicleMakes, AdminVehicleModels, AdminMasterServices, AdminCancelReasons,
  AdminEmailTemplates, AdminSmsTemplates, AdminSosRequests, AdminContactRequests,
  AdminWithdrawRequests, AdminOrderHelpRequests, AdminTripHelpRequests, AdminPushNotifications,
  AdminPayoutsCrud, AdminSettlementsCrud, AdminDisputesCrud, AdminDocumentsCrud,
  AdminWeatherSurcharge, AdminPersonalDriver, AdminAutoPromotions, AdminVouchers,
  AdminFaqs, AdminHelpArticles, AdminDonations
} from './pages/admin/AdminCrudPages';
const AdminServiceConfig = lazy(() => import('./pages/admin/AdminServiceConfig'));
const AdminRewards = lazy(() => import('./pages/admin/AdminRewards'));
const AdminPriorityDrivers = lazy(() => import('./pages/admin/AdminPriorityDrivers'));
const AdminTopDriversSettings = lazy(() => import('./pages/admin/AdminTopDriversSettings'));
const AdminDbBackup = lazy(() => import('./pages/admin/AdminDbBackup'));
const AdminNegotiationGapReport = lazy(() => import('./pages/admin/AdminNegotiationGapReport'));
const AdminNoDriverStats = lazy(() => import('./pages/admin/AdminNoDriverStats'));
const AdminFeaturedListings = lazy(() => import('./pages/admin/AdminFeaturedListings'));
const AdminRealEstate = lazy(() => import('./pages/admin/AdminRealEstate'));
const AdminPharmacy = lazy(() => import('./pages/admin/AdminPharmacy'));
const AdminServiceSettings = lazy(() => import('./pages/admin/AdminServiceSettings'));
const AdminPaymentMethods = lazy(() => import('./pages/admin/AdminPaymentMethods'));
const AdminSbPayGoZones = lazy(() => import('./pages/admin/AdminSbPayGoZones'));
const TopDriversPage = lazy(() => import('./pages/TopDriversPage'));
const RideChatPage = lazy(() => import('./pages/RideChatPage'));
const EmergencyContactsPage = lazy(() => import('./pages/user/EmergencyContactsPage'));
const FavoriteDriversPage = lazy(() => import('./pages/user/FavoriteDriversPage'));
const AdminDocuments = lazy(() => import('./pages/admin/AdminDocuments'));
const AdminDisputes = lazy(() => import('./pages/admin/AdminDisputes'));
const AdminWalletRequests = lazy(() => import('./pages/admin/AdminWalletRequests'));
const AdminSettlements = lazy(() => import('./pages/admin/AdminSettlements'));

// Dispatcher Pages
const DispatcherPanel = lazy(() => import('./pages/dispatcher/DispatcherPanel'));

// SB Drive Tab (Kiosk)
const KioskApp = lazy(() => import('./pages/kiosk/KioskApp'));
const AdminKiosks = lazy(() => import('./pages/admin/AdminKiosks'));

// Role-based Panels (Dispatch, Billing, Server, Users-Admin, Drivers-Admin, Merchants-Admin)
const PanelLayout = lazy(() => import('./pages/panels/PanelLayout'));
const PanelHome = lazy(() => import('./pages/panels/PanelHome'));

// V3Cube enhancements (Iteration 74-75)
const AdminACL = lazy(() => import('./pages/admin/AdminACL'));
const AdminAuditLogs = lazy(() => import('./pages/admin/AdminAuditLogs'));
const AdminOrganizations = lazy(() => import('./pages/admin/AdminOrganizations'));
const AdminCorporate = lazy(() => import('./pages/admin/AdminCorporate'));
const AdminHomeCategories = lazy(() => import('./pages/admin/AdminHomeCategories'));
const AdminI18n = lazy(() => import('./pages/admin/AdminI18n'));
const AdminGroupsPage = lazy(() => import('./pages/admin/AdminGroupsPage'));
const AdminUserEdit = lazy(() => import('./pages/admin/AdminUserEdit'));
const DriverSubscriptions = lazy(() => import('./pages/driver/DriverSubscriptions'));

// V3Cube Pack B — Driver Pro
const ManageVehiclesPage = lazy(() => import('./pages/driver/ManageVehiclesPage'));
const BankDetailsPage = lazy(() => import('./pages/driver/BankDetailsPage'));
const DriverEarningsStatsPage = lazy(() => import('./pages/driver/DriverEarningsStatsPage'));
const DriverGalleryPage = lazy(() => import('./pages/driver/DriverGalleryPage'));
const AdminCancellationReasonsPage = lazy(() => import('./pages/admin/AdminCancellationReasonsPage'));
const AdminScheduling = lazy(() => import('./pages/admin/AdminScheduling'));
const AdminServiceCategories = lazy(() => import('./pages/admin/AdminServiceCategories'));
const AdminDynamicPricing = lazy(() => import('./pages/admin/AdminDynamicPricing'));
const AdminTaxiConfigs = lazy(() => import('./pages/admin/AdminTaxiConfigs'));
const AdminRentalPackages = lazy(() => import('./pages/admin/AdminRentalPackages'));
const AdminRideProfiles = lazy(() => import('./pages/admin/AdminRideProfiles'));

import './index.css';

const PageLoader = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div className="w-9 h-9 border-[3px] border-gray-200 border-t-[#FF5000] rounded-full animate-spin" />
  </div>
);

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
      <Suspense fallback={<PageLoader />}>
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
      <Route path="/course" element={<ProtectedRoute allowedRoles={['user']}><RideChoosePage /></ProtectedRoute>} />
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
      <Route path="/chauffeur/reports" element={<ProtectedRoute allowedRoles={['driver']}><DriverWeeklyReportsPage /></ProtectedRoute>} />
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
        <Route path="pool-config" element={<AdminServiceConfig serviceKey="pool" />} />
        <Route path="ride-search-config" element={<AdminServiceConfig serviceKey="ride_search" />} />
        <Route path="no-driver-alerts-config" element={<AdminServiceConfig serviceKey="no_driver_alerts" />} />
        <Route path="db-backup" element={<AdminDbBackup />} />
        <Route path="reports/negotiation-gap" element={<AdminNegotiationGapReport />} />
        <Route path="reports/no-driver-stats" element={<AdminNoDriverStats />} />
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
        <Route path="weekly-reports" element={<AdminWeeklyReports />} />
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
        <Route path="reports/no-driver-stats" element={<AdminNoDriverStats />} />
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
      </Suspense>
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
