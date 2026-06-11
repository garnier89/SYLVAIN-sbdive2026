import { lazy } from 'react';

// lazy() wrapper exposing a `.preload()` so we can warm a route's chunk
// ahead of navigation (idle prewarm per role + hover prefetch on desktop).
export function lazyWithPreload(factory) {
  const Component = lazy(factory);
  Component.preload = factory;
  return Component;
}

// Auth Pages
export const LoginPage = lazy(() => import('../pages/auth/LoginPage'));
export const EmailLoginPage = lazy(() => import('../pages/auth/EmailLoginPage'));
export const VerifyEmailPage = lazy(() => import('../pages/auth/VerifyEmailPage'));
export const ForgotPasswordPage = lazy(() => import('../pages/auth/ForgotPasswordPage'));
export const ResetPasswordPage = lazy(() => import('../pages/auth/ResetPasswordPage'));

// Landing Page
export const LandingPage = lazy(() => import('../pages/LandingPage'));

// SB Drive Client Pages
export const ClientWelcome = lazy(() => import('../pages/client/ClientWelcome'));
export const UserHome = lazyWithPreload(() => import('../pages/user/UserHome'));
export const RideBookingPage = lazy(() => import('../pages/user/RideBookingPage'));
export const RideChoosePage = lazyWithPreload(() => import('../pages/user/RideChoosePage'));
export const RideTrackingPage = lazyWithPreload(() => import('../pages/user/RideTrackingPage'));
export const RideReceiptPage = lazy(() => import('../pages/user/RideReceiptPage'));
export const FoodPage = lazyWithPreload(() => import('../pages/user/FoodPage'));
export const RestaurantDetail = lazy(() => import('../pages/user/RestaurantDetail'));
export const CheckoutPage = lazy(() => import('../pages/user/CheckoutPage'));
export const OrderTracking = lazy(() => import('../pages/user/OrderTracking'));
export const WalletPage = lazyWithPreload(() => import('../pages/user/WalletPage'));
export const ProfilePage = lazyWithPreload(() => import('../pages/user/ProfilePage'));
export const HistoryPage = lazy(() => import('../pages/user/HistoryPage'));
export const SupportPage = lazy(() => import('../pages/user/SupportPage'));
export const ParcelPage = lazy(() => import('../pages/user/ParcelPage'));
export const ReferralPage = lazy(() => import('../pages/user/ReferralPage'));
export const LoyaltyPage = lazy(() => import('../pages/user/LoyaltyPage'));
export const DonationPage = lazy(() => import('../pages/user/DonationPage'));
export const LiveChatPage = lazy(() => import('../pages/user/LiveChatPage'));
export const ServicesPage = lazy(() => import('../pages/user/ServicesPage'));
export const AllDeliveryPage = lazyWithPreload(() => import('../pages/user/AllDeliveryPage'));
export const AllServicesPage = lazy(() => import('../pages/user/AllServicesPage'));
export const ServiceProvidersPage = lazy(() => import('../pages/user/ServiceProvidersPage'));
export const ServiceProviderDetailPage = lazy(() => import('../pages/user/ServiceProviderDetailPage'));
export const CarPoolPage = lazy(() => import('../pages/user/CarPoolPage'));
export const MarketplacePage = lazy(() => import('../pages/user/MarketplacePage'));
export const MyOrdersPage = lazy(() => import('../pages/user/MyOrdersPage'));
export const OrderSuccessPage = lazy(() => import('../pages/user/OrderSuccessPage'));
export const SellGalleryPage = lazy(() => import('../pages/user/SellGalleryPage'));
export const PostVehiclePage = lazy(() => import('../pages/user/PostVehiclePage'));
export const MarketplaceMessagesPage = lazy(() => import('../pages/user/MarketplaceMessagesPage'));
export const NearbyBusinessPage = lazy(() => import('../pages/user/NearbyBusinessPage'));
export const BeautyServicesPage = lazy(() => import('../pages/user/BeautyServicesPage'));
export const PetServicesPage = lazy(() => import('../pages/user/PetServicesPage'));
export const CarCarePage = lazy(() => import('../pages/user/CarCarePage'));
export const TowingServicesPage = lazy(() => import('../pages/user/TowingServicesPage'));
export const VideoConsultPage = lazy(() => import('../pages/user/VideoConsultPage'));
export const MedicalAppointmentPage = lazy(() => import('../pages/user/MedicalAppointmentPage'));
export const MedicalTransportPage = lazy(() => import('../pages/user/MedicalTransportPage'));
export const DeliveryTrackingPage = lazy(() => import('../pages/user/DeliveryTrackingPage'));
export const DeliveryJobsPage = lazy(() => import('../pages/driver/DeliveryJobsPage'));
export const RealEstatePage = lazy(() => import('../pages/user/realestate/RealEstatePage'));
export const PropertyDetailPage = lazy(() => import('../pages/user/realestate/PropertyDetailPage'));
export const PostPropertyPage = lazy(() => import('../pages/user/realestate/PostPropertyPage'));
export const MyPropertiesPage = lazy(() => import('../pages/user/realestate/MyPropertiesPage'));
export const PharmacyPage = lazy(() => import('../pages/user/pharmacy/PharmacyPage'));
export const PharmacyCatalogPage = lazy(() => import('../pages/user/pharmacy/PharmacyCatalogPage'));
export const PharmacyPrescriptionPage = lazy(() => import('../pages/user/pharmacy/PharmacyPrescriptionPage'));
export const PharmacyOrdersPage = lazy(() => import('../pages/user/pharmacy/PharmacyOrdersPage'));
export const BiddingPage = lazy(() => import('../pages/user/BiddingPage'));
export const TaxiBiddingPage = lazy(() => import('../pages/user/TaxiBiddingPage'));
export const AdvancedTaxiBookingPage = lazy(() => import('../pages/user/AdvancedTaxiBookingPage'));
export const CorporateAccountPage = lazy(() => import('../pages/user/CorporateAccountPage'));
export const TaxiHubPage = lazyWithPreload(() => import('../pages/user/TaxiHubPage'));
export const TransportPublicPage = lazy(() => import('../pages/user/TransportPublicPage'));
export const NearbyTransitPage = lazy(() => import('../pages/user/NearbyTransitPage'));
export const ServicesHubPage = lazy(() => import('../pages/user/ServicesHubPage'));
export const MyServiceBookingsPage = lazy(() => import('../pages/user/MyServiceBookingsPage'));
export const ScheduledRidesPage = lazy(() => import('../pages/user/ScheduledRidesPage'));
export const RunnerPage = lazy(() => import('../pages/user/RunnerPage'));
export const IntercityRidePage = lazy(() => import('../pages/user/IntercityRidePage'));
export const ParkingPage = lazy(() => import('../pages/user/ParkingPage'));
export const GiftCardsPage = lazy(() => import('../pages/user/GiftCardsPage'));
export const TrackingServicePage = lazy(() => import('../pages/user/TrackingServicePage'));
export const FinancePage = lazy(() => import('../pages/user/FinancePage'));
export const WaybillPage = lazy(() => import('../pages/user/WaybillPage'));
export const NewsFeedPage = lazy(() => import('../pages/user/NewsFeedPage'));
export const EmergencyContactsPage = lazy(() => import('../pages/user/EmergencyContactsPage'));
export const FavoriteDriversPage = lazy(() => import('../pages/user/FavoriteDriversPage'));
export const TopDriversPage = lazy(() => import('../pages/TopDriversPage'));
export const RideChatPage = lazy(() => import('../pages/RideChatPage'));
export const ContactlessReceivePage = lazy(() => import('../pages/user/ContactlessReceivePage'));
export const ContactlessPayPage = lazy(() => import('../pages/user/ContactlessPayPage'));
export const AssistantPage = lazy(() => import('../pages/user/AssistantPage'));

// SB Drive Chauffeur Pages
export const ChauffeurWelcome = lazy(() => import('../pages/chauffeur/ChauffeurWelcome'));
export const ChauffeurLogin = lazy(() => import('../pages/chauffeur/ChauffeurLogin'));
export const ChauffeurRegister = lazy(() => import('../pages/chauffeur/ChauffeurRegister'));
export const DriverHome = lazy(() => import('../pages/driver/DriverHome'));
export const DriverBookingsPage = lazyWithPreload(() => import('../pages/driver/DriverBookingsPage'));
export const DriverRegisterPage = lazy(() => import('../pages/driver/DriverRegisterPage'));
export const DriverEarningsPage = lazyWithPreload(() => import('../pages/driver/DriverEarningsPage'));
export const DriverWeeklyReportsPage = lazy(() => import('../pages/driver/DriverWeeklyReportsPage'));
export const DriverHistoryPage = lazy(() => import('../pages/driver/DriverHistoryPage'));
export const DriverProfilePage = lazyWithPreload(() => import('../pages/driver/DriverProfilePage'));
export const DriverSupportPage = lazy(() => import('../pages/driver/DriverSupportPage'));
export const DriverRewardsPage = lazyWithPreload(() => import('../pages/driver/DriverRewardsPage'));
export const DriverScorePage = lazy(() => import('../pages/driver/DriverScorePage'));
export const DriverWalletPage = lazyWithPreload(() => import('../pages/driver/DriverWalletPage'));
export const DriverDocumentsPage = lazy(() => import('../pages/driver/DriverDocumentsPage'));
export const DriverNotificationsPage = lazy(() => import('../pages/driver/DriverNotificationsPage'));
export const DriverSubscriptions = lazy(() => import('../pages/driver/DriverSubscriptions'));
export const ManageVehiclesPage = lazy(() => import('../pages/driver/ManageVehiclesPage'));
export const BankDetailsPage = lazy(() => import('../pages/driver/BankDetailsPage'));
export const DriverEarningsStatsPage = lazy(() => import('../pages/driver/DriverEarningsStatsPage'));
export const DriverGalleryPage = lazy(() => import('../pages/driver/DriverGalleryPage'));
export const DriverAvailabilityPage = lazy(() => import('../pages/driver/DriverAvailabilityPage'));
export const DriverReviewsPage = lazy(() => import('../pages/driver/DriverReviewsPage'));
export const DriverChangePasswordPage = lazy(() => import('../pages/driver/DriverChangePasswordPage'));

// Merchant Pages
export const MerchantLayout = lazy(() => import('../pages/merchant/MerchantLayout'));
export const MerchantDashboard = lazy(() => import('../pages/merchant/MerchantDashboard'));
export const MerchantProducts = lazy(() => import('../pages/merchant/MerchantProducts'));
export const MerchantOrders = lazy(() => import('../pages/merchant/MerchantOrders'));
export const MerchantPromotions = lazy(() => import('../pages/merchant/MerchantPromotions'));
export const MerchantAnalytics = lazy(() => import('../pages/merchant/MerchantAnalytics'));
export const MerchantSettings = lazy(() => import('../pages/merchant/MerchantSettings'));
export const MerchantChat = lazy(() => import('../pages/merchant/MerchantChat'));
export const MerchantLiveSupport = lazy(() => import('../pages/merchant/MerchantLiveSupport'));

// Admin Pages
export const AdminLayout = lazy(() => import('../pages/admin/AdminLayout'));
export const AdminLoginPage = lazy(() => import('../pages/admin/AdminLoginPage'));
export const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'));
export const AdminDrivers = lazy(() => import('../pages/admin/AdminDrivers'));
export const AdminUsers = lazy(() => import('../pages/admin/AdminUsers'));
export const AdminRides = lazy(() => import('../pages/admin/AdminRides'));
export const AdminRevenue = lazy(() => import('../pages/admin/AdminRevenue'));
export const AdminSupport = lazy(() => import('../pages/admin/AdminSupport'));
export const AdminWeeklyReports = lazy(() => import('../pages/admin/AdminWeeklyReports'));
export const AdminSettings = lazy(() => import('../pages/admin/AdminSettings'));
export const AdminGodsView = lazy(() => import('../pages/admin/AdminGodsView'));
export const AdminHeatView = lazy(() => import('../pages/admin/AdminHeatView'));
export const AdminPromocodes = lazy(() => import('../pages/admin/AdminPromocodes'));
export const AdminAutoPromotions = lazy(() => import('../pages/admin/AdminAutoPromotions'));
export const AdminVouchers = lazy(() => import('../pages/admin/AdminVouchers'));
export const AdminVehicleTypes = lazy(() => import('../pages/admin/AdminVehicleTypes'));
export const AdminDriverCategories = lazy(() => import('../pages/admin/AdminDriverCategories'));
export const AdminOrders = lazy(() => import('../pages/admin/AdminOrders'));
export const AdminStores = lazy(() => import('../pages/admin/AdminStores'));
export const AdminManualBooking = lazy(() => import('../pages/admin/AdminManualBooking'));
export const AdminBanners = lazy(() => import('../pages/admin/AdminBanners'));
export const AdminPayout = lazy(() => import('../pages/admin/AdminPayout'));
export const AdminGeoFence = lazy(() => import('../pages/admin/AdminGeoFence'));
export const AdminAirport = lazy(() => import('../pages/admin/AdminAirport'));
export const AdminDemo = lazy(() => import('../pages/admin/AdminDemo'));
export const AdminGiftCards = lazy(() => import('../pages/admin/AdminGiftCards'));
export const AdminReferralSettings = lazy(() => import('../pages/admin/AdminReferralSettings'));
export const AdminLoyalty = lazy(() => import('../pages/admin/AdminLoyalty'));
export const AdminModeration = lazy(() => import('../pages/admin/AdminModeration'));
export const AdminServiceProviders = lazy(() => import('../pages/admin/AdminServiceProviders'));
export const AdminLiveSupport = lazy(() => import('../pages/admin/AdminLiveSupport'));
export const AdminTemplates = lazy(() => import('../pages/admin/AdminTemplates'));
export const AdminNewsletter = lazy(() => import('../pages/admin/AdminNewsletter'));
export const AdminKyc = lazy(() => import('../pages/admin/AdminKyc'));
export const AdminMonitoring = lazy(() => import('../pages/admin/AdminMonitoring'));
export const AdminLiveRides = lazy(() => import('../pages/admin/AdminLiveRides'));
export const AdminAutoDispatch = lazy(() => import('../pages/admin/AdminAutoDispatch'));
export const AdminDispatch = lazy(() => import('../pages/admin/AdminDispatch'));
export const AdminManageAdmins = lazy(() => import('../pages/admin/AdminManageAdmins'));
export const AdminServiceConfig = lazy(() => import('../pages/admin/AdminServiceConfig'));
export const AdminPoolConfig = lazy(() => import('../pages/admin/AdminPoolConfig'));
export const AdminTaxiRecruitment = lazy(() => import('../pages/admin/AdminTaxiRecruitment'));
export const AdminAppSettings = lazy(() => import('../pages/admin/AdminAppSettings'));
export const AdminNotifSettings = lazy(() => import('../pages/admin/AdminNotifSettings'));
export const AdminRewards = lazy(() => import('../pages/admin/AdminRewards'));
export const AdminPriorityDrivers = lazy(() => import('../pages/admin/AdminPriorityDrivers'));
export const AdminTopDriversSettings = lazy(() => import('../pages/admin/AdminTopDriversSettings'));
export const AdminDbBackup = lazy(() => import('../pages/admin/AdminDbBackup'));
export const AdminNegotiationGapReport = lazy(() => import('../pages/admin/AdminNegotiationGapReport'));
export const AdminNoDriverStats = lazy(() => import('../pages/admin/AdminNoDriverStats'));
export const AdminFeaturedListings = lazy(() => import('../pages/admin/AdminFeaturedListings'));
export const AdminNearbyBusinesses = lazy(() => import('../pages/admin/AdminNearbyBusinesses'));
export const AdminZones = lazy(() => import('../pages/admin/AdminZones'));
export const AdminTrendingPinned = lazy(() => import('../pages/admin/AdminTrendingPinned'));
export const AdminMarketplace = lazy(() => import('../pages/admin/AdminMarketplace'));
export const AdminTransport = lazy(() => import('../pages/admin/AdminTransport'));
export const AdminRealEstate = lazy(() => import('../pages/admin/AdminRealEstate'));
export const AdminPharmacy = lazy(() => import('../pages/admin/AdminPharmacy'));
export const AdminServiceSettings = lazy(() => import('../pages/admin/AdminServiceSettings'));
export const AdminPaymentMethods = lazy(() => import('../pages/admin/AdminPaymentMethods'));
export const AdminSbPayGoZones = lazy(() => import('../pages/admin/AdminSbPayGoZones'));
export const AdminDocuments = lazy(() => import('../pages/admin/AdminDocuments'));
export const AdminDisputes = lazy(() => import('../pages/admin/AdminDisputes'));
export const AdminWalletRequests = lazy(() => import('../pages/admin/AdminWalletRequests'));
export const AdminSettlements = lazy(() => import('../pages/admin/AdminSettlements'));
export const AdminACL = lazy(() => import('../pages/admin/AdminACL'));
export const AdminAuditLogs = lazy(() => import('../pages/admin/AdminAuditLogs'));
export const AdminOrganizations = lazy(() => import('../pages/admin/AdminOrganizations'));
export const AdminCorporate = lazy(() => import('../pages/admin/AdminCorporate'));
export const AdminHomeCategories = lazy(() => import('../pages/admin/AdminHomeCategories'));
export const AdminPromoBanners = lazy(() => import('../pages/admin/AdminPromoBanners'));
export const AdminNews = lazy(() => import('../pages/admin/AdminNews'));
export const AdminStudent = lazy(() => import('../pages/admin/AdminStudent'));
export const SbStudentPage = lazyWithPreload(() => import('../pages/user/SbStudentPage'));
export const SbRecurringPage = lazyWithPreload(() => import('../pages/user/SbRecurringPage'));
export const SbCampusSharePage = lazyWithPreload(() => import('../pages/user/SbCampusSharePage'));
export const SbSafetyPage = lazyWithPreload(() => import('../pages/user/SbSafetyPage'));
export const AdminI18n = lazy(() => import('../pages/admin/AdminI18n'));
export const AdminGroupsPage = lazy(() => import('../pages/admin/AdminGroupsPage'));
export const AdminUserEdit = lazy(() => import('../pages/admin/AdminUserEdit'));
export const AdminCancellationReasonsPage = lazy(() => import('../pages/admin/AdminCancellationReasonsPage'));
export const AdminScheduling = lazy(() => import('../pages/admin/AdminScheduling'));
export const AdminServiceCategories = lazy(() => import('../pages/admin/AdminServiceCategories'));
export const AdminStoreCategories = lazy(() => import('../pages/admin/AdminStoreCategories'));
export const AdminDynamicPricing = lazy(() => import('../pages/admin/AdminDynamicPricing'));
export const AdminTaxiConfigs = lazy(() => import('../pages/admin/AdminTaxiConfigs'));
export const AdminRentalPackages = lazy(() => import('../pages/admin/AdminRentalPackages'));
export const AdminRideProfiles = lazy(() => import('../pages/admin/AdminRideProfiles'));
export const AdminKiosks = lazy(() => import('../pages/admin/AdminKiosks'));

// Grouped CRUD admin pages (named exports)
export {
  AdminGroups, AdminVehicles, AdminCompany, AdminHotels, AdminOrganization, AdminRequests,
  AdminVehicleMakes, AdminVehicleModels, AdminMasterServices, AdminCancelReasons,
  AdminEmailTemplates, AdminSmsTemplates, AdminSosRequests, AdminContactRequests,
  AdminWithdrawRequests, AdminOrderHelpRequests, AdminTripHelpRequests, AdminPushNotifications,
  AdminPayoutsCrud, AdminSettlementsCrud, AdminDisputesCrud, AdminDocumentsCrud,
  AdminWeatherSurcharge, AdminPersonalDriver,
  AdminFaqs, AdminHelpArticles, AdminDonations,
} from '../pages/admin/AdminCrudPages';

// Dispatcher
export const DispatcherPanel = lazy(() => import('../pages/dispatcher/DispatcherPanel'));

// Kiosk
export const KioskApp = lazy(() => import('../pages/kiosk/KioskApp'));
export const ProAccessPage = lazy(() => import('../pages/ProAccessPage'));
export const SbStoreSignupPage = lazy(() => import('../pages/SbStoreSignupPage'));

// Role-based Panels
export const PanelLayout = lazy(() => import('../pages/panels/PanelLayout'));
export const PanelHome = lazy(() => import('../pages/panels/PanelHome'));

// Warm the most-likely-next route chunks for a given role, on idle.
// On slow networks (DOM-TOM / Africa) this makes the first tap feel instant.
export function prewarmRoutes(role) {
  const groups = {
    user: [TaxiHubPage, RideChoosePage, AllDeliveryPage, FoodPage, WalletPage, ProfilePage, RideTrackingPage],
    driver: [DriverBookingsPage, DriverEarningsPage, DriverProfilePage, DriverWalletPage, DriverRewardsPage],
  };
  const list = groups[role] || [];
  list.forEach((c) => {
    try { c.preload && c.preload(); } catch (e) { /* ignore prewarm failures */ }
  });
}
