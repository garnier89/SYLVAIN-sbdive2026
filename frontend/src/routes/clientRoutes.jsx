import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import ServiceBookingFlow from '../components/ServiceBookingFlow';
import PayoutMethodPage from '../pages/user/PayoutMethodPage';
import {
  LandingPage, ClientWelcome, LoginPage, EmailLoginPage, AdminLoginPage,
  UserHome, RideBookingPage, RideChoosePage, RideTrackingPage, RideReceiptPage,
  FoodPage, RestaurantDetail, CheckoutPage, OrderTracking, WalletPage, ProfilePage,
  HistoryPage, SupportPage, ParcelPage, ReferralPage, DonationPage, LiveChatPage,
  ServicesPage, AllDeliveryPage, AllServicesPage, CarPoolPage, MarketplacePage, MyOrdersPage, OrderSuccessPage, SellGalleryPage, PostVehiclePage, MarketplaceMessagesPage,
  NearbyBusinessPage, BeautyServicesPage, PetServicesPage, CarCarePage, TowingServicesPage,
  VideoConsultPage, MedicalAppointmentPage, MedicalTransportPage,
  DeliveryTrackingPage, DeliveryJobsPage, RealEstatePage, PropertyDetailPage, PostPropertyPage,
  MyPropertiesPage, PharmacyPage, PharmacyCatalogPage, PharmacyPrescriptionPage, PharmacyOrdersPage,
  BiddingPage, TaxiBiddingPage, AdvancedTaxiBookingPage, CorporateAccountPage, TaxiHubPage,
  TransportPublicPage, NearbyTransitPage,
  ServicesHubPage, MyServiceBookingsPage, ScheduledRidesPage, RunnerPage, IntercityRidePage,  ParkingPage, GiftCardsPage, TrackingServicePage, FinancePage, WaybillPage, NewsFeedPage,
  EmergencyContactsPage, FavoriteDriversPage, TopDriversPage, RideChatPage, LoyaltyPage,
  ServiceProvidersPage, ServiceProviderDetailPage,
} from './pages';

export function clientRoutes(user) {
  return (
    <>
      <Route path="/website" element={<LandingPage />} />
      <Route path="/" element={user && user.role === 'user' ? <Navigate to="/home" replace /> : !user ? <LandingPage /> : <Navigate to={user.role === 'driver' ? '/chauffeur/home' : user.role === 'merchant' ? '/merchant' : user.role === 'admin' ? '/admin' : '/home'} replace />} />
      <Route path="/top-chauffeurs" element={<TopDriversPage />} />
      <Route path="/ride/:rideId/chat" element={<ProtectedRoute><RideChatPage /></ProtectedRoute>} />
      <Route path="/safety" element={<ProtectedRoute><EmergencyContactsPage /></ProtectedRoute>} />
      <Route path="/favorite-drivers" element={<ProtectedRoute><FavoriteDriversPage /></ProtectedRoute>} />
      <Route path="/loyalty" element={<ProtectedRoute><LoyaltyPage /></ProtectedRoute>} />
      <Route path="/home" element={<ProtectedRoute allowedRoles={['user']}><UserHome /></ProtectedRoute>} />
      <Route path="/app" element={user ? <Navigate to="/home" replace /> : <ClientWelcome />} />
      <Route path="/login" element={user ? <Navigate to="/home" replace /> : <LoginPage />} />
      <Route path="/login/email" element={user ? <Navigate to="/home" replace /> : <EmailLoginPage />} />
      <Route path="/admin-login" element={user?.role === 'admin' ? <Navigate to="/admin" replace /> : <AdminLoginPage />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />

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
      <Route path="/actualites" element={<ProtectedRoute allowedRoles={['user']}><NewsFeedPage /></ProtectedRoute>} />
      <Route path="/all-services" element={<ProtectedRoute allowedRoles={['user']}><AllServicesPage /></ProtectedRoute>} />
      <Route path="/service-providers/:slug" element={<ProtectedRoute allowedRoles={['user']}><ServiceProvidersPage /></ProtectedRoute>} />
      <Route path="/service-provider/:id" element={<ProtectedRoute allowedRoles={['user']}><ServiceProviderDetailPage /></ProtectedRoute>} />
      <Route path="/carpool" element={<ProtectedRoute allowedRoles={['user']}><CarPoolPage /></ProtectedRoute>} />
      <Route path="/marketplace" element={<ProtectedRoute allowedRoles={['user']}><MarketplacePage /></ProtectedRoute>} />
      <Route path="/marketplace/orders" element={<ProtectedRoute allowedRoles={['user']}><MyOrdersPage /></ProtectedRoute>} />
      <Route path="/marketplace/order/success" element={<ProtectedRoute allowedRoles={['user']}><OrderSuccessPage /></ProtectedRoute>} />
      <Route path="/ma-galerie" element={<ProtectedRoute allowedRoles={['user']}><SellGalleryPage /></ProtectedRoute>} />
      <Route path="/marketplace/messages" element={<ProtectedRoute allowedRoles={['user']}><MarketplaceMessagesPage /></ProtectedRoute>} />
      <Route path="/marketplace/messages/:threadId" element={<ProtectedRoute allowedRoles={['user']}><MarketplaceMessagesPage /></ProtectedRoute>} />
      <Route path="/marketplace/sell-vehicle" element={<ProtectedRoute allowedRoles={['user']}><PostVehiclePage /></ProtectedRoute>} />
      <Route path="/marketplace/:category" element={<ProtectedRoute allowedRoles={['user']}><MarketplacePage /></ProtectedRoute>} />
      <Route path="/nearby" element={<ProtectedRoute allowedRoles={['user']}><NearbyBusinessPage /></ProtectedRoute>} />
      <Route path="/beauty" element={<ProtectedRoute allowedRoles={['user']}><BeautyServicesPage /></ProtectedRoute>} />
      <Route path="/pet-care" element={<ProtectedRoute allowedRoles={['user']}><PetServicesPage /></ProtectedRoute>} />
      <Route path="/car-care" element={<ProtectedRoute allowedRoles={['user']}><CarCarePage /></ProtectedRoute>} />
      <Route path="/towing" element={<ProtectedRoute allowedRoles={['user']}><TowingServicesPage /></ProtectedRoute>} />
      <Route path="/more-taxi" element={<Navigate to="/taxi" replace />} />
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
      <Route path="/transport-public" element={<ProtectedRoute allowedRoles={['user']}><TransportPublicPage /></ProtectedRoute>} />
      <Route path="/transports-autour" element={<ProtectedRoute allowedRoles={['user']}><NearbyTransitPage /></ProtectedRoute>} />
      <Route path="/scheduled-rides" element={<ProtectedRoute allowedRoles={['user']}><ScheduledRidesPage /></ProtectedRoute>} />
      <Route path="/corporate" element={<ProtectedRoute allowedRoles={['user']}><CorporateAccountPage /></ProtectedRoute>} />
      <Route path="/runner" element={<ProtectedRoute allowedRoles={['user']}><RunnerPage /></ProtectedRoute>} />
      <Route path="/intercity" element={<ProtectedRoute allowedRoles={['user']}><IntercityRidePage /></ProtectedRoute>} />
      <Route path="/parking" element={<ProtectedRoute allowedRoles={['user']}><ParkingPage /></ProtectedRoute>} />
      <Route path="/giftcards" element={<ProtectedRoute allowedRoles={['user']}><GiftCardsPage /></ProtectedRoute>} />
      <Route path="/tracking" element={<ProtectedRoute allowedRoles={['user']}><TrackingServicePage /></ProtectedRoute>} />
      <Route path="/wallet/payout-method" element={<ProtectedRoute allowedRoles={['driver', 'merchant']}><PayoutMethodPage /></ProtectedRoute>} />
      <Route path="/finance" element={<Navigate to="/wallet" replace />} />
      <Route path="/ride/:rideId/waybill" element={<ProtectedRoute allowedRoles={['user', 'driver']}><WaybillPage /></ProtectedRoute>} />
      <Route path="/ride/:rideId/receipt" element={<ProtectedRoute allowedRoles={['user']}><RideReceiptPage /></ProtectedRoute>} />
      <Route path="/wallet" element={<ProtectedRoute allowedRoles={['user', 'driver', 'merchant']}><WalletPage /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute allowedRoles={['user']}><ProfilePage /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute allowedRoles={['user']}><HistoryPage /></ProtectedRoute>} />
      <Route path="/referral" element={<ProtectedRoute allowedRoles={['user']}><ReferralPage /></ProtectedRoute>} />
      <Route path="/donation" element={<ProtectedRoute allowedRoles={['user']}><DonationPage /></ProtectedRoute>} />
      <Route path="/livechat" element={<ProtectedRoute allowedRoles={['user']}><LiveChatPage /></ProtectedRoute>} />
      <Route path="/support" element={<ProtectedRoute allowedRoles={['user', 'driver', 'merchant']}><SupportPage /></ProtectedRoute>} />
    </>
  );
}
