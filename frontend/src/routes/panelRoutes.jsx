import React from 'react';
import { Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';
import {
  DispatcherPanel, PanelLayout, PanelHome, AdminLiveRides, AdminAutoDispatch, AdminMonitoring, AdminBookingsHub,
  AdminDrivers, AdminPriorityDrivers, AdminRides, AdminSosRequests, AdminTripHelpRequests,
  AdminDisputesCrud, AdminRevenue, AdminSettlementsCrud, AdminPayoutsCrud, AdminWithdrawRequests,
  AdminPromocodes, AdminGiftCards, AdminPaymentMethods, AdminServiceConfig,
  AdminNegotiationGapReport, AdminNoDriverStats, AdminReports, AdminDbBackup, AdminSettings, AdminGeoFence,
  AdminSbPayGoZones, AdminEmailTemplates, AdminSmsTemplates, AdminPushNotifications,
  AdminVehicleMakes, AdminVehicleModels, AdminVehicleTypes, AdminMasterServices, AdminCancelReasons,
  AdminUsers, AdminReferralSettings, AdminNewsletter, AdminBanners, AdminContactRequests,
  AdminOrderHelpRequests, AdminTopDriversSettings, AdminDocumentsCrud, AdminRequests, AdminRewards,
  AdminStores, AdminCompany, AdminHotels, AdminKiosks, AdminOrders, AdminFeaturedListings,
  AdminOnboarding,
} from './pages';

export function panelRoutes() {
  return (
    <>
      {/* ======= DISPATCHER ======= */}
      <Route path="/dispatcher" element={<ProtectedRoute allowedRoles={['dispatcher', 'admin']}><DispatcherPanel /></ProtectedRoute>} />

      {/* ======= 6 ROLE-BASED PANELS (Phase B) ======= */}
      {/* DISPATCH */}
      <Route path="/dispatch" element={<ProtectedRoute allowedRoles={['admin']}><PanelLayout panelKey="dispatch" /></ProtectedRoute>}>
        <Route index element={<PanelHome panelKey="dispatch" />} />
        <Route path="bookings" element={<AdminBookingsHub />} />
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
        <Route path="reports" element={<AdminReports />} />
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
        <Route path="onboarding" element={<AdminOnboarding />} />
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
        <Route path="onboarding" element={<AdminOnboarding />} />
      </Route>
    </>
  );
}
