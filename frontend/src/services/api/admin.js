import { api } from './client';

export const parkingAdminAPI = {
  list: () => api.get('/admin/parking/spots'),
  create: (data) => api.post('/admin/parking/spots', data),
  update: (id, data) => api.put(`/admin/parking/spots/${id}`, data),
  toggle: (id) => api.patch(`/admin/parking/spots/${id}/toggle`),
  remove: (id) => api.delete(`/admin/parking/spots/${id}`),
};

// Admin — types d'assistance SB Access (CRUD éditable)

export const assistTypesAdminAPI = {
  list: () => api.get('/admin/assist-types'),
  create: (data) => api.post('/admin/assist-types', data),
  update: (id, data) => api.put(`/admin/assist-types/${id}`, data),
  toggle: (id) => api.patch(`/admin/assist-types/${id}/toggle`),
  remove: (id) => api.delete(`/admin/assist-types/${id}`),
};

export const airportAdminAPI = {
  list: () => api.get('/phase2/config/airport-zones'),
  create: (data) => api.post('/phase2/config/airport-zones', data),
  update: (id, data) => api.put(`/phase2/config/airport-zones/${id}`, data),
  remove: (id) => api.delete(`/phase2/config/airport-zones/${id}`),
  reservations: () => api.get('/phase2/admin/airport/reservations'),
};

// Démo seed / reset

export const demoAPI = {
  status: () => api.get('/phase2/admin/demo/status'),
  seed: () => api.post('/phase2/admin/demo/seed'),
  reset: (clean_rides = false) => api.post('/phase2/admin/demo/reset', { clean_rides }),
};

// Global Demo Mode flag (admin-toggleable; Stripe stays LIVE)

export const demoModeAPI = {
  status: () => api.get('/demo-mode/status'),
  getConfig: () => api.get('/demo-mode/config'),
  updateConfig: (data) => api.put('/demo-mode/config', data),
  walletCredit: () => api.post('/demo-mode/wallet-credit'),
};

// Safety audio recordings (driver-side)

export const dispatchAdminAPI = {
  overview: () => api.get('/admin/dispatch/overview'),
  driverBehavior: () => api.get('/admin/dispatch/driver-behavior'),
  suspendDriver: (id) => api.post(`/admin/dispatch/drivers/${id}/suspend`),
  reinstateDriver: (id) => api.post(`/admin/dispatch/drivers/${id}/reinstate`),
  getConfig: () => api.get('/admin/auto-dispatch/config'),
  updateConfig: (data) => api.put('/admin/auto-dispatch/config', data),
  taxiRecruitment: () => api.get('/admin/dispatch/taxi-recruitment'),
  inviteTaxi: (driverId, zone) => api.post('/admin/dispatch/taxi-recruitment/invite', { driver_id: driverId, zone }),
  demandHeatmap: () => api.get('/admin/dispatch/demand-heatmap'),
  getAutoSurge: () => api.get('/admin/dispatch/auto-surge'),
  saveAutoSurge: (cfg) => api.put('/admin/dispatch/auto-surge', cfg),
  nearbyOfflineDrivers: (days = 14) => api.get(`/admin/dispatch/nearby-offline-drivers?days=${days}`),
  noMovementConfig: () => api.get('/admin/dispatch/no-movement/config'),
  saveNoMovementConfig: (cfg) => api.put('/admin/dispatch/no-movement/config', cfg),
  noMovementReassignments: (hours = 24) => api.get('/admin/dispatch/no-movement/reassignments', { params: { hours } }),
};

// Order APIs

export const supportAPI = {
  createTicket: (data) => api.post('/support/tickets', data),
  listTickets: () => api.get('/support/tickets'),
  replyToTicket: (id, message) => api.post(`/support/tickets/${id}/reply`, { message }),
};

// Admin APIs

export const adminAPI = {
  dashboard: () => api.get('/admin/dashboard'),
  listUsers: (params) => api.get('/admin/users', { params }),
  getUser: (id) => api.get(`/admin/users/${id}`),
  createUser: (data) => api.post('/admin/users', data),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  creditUserWallet: (id, amount, note) => api.post(`/admin/users/${id}/wallet/credit`, { amount, note }),
  getUserDocuments: (id) => api.get(`/admin/users/${id}/documents`),
  uploadUserDocument: (id, payload) => api.post(`/admin/users/${id}/documents`, payload),
  deleteUserDocument: (id, docId) => api.delete(`/admin/users/${id}/documents/${docId}`),
  listDrivers: (params) => api.get('/admin/drivers', { params }),
  createDriver: (data) => api.post('/admin/drivers', data),
  deleteDriver: (id) => api.delete(`/admin/drivers/${id}`),
  importDrivers: (csv) => api.post('/admin/import/drivers', { csv }),
  createMerchant: (data) => api.post('/admin/merchants', data),
  deleteMerchant: (id) => api.delete(`/admin/merchants/${id}`),
  importMerchants: (csv) => api.post('/admin/import/merchants', { csv }),
  getOnboarding: () => api.get('/admin/onboarding'),
  // Dettes clients
  debtsOverview: (params) => api.get('/admin/debts/overview', { params }),
  debtsUser: (uid) => api.get(`/admin/debts/user/${uid}`),
  debtsCollect: (uid) => api.post(`/admin/debts/user/${uid}/collect`),
  debtsWaive: (uid) => api.post(`/admin/debts/user/${uid}/waive`),
  debtsRemind: (uid) => api.post(`/admin/debts/user/${uid}/remind`),
  // Rapport activité chauffeur
  driverActivity: (params) => api.get('/admin/driver-activity', { params }),
  // Politique dettes + timing trajets
  debtPolicyGet: () => api.get('/admin/debts/policy'),
  debtPolicySet: (body) => api.put('/admin/debts/policy', body),
  tripTimings: (params) => api.get('/admin/trip-timings', { params }),
  codeHealth: () => api.get('/admin/code-health'),
  codeSecurity: () => api.get('/admin/code-health/security'),
  codeMapsGuard: () => api.get('/admin/code-health/maps-guard'),
  codeMapsGate: () => api.get('/admin/code-health/maps-guard/gate'),
  codeMapsBaseline: () => api.post('/admin/code-health/maps-guard/baseline'),
  codeCoverage: () => api.get('/admin/code-health/coverage'),
  codeCoverageByDomain: () => api.get('/admin/code-health/coverage/by-domain'),
  codeCoverageRun: () => api.post('/admin/code-health/coverage/run'),
  codeSetBaseline: () => api.post('/admin/code-health/integrity/baseline'),
  remindOnboarding: (data) => api.post('/admin/onboarding/remind', data),
  approveDriver: (id) => api.post(`/admin/drivers/${id}/approve`),
  rejectDriver: (id, reason) => api.post(`/admin/drivers/${id}/reject`, { reason }),
  getDriverDocuments: (driverId) => api.get(`/admin/drivers/${driverId}/documents`),
  setDriverDocumentStatus: (driverId, docType, status, reason) => api.put(`/admin/drivers/${driverId}/documents/${docType}/status`, { status, reason }),
  setDriverInfoChangeStatus: (driverId, status, reason) => api.put(`/admin/drivers/${driverId}/info-change/status`, { status, reason }),
  setDriverServiceTypes: (driverId, serviceTypes) => api.put(`/admin/drivers/${driverId}/service-types`, { service_types: serviceTypes }),
  getDriverReportExport: (driverId) => api.get(`/admin/drivers/${driverId}/report-export`),
  setDriverReportExport: (driverId, allowed) => api.put(`/admin/drivers/${driverId}/report-export`, { allowed }),
  updateAppSettings: (data) => api.put('/config/admin/app-settings', data),
  getAppSettingsZones: () => api.get('/config/admin/app-settings/zones'),
  updateGeneralSettings: (data) => api.put('/config/admin/general-settings', data),
  listAutoPromotions: () => api.get('/auto-promotions/admin'),
  createAutoPromotion: (data) => api.post('/auto-promotions/admin', data),
  updateAutoPromotion: (id, data) => api.put(`/auto-promotions/admin/${id}`, data),
  toggleAutoPromotion: (id) => api.put(`/auto-promotions/admin/${id}/toggle`),
  deleteAutoPromotion: (id) => api.delete(`/auto-promotions/admin/${id}`),
  listVouchers: () => api.get('/vouchers/admin'),
  createVoucher: (data) => api.post('/vouchers/admin', data),
  updateVoucher: (id, data) => api.put(`/vouchers/admin/${id}`, data),
  toggleVoucher: (id) => api.put(`/vouchers/admin/${id}/toggle`),
  deleteVoucher: (id) => api.delete(`/vouchers/admin/${id}`),
  listRides: (params) => api.get('/admin/bookings/rides', { params }),
  listOrders: (params) => api.get('/admin/bookings/orders', { params }),
  bookingsOverview: () => api.get('/admin/bookings/overview'),
  bookingsLive: () => api.get('/admin/bookings/live'),
  bookingsScheduled: (params) => api.get('/admin/bookings/scheduled', { params }),
  createManualRide: (data) => api.post('/admin/bookings/manual-ride', data),
  createManualOrder: (data) => api.post('/admin/bookings/manual-order', data),
  cancelBookingRide: (id, reason) => api.post(`/admin/bookings/ride/${id}/cancel`, { reason }),
  rescheduleBookingRide: (id, scheduled_at) => api.post(`/admin/bookings/ride/${id}/reschedule`, { scheduled_at }),
  reassignBookingRide: (id, driver_id) => api.post(`/admin/bookings/ride/${id}/reassign`, { driver_id }),
  nearbyDrivers: (id, limit = 3) => api.get(`/admin/bookings/ride/${id}/nearby-drivers`, { params: { limit } }),
  autoDispatch: (id) => api.post(`/admin/bookings/ride/${id}/auto-dispatch`),
  dispatchStatus: (id) => api.get(`/admin/bookings/ride/${id}/dispatch-status`),
  dispatchCancel: (id) => api.post(`/admin/bookings/ride/${id}/dispatch-cancel`),
  offerRespond: (id, accept, driver_id) => api.post(`/admin/bookings/ride/${id}/offer-respond`, { accept, driver_id }),
  report: (kind, params) => api.get(`/admin/reports/${kind}`, { params }),
  exportAllReports: (params) => api.get('/admin/reports/export-zip', { params, responseType: 'blob' }),
  listReportSchedules: () => api.get('/admin/reports/schedules'),
  createReportSchedule: (body) => api.post('/admin/reports/schedules', body),
  updateReportSchedule: (id, body) => api.put(`/admin/reports/schedules/${id}`, body),
  deleteReportSchedule: (id) => api.delete(`/admin/reports/schedules/${id}`),
  sendReportScheduleNow: (id, test_email) => api.post(`/admin/reports/schedules/${id}/send-now`, test_email ? { test_email } : {}),
  reportScheduleRuns: (limit = 50) => api.get('/admin/reports/schedule-runs', { params: { limit } }),
  suspendUser: (id) => api.post(`/admin/users/${id}/suspend`),
  unsuspendUser: (id) => api.post(`/admin/users/${id}/unsuspend`),
  revenue: () => api.get('/admin/revenue'),
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (settings) => api.put('/admin/settings', { settings }),
  listTickets: () => api.get('/support/tickets'),
  replyTicket: (id, message) => api.post(`/support/tickets/${id}/reply`, { message }),
  getServiceConfig: (key) => api.get(`/admin/service-config/${key}`),
  saveServiceConfig: (key, settings) => api.put(`/admin/service-config/${key}`, { settings }),
  listNewsletterSubscribers: () => api.get('/newsletter/admin/subscribers'),
  deleteNewsletterSubscriber: (id) => api.delete(`/newsletter/admin/subscribers/${id}`),
  listNewsletterCampaigns: () => api.get('/newsletter/admin/campaigns'),
  sendNewsletter: (data) => api.post('/newsletter/admin/send', data),
  listServiceCategories: () => api.get('/admin/service-categories'),
  createServiceCategory: (data) => api.post('/admin/service-categories', data),
  deleteServiceCategory: (key) => api.delete(`/admin/service-categories/${key}`),
  updateServiceCategory: (key, data) => api.put(`/admin/service-categories/${key}`, data),
  toggleServiceCategory: (key) => api.post(`/admin/service-categories/${key}/toggle`),
  toggleServiceCategoryHome: (key) => api.post(`/admin/service-categories/${key}/toggle-home`),
  reorderServiceCategories: (orderedKeys) => api.post('/admin/service-categories/reorder', { ordered_keys: orderedKeys }),
  listStoreCategories: () => api.get('/admin/store-categories'),
  updateStoreCategory: (key, data) => api.put(`/admin/store-categories/${key}`, data),
  toggleStoreCategory: (key) => api.post(`/admin/store-categories/${key}/toggle`),
  reorderStoreCategories: (orderedKeys) => api.post('/admin/store-categories/reorder', { ordered_keys: orderedKeys }),
  getSurge: () => api.get('/admin/pricing/surge'),
  createSurgeRule: (data) => api.post('/admin/pricing/surge', data),
  updateSurgeRule: (id, data) => api.put(`/admin/pricing/surge/${id}`, data),
  deleteSurgeRule: (id) => api.delete(`/admin/pricing/surge/${id}`),
  toggleSurgeRule: (id) => api.post(`/admin/pricing/surge/${id}/toggle`),
  getSurgeLocations: () => api.get('/admin/pricing/surge/locations'),
  createSurgeLocation: (data) => api.post('/admin/pricing/surge/locations', data),
  deleteSurgeLocation: (id) => api.delete(`/admin/pricing/surge/locations/${id}`),
  getSurgeHeatmap: () => api.get('/admin/pricing/surge/heatmap'),
  getWeather: () => api.get('/admin/pricing/weather'),
  createWeatherRule: (data) => api.post('/admin/pricing/weather', data),
  updateWeatherRule: (id, data) => api.put(`/admin/pricing/weather/${id}`, data),
  deleteWeatherRule: (id) => api.delete(`/admin/pricing/weather/${id}`),
  toggleWeatherRule: (id) => api.post(`/admin/pricing/weather/${id}/toggle`),
  getWeatherConditions: () => api.get('/admin/pricing/weather/conditions'),
  getWeatherCurrent: (lat, lng) => api.get('/admin/pricing/weather/current', { params: { lat, lng } }),
  getTaxiConfig: (key) => api.get(`/admin/taxi-configs/${key}`),
  saveTaxiConfig: (key, settings) => api.put(`/admin/taxi-configs/${key}`, { settings }),
  getRentalVehicles: () => api.get('/admin/rental-packages/vehicles'),
  getRentalPackages: (vt) => api.get('/admin/rental-packages', { params: { vehicle_type: vt } }),
  createRentalPackage: (data) => api.post('/admin/rental-packages', data),
  updateRentalPackage: (id, data) => api.put(`/admin/rental-packages/${id}`, data),
  deleteRentalPackage: (id) => api.delete(`/admin/rental-packages/${id}`),
  getRideProfiles: () => api.get('/admin/ride-profiles'),
  createRideProfile: (data) => api.post('/admin/ride-profiles', data),
  updateRideProfile: (id, data) => api.put(`/admin/ride-profiles/${id}`, data),
  deleteRideProfile: (id) => api.delete(`/admin/ride-profiles/${id}`),
  toggleRideProfile: (id) => api.post(`/admin/ride-profiles/${id}/toggle`),
  listDriverCategories: () => api.get('/admin/driver-categories'),
  createDriverCategory: (data) => api.post('/admin/driver-categories', data),
  updateDriverCategory: (id, data) => api.put(`/admin/driver-categories/${id}`, data),
  deleteDriverCategory: (id) => api.delete(`/admin/driver-categories/${id}`),
  reorderDriverCategories: (orderedIds) => api.post('/admin/driver-categories/reorder', { ordered_ids: orderedIds }),
  getTripReasons: () => api.get('/admin/business-trip-reasons'),
  createTripReason: (data) => api.post('/admin/business-trip-reasons', data),
  updateTripReason: (id, data) => api.put(`/admin/business-trip-reasons/${id}`, data),
  deleteTripReason: (id) => api.delete(`/admin/business-trip-reasons/${id}`),
  toggleTripReason: (id) => api.post(`/admin/business-trip-reasons/${id}/toggle`),
};

// Dispatcher APIs

export const configAPI = {
  getAppConfig: () => api.get('/config/app'),
  getVehicleCategories: () => api.get('/config/vehicle-categories'),
  getVehicleTypes: (categorySlug) => api.get('/config/vehicle-types', { params: categorySlug ? { category_slug: categorySlug } : {} }),
  getVehicleType: (slug) => api.get(`/config/vehicle-types/${slug}`),
  getNearbyCategories: () => api.get('/config/nearby-categories'),
  getParcelTypes: () => api.get('/config/parcel-types'),
  getCancelReasons: (userType) => api.get('/config/cancel-reasons', { params: userType ? { user_type: userType } : {} }),
  getMasterCategories: () => api.get('/config/master-categories'),
  getTrackCategories: () => api.get('/config/track-categories'),
  getScheduling: () => api.get('/config/scheduling'),
  getServiceCategories: () => api.get('/service-categories'),
  getStoreCategories: (location) => api.get('/store-categories', { params: location ? { location } : {} }),
  getServiceReminders: () => api.get('/service-categories/reminders'),
  subscribeServiceReminder: (key) => api.post(`/service-categories/${key}/remind`),
  unsubscribeServiceReminder: (key) => api.delete(`/service-categories/${key}/remind`),
  getTaxiOptions: () => api.get('/config/taxi-options'),
  getRentalPackages: (vehicleType) => api.get('/config/rental-packages', { params: vehicleType ? { vehicle_type: vehicleType } : {} }),
  getRideProfiles: () => api.get('/config/ride-profiles'),
  getBusinessTripReasons: () => api.get('/config/business-trip-reasons'),
  getTaxiBooking: () => api.get('/config/taxi-booking'),
  getVehicleBadge: () => api.get('/config/vehicle-badge'),
  getPaymentMethods: () => api.get('/config/payment-methods'),
  getPoolConfig: () => api.get('/config/pool'),
  getAppSettings: (params) => api.get('/config/app-settings', { params }),
  getGeneralSettings: () => api.get('/config/general-settings'),
  getReservationRules: () => api.get('/config/reservation-rules'),
};

// Reservation rules — admin editor (expiry windows, start delay, button label)

export const reservationRulesAPI = {
  get: () => api.get('/admin/reservation-rules'),
  update: (settings) => api.put('/admin/reservation-rules', { settings }),
};

// Trending services ("place de marché vivante") — zone-aware popular services.

export const chatAPI = {
  messages: (refType, refId, after) => api.get(`/chat/${refType}/${refId}/messages`, { params: after ? { after } : {} }),
  send: (refType, refId, text) => api.post(`/chat/${refType}/${refId}/messages`, { text }),
  unread: (refType, refId) => api.get(`/chat/${refType}/${refId}/unread`),
};

export const corporateAPI = {
  // user
  my: () => api.get('/corporate/my'),
  join: (joinCode) => api.post('/corporate/join', { join_code: joinCode }),
  leave: (corporateId) => api.post(`/corporate/leave/${corporateId}`),
  // admin
  adminList: () => api.get('/corporate/admin'),
  adminCreate: (data) => api.post('/corporate/admin', data),
  adminDetail: (id) => api.get(`/corporate/admin/${id}`),
  adminUpdate: (id, data) => api.put(`/corporate/admin/${id}`, data),
  adminDelete: (id) => api.delete(`/corporate/admin/${id}`),
  adminAddMember: (id, email, role) => api.post(`/corporate/admin/${id}/members`, { email, member_role: role }),
  adminRemoveMember: (id, memberId) => api.delete(`/corporate/admin/${id}/members/${memberId}`),
  adminInvoice: (id, month) => api.get(`/corporate/admin/${id}/invoice`, { params: month ? { month } : {} }),
};

export const simulationAPI = {
  start: () => api.post('/simulation/start'),
  stop: () => api.post('/simulation/stop'),
  status: () => api.get('/simulation/status'),
};
