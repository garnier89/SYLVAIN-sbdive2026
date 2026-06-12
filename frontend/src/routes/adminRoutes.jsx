import React from 'react';
import { Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import AdminPayouts from '../pages/admin/AdminPayouts';
import {
  AdminLayout, AdminDashboard, AdminUsers, AdminUserEdit, AdminDrivers, AdminRides,
  AdminSupport, AdminRevenue, AdminGodsView, AdminHeatView, AdminPromocodes, AdminSettings,
  AdminMonitoring, AdminLiveRides, AdminAutoDispatch, AdminDispatch, AdminManageAdmins, AdminGroupsPage,
  AdminVehicles, AdminDriverCategories, AdminRequests, AdminDocumentsCrud, AdminCompany,
  AdminHotelsManager, AdminOrganization, AdminVehicleTypes, AdminOrders, AdminServiceConfig, AdminPoolConfig, AdminTaxiRecruitment,
  AdminManualBooking, AdminPayoutsCrud, AdminSettlementsCrud, AdminDisputesCrud,
  AdminWithdrawRequests, AdminRewards, AdminPriorityDrivers, AdminTopDriversSettings,
  AdminVehicleMakes, AdminVehicleModels, AdminMasterServices, AdminCancellationReasonsPage,
  AdminCancelReasons, AdminScheduling, AdminServiceCategories, AdminStoreCategories,
  AdminDynamicPricing, AdminTaxiConfigs, AdminRentalPackages, AdminMotoFleet, AdminCarFleet, AdminFlights, AdminTravelPackages, AdminRideProfiles,
  AdminEmailTemplates, AdminSmsTemplates, AdminSosRequests, AdminContactRequests,
  AdminOrderHelpRequests, AdminTripHelpRequests, AdminPushNotifications, AdminPaymentMethods,
  AdminSbPayGoZones, AdminDbBackup, AdminNegotiationGapReport, AdminNoDriverStats,
  AdminFeaturedListings, AdminNearbyBusinesses, AdminZones, AdminTrendingPinned, AdminMarketplace, AdminTransport, AdminRealEstate, AdminPharmacy, AdminServiceSettings, AdminAppSettings, AdminNotifSettings,
  AdminKiosks, AdminACL, AdminFraud, AdminAuditLogs, AdminOrganizations, AdminCorporate, AdminHomeCategories,
  AdminPromoBanners, AdminNews, AdminStudent, AdminAccess, AdminI18n, AdminGeoFence, AdminAirport, AdminDemo, AdminGiftCards, AdminReferralSettings, AdminLoyalty, AdminModeration, AdminServiceProviders, AdminLiveSupport,
  AdminBanners, AdminNewsletter, AdminKyc, AdminStores, AdminTemplates, AdminWeatherSurcharge,
  AdminPersonalDriver, AdminAutoPromotions, AdminVouchers, AdminFaqs, AdminHelpArticles,
  AdminDonations, AdminWeeklyReports,
} from './pages';

export function adminRoutes() {
  return (
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
      <Route path="dispatch" element={<AdminDispatch />} />
      <Route path="admins" element={<AdminManageAdmins />} />
      <Route path="groups" element={<AdminGroupsPage />} />
      <Route path="vehicles" element={<AdminVehicles />} />
      <Route path="driver-categories" element={<AdminDriverCategories />} />
      <Route path="requests" element={<AdminRequests />} />
      <Route path="documents" element={<AdminDocumentsCrud />} />
      <Route path="company" element={<AdminCompany />} />
      <Route path="hotels" element={<AdminHotelsManager />} />
      <Route path="flights" element={<AdminFlights />} />
      <Route path="travel-packages" element={<AdminTravelPackages />} />
      <Route path="organization" element={<AdminOrganization />} />
      <Route path="vehicle-types" element={<AdminVehicleTypes />} />
      <Route path="parcels" element={<AdminOrders />} />
      <Route path="store-delivery" element={<AdminOrders />} />
      <Route path="genie" element={<AdminServiceConfig serviceKey="genie" />} />
      <Route path="runner" element={<AdminServiceConfig serviceKey="runner" />} />
      <Route path="ondemand" element={<AdminServiceConfig serviceKey="ondemand" />} />
      <Route path="video" element={<AdminServiceConfig serviceKey="video" />} />
      <Route path="bids" element={<AdminServiceConfig serviceKey="bids" />} />
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
      <Route path="store-categories" element={<AdminStoreCategories />} />
      <Route path="dynamic-pricing" element={<AdminDynamicPricing />} />
      <Route path="taxi-configs" element={<AdminTaxiConfigs />} />
      <Route path="rental-packages" element={<AdminRentalPackages />} />
      <Route path="moto-fleet" element={<AdminMotoFleet />} />
      <Route path="car-fleet" element={<AdminCarFleet />} />
      <Route path="ride-profiles" element={<AdminRideProfiles />} />
      <Route path="email-templates" element={<AdminEmailTemplates />} />
      <Route path="sms-templates" element={<AdminSmsTemplates />} />
      <Route path="sos-requests" element={<AdminSosRequests />} />
      <Route path="contact-requests" element={<AdminContactRequests />} />
      <Route path="withdraw-requests" element={<AdminPayouts />} />
      <Route path="payout-methods" element={<AdminPayouts />} />
      <Route path="order-help-requests" element={<AdminOrderHelpRequests />} />
      <Route path="trip-help-requests" element={<AdminTripHelpRequests />} />
      <Route path="push-notifications" element={<AdminPushNotifications />} />
      <Route path="notif-settings" element={<AdminNotifSettings />} />
      {/* Settings & Utilities extras */}
      <Route path="payment-options" element={<AdminPaymentMethods />} />
      <Route path="payment-methods" element={<AdminPaymentMethods />} />
      <Route path="sbpaygo-zones" element={<AdminSbPayGoZones />} />
      <Route path="currency" element={<AdminServiceConfig serviceKey="currency" />} />
      <Route path="language" element={<AdminServiceConfig serviceKey="language" />} />
      <Route path="seo" element={<AdminServiceConfig serviceKey="seo" />} />
      <Route path="maps-api" element={<AdminServiceConfig serviceKey="maps-api" />} />
      <Route path="pool-config" element={<AdminPoolConfig />} />
      <Route path="taxi-recruitment" element={<AdminTaxiRecruitment />} />
      <Route path="ride-search-config" element={<AdminServiceConfig serviceKey="ride_search" />} />
      <Route path="taxi-booking-config" element={<AdminServiceConfig serviceKey="taxi_booking" />} />
      <Route path="no-driver-alerts-config" element={<AdminServiceConfig serviceKey="no_driver_alerts" />} />
      <Route path="payment-methods-config" element={<AdminServiceConfig serviceKey="payment_methods" />} />
      <Route path="vehicle-badge-config" element={<AdminServiceConfig serviceKey="vehicle_badge" />} />
      <Route path="db-backup" element={<AdminDbBackup />} />
      <Route path="reports/negotiation-gap" element={<AdminNegotiationGapReport />} />
      <Route path="reports/no-driver-stats" element={<AdminNoDriverStats />} />
      <Route path="featured-listings" element={<AdminFeaturedListings />} />
      <Route path="nearby-businesses" element={<AdminNearbyBusinesses />} />
      <Route path="zones" element={<AdminZones />} />
      <Route path="marketplace" element={<AdminMarketplace />} />
      <Route path="trending-pinned" element={<AdminTrendingPinned />} />
      <Route path="transport" element={<AdminTransport />} />
      <Route path="real-estate" element={<AdminRealEstate />} />
      <Route path="pharmacy" element={<AdminPharmacy />} />
      <Route path="services-settings" element={<AdminServiceSettings />} />
      <Route path="app-settings" element={<AdminAppSettings />} />
      <Route path="kiosks" element={<AdminKiosks />} />
      <Route path="acl" element={<AdminACL />} />
      <Route path="fraud" element={<AdminFraud />} />
      <Route path="audit-logs" element={<AdminAuditLogs />} />
      <Route path="organizations" element={<AdminOrganizations />} />
      <Route path="corporate" element={<AdminCorporate />} />
      <Route path="home-categories" element={<AdminHomeCategories />} />
      <Route path="promo-banners" element={<AdminPromoBanners />} />
      <Route path="actualites" element={<AdminNews />} />
      <Route path="student" element={<AdminStudent />} />
      <Route path="access" element={<AdminAccess />} />
      <Route path="i18n" element={<AdminI18n />} />
      <Route path="store-orders" element={<AdminOrders />} />
      <Route path="geo-fence" element={<AdminGeoFence />} />
      <Route path="restricted" element={<AdminGeoFence />} />
      <Route path="location-fare" element={<AdminServiceConfig serviceKey="location-fare" />} />
      <Route path="airport" element={<AdminAirport />} />
      <Route path="demo" element={<AdminDemo />} />
      <Route path="country" element={<AdminServiceConfig serviceKey="country" />} />
      <Route path="state" element={<AdminServiceConfig serviceKey="state" />} />
      <Route path="giftcards" element={<AdminGiftCards />} />
      <Route path="referral" element={<AdminReferralSettings />} />
      <Route path="loyalty" element={<AdminLoyalty />} />
      <Route path="moderation" element={<AdminModeration />} />
      <Route path="service-providers" element={<AdminServiceProviders />} />
      <Route path="live-support" element={<AdminLiveSupport />} />
      <Route path="banners" element={<AdminBanners />} />
      <Route path="news" element={<AdminNewsletter />} />
      <Route path="stores" element={<AdminStores />} />
      <Route path="newsletter" element={<AdminNewsletter />} />
      <Route path="kyc" element={<AdminKyc />} />
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
  );
}
