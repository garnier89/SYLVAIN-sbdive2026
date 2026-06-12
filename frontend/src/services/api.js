import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Auto-refresh token on 401
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error) => {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error);
    else prom.resolve();
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes('/auth/')) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve: () => resolve(api(originalRequest)), reject });
        });
      }
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        await api.post('/auth/refresh');
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  refresh: () => api.post('/auth/refresh'),
  changePassword: (data) => api.post('/auth/change-password', data),
  googleSession: (sessionId) => api.post('/auth/google/session', { session_id: sessionId }),
};

// User APIs
export const userAPI = {
  getAddresses: () => api.get('/users/addresses'),
  addAddress: (data) => api.post('/users/addresses', data),
  deleteAddress: (id) => api.delete(`/users/addresses/${id}`),
};

// Driver APIs
export const driverAPI = {
  register: (data) => api.post('/drivers/register', data),
  updateServiceTypes: (service_types, taxi_mode) => api.put('/drivers/service-types', { service_types, taxi_mode }),
  getTaxiEligibility: () => api.get('/drivers/taxi-eligibility'),
  getCategories: () => api.get('/drivers/categories'),
  getProfile: () => api.get('/drivers/profile'),
  toggleOnline: () => api.post('/drivers/toggle-online'),
  updateLocation: (lat, lng) => api.post('/drivers/location', { lat, lng }),
  getWorkBase: () => api.get('/drivers/work-base'),
  setWorkBase: (data) => api.put('/drivers/work-base', data),
  getEarnings: () => api.get('/drivers/earnings'),
  getReport: (from, to) => api.get('/drivers/report', { params: { from, to } }),
  exportReport: (format, from, to) => api.get('/drivers/report/export', { params: { format, from, to }, responseType: 'blob' }),
  getWeeklyReport: () => api.get('/driver/weekly-reports/current'),
  getWeeklyReportHistory: () => api.get('/driver/weekly-reports/history'),
  getRideHistory: () => api.get('/drivers/ride-history'),
  uploadDocument: (file, docType) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/drivers/documents?doc_type=${docType}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getMyDocuments: () => api.get('/drivers/my-documents'),
  requestInfoChange: (data) => api.put('/drivers/profile/info', data),
  getNotifications: () => api.get('/drivers/my-notifications'),
  markAllNotificationsRead: () => api.post('/drivers/notifications/read-all'),
  deleteNotification: (id) => api.delete(`/drivers/notifications/${id}`),
  getAvailability: () => api.get('/drivers/availability'),
  updateAvailability: (data) => api.put('/drivers/availability', data),
  getReviews: () => api.get('/drivers/reviews'),
};

// Merchant APIs
export const merchantAPI = {
  register: (data) => api.post('/merchants/register', data),
  list: (params) => api.get('/merchants', { params }),
  searchDelivery: (q) => api.get('/search/delivery', { params: { q } }),
  get: (id) => api.get(`/merchants/${id}`),
  getMine: () => api.get('/merchants/me'),
  signup: (payload) => api.post('/merchants/signup', payload),
  setAvailability: (payload) => api.post('/merchants/me/availability', payload),
  updateMine: (data) => api.put('/merchants/me', data),
  getStats: () => api.get('/merchants/me/stats'),
  getAnalytics: (period) => api.get('/merchants/me/analytics', { params: { period } }),
  getAiInsights: (period) => api.get('/merchants/me/ai-insights', { params: { period } }),
  getCategories: () => api.get('/merchants/meta/categories'),
  getProducts: (id) => api.get(`/merchants/${id}/products`),
  addProduct: (data) => api.post('/merchants/products', data),
  updateProduct: (id, data) => api.put(`/merchants/products/${id}`, data),
  adjustStock: (id, payload) => api.post(`/merchants/products/${id}/stock`, payload),
  uploadImage: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  deleteProduct: (id) => api.delete(`/merchants/products/${id}`),
  getReviews: (id) => api.get(`/merchants/${id}/reviews`),
  addReview: (id, data) => api.post(`/merchants/${id}/reviews`, data),
};

// Ride APIs
export const tripShareAPI = {
  create: (rideId) => api.post(`/rides/${rideId}/share`),
  get: (token) => api.get(`/trip-share/${token}`),
  getAutoShare: () => api.get('/safety/auto-share'),
  setAutoShare: (enabled) => api.put('/safety/auto-share', { enabled }),
  getRideAutoShare: (rideId) => api.get(`/rides/${rideId}/auto-share`),
};


export const rideAPI = {
  estimate: (data) => api.post('/rides/estimate', data),
  demandZones: (lat, lng) => api.get('/phase2/demand-zones', { params: { lat, lng } }),
  nearbyDrivers: (lat, lng) => api.get('/rides/nearby/drivers', { params: { lat, lng } }),
  biddingAvgFares: () => api.get('/rides/bidding/avg-fares'),
  getBestAutoPromo: (amount, service = 'ride', pickup = '') => api.get('/auto-promotions/best', { params: { amount, service, pickup } }),
  validateVoucher: (code, amount, pickup_address = '') => api.post('/vouchers/validate', { code, amount, pickup_address }),
  create: (data) => api.post('/rides', data),
  availabilityAlert: (data) => api.post('/rides/availability-alert', data),
  get: (id) => api.get(`/rides/${id}`),
  accept: (id) => api.post(`/rides/${id}/accept`),
  decline: (id) => api.post(`/rides/${id}/decline`),
  driverCancelBooking: (id) => api.post(`/rides/${id}/driver-cancel-booking`),
  updateStatus: (id, status) => api.post(`/rides/${id}/status`, { status }),
  cancel: (id, reason) => api.post(`/rides/${id}/cancel`, { reason }),
  list: (params) => api.get('/rides', { params }),
  driverBookings: () => api.get('/rides/driver/bookings'),
  driverHomeFeed: () => api.get('/rides/driver/home-feed'),
  taxiHall: (data) => api.post('/rides/taxi-hall', data),
  taxiHallEligibility: () => api.get('/rides/taxi-hall/eligibility'),
  rate: (id, data) => api.post(`/rides/${id}/rate`, data),
  ratePassenger: (id, data) => api.post(`/rides/${id}/rate-passenger`, data),
  complete: (id, extra_charges) => api.post(`/rides/${id}/status`, { status: 'completed', extra_charges }),
  getActive: () => api.get('/rides/active/current'),
  getAvailable: () => api.get('/rides/pending/available'),
  updateRoute: (id, data) => api.post(`/rides/${id}/update-route`, data),
  changePaymentMethod: (id, payment_method) => api.put(`/rides/${id}/payment-method`, { payment_method }),
  collectCash: (id, payload) => api.post(`/rides/${id}/collect-cash`, typeof payload === 'boolean' ? { received: payload } : payload),
  airports: () => api.get('/phase2/airports'),
  flightRefresh: (id) => api.post(`/phase2/rides/${id}/flight-refresh`),
  // Mise à disposition (rental) — live billing meter
  rentalStart: (id) => api.post(`/rides/${id}/rental/start`),
  rentalAddStop: (id, stop) => api.post(`/rides/${id}/rental/add-stop`, stop),
  rentalMeter: (id) => api.get(`/rides/${id}/rental/meter`),
  rentalEnd: (id, actual_km) => api.post(`/rides/${id}/rental/end`, { actual_km }),
};

// Airport Transfer admin
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
export const safetyAudioAPI = {
  upload: (blob, { ride_id, kind = 'ride', duration_sec = 0 } = {}) => {
    const fd = new FormData();
    const ext = (blob.type || 'audio/webm').includes('ogg') ? 'ogg' : 'webm';
    fd.append('file', blob, `safety_${Date.now()}.${ext}`);
    if (ride_id) fd.append('ride_id', ride_id);
    fd.append('kind', kind);
    fd.append('duration_sec', String(duration_sec));
    return api.post('/safety/audio/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  listForRide: (rideId) => api.get(`/safety/audio/ride/${rideId}`),
  adminList: (params) => api.get('/admin/safety/recordings', { params }),
};

// Dispatch control tower (admin / dispatcher)
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
};

// Order APIs
export const orderAPI = {
  create: (data) => api.post('/orders', data),
  get: (id) => api.get(`/orders/${id}`),
  updateStatus: (id, status) => api.post(`/orders/${id}/status`, { status }),
  assignDriver: (id, driverId) => api.post(`/orders/${id}/assign-driver`, { driver_id: driverId }),
  list: (params) => api.get('/orders', { params }),
  lastDelivery: () => api.get('/orders/last-delivery'),
  rate: (id, data) => api.post(`/orders/${id}/rate`, data),
  // Food delivery — driver jobs + live tracking
  availableDeliveries: () => api.get('/orders/available-deliveries'),
  driverActiveOrders: () => api.get('/orders/driver/active'),
  claim: (id) => api.post(`/orders/${id}/claim`),
  track: (id) => api.get(`/orders/${id}/track`),
  deliveryOptions: () => api.get('/orders/delivery-options'),
};

// Cart APIs
export const cartAPI = {
  get: () => api.get('/cart'),
  save: (merchantId, items) => api.put('/cart', { merchant_id: merchantId, items }),
  clear: () => api.delete('/cart'),
};

// Wallet APIs
export const walletAPI = {
  get: () => api.get('/wallet'),
  topup: (amount, paymentMethod) => api.post('/wallet/topup', { amount, payment_method: paymentMethod }),
  pay: (data) => api.post('/wallet/pay', data),
  transfer: (toUserId, amount) => api.post('/wallet/transfer', { to_user_id: toUserId, amount }),
  refund: (amount, reason) => api.post('/wallet/refund', { amount, reason }),
};

// SB PayGo / finance APIs
export const financeAPI = {
  balance: () => api.get('/finance/balance'),
  sbpaygoSsoLink: () => api.post('/finance/sbpaygo/sso-link'),
};

// Support APIs
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
export const dispatcherAPI = {
  getLiveData: () => api.get('/dispatcher/live'),
  assignRide: (rideId, driverId) => api.post('/dispatcher/assign-ride', { ride_id: rideId, driver_id: driverId }),
};

// Marketplace APIs
export const marketplaceAPI = {
  createListing: (data) => api.post('/marketplace/listings', data),
  getListings: (params) => api.get('/marketplace/listings', { params }),
  getListing: (id) => api.get(`/marketplace/listings/${id}`),
  myListings: () => api.get('/marketplace/my-listings'),
  deleteListing: (id) => api.delete(`/marketplace/listings/${id}`),
  updateListing: (id, data) => api.put(`/marketplace/listings/${id}`, data),
  boostPlans: (country) => api.get('/marketplace/boost-plans', { params: country ? { country } : {} }),
  boostPay: (id, planId) => api.post(`/marketplace/listings/${id}/boost/pay`, { plan_id: planId }),
  startThread: (listingId) => api.post('/marketplace/threads', { listing_id: listingId }),
  myThreads: () => api.get('/marketplace/threads'),
  threadMessages: (threadId) => api.get(`/marketplace/threads/${threadId}/messages`),
  sendMessage: (threadId, text) => api.post(`/marketplace/threads/${threadId}/messages`, { text }),
  markThreadRead: (threadId) => api.post(`/marketplace/threads/${threadId}/read`),
  // Buy / pay flow
  settings: () => api.get('/marketplace/settings'),
  setPurchasable: (id, purchasable, price) => api.patch(`/marketplace/listings/${id}/purchasable`, { purchasable, price }),
  buyWithWallet: (data) => api.post('/marketplace/orders/wallet', data),
  buyWithCard: (data) => api.post('/marketplace/orders/checkout', data),
  checkoutStatus: (sessionId) => api.get(`/marketplace/checkout/status/${sessionId}`),
  myOrders: () => api.get('/marketplace/orders'),
  mySales: () => api.get('/marketplace/orders/sold'),
  updateOrderStatus: (orderId, status) => api.post(`/marketplace/orders/${orderId}/status`, { status }),
  // Admin moderation + settings
  adminListings: (params) => api.get('/marketplace/admin/listings', { params }),
  adminDeleteListing: (id) => api.delete(`/marketplace/admin/listings/${id}`),
  adminToggleListing: (id) => api.post(`/marketplace/admin/listings/${id}/toggle`),
  adminFeatureListing: (id) => api.post(`/marketplace/admin/listings/${id}/feature`),
  adminGetSettings: () => api.get('/marketplace/admin/settings'),
  adminSetSettings: (data) => api.put('/marketplace/admin/settings', data),
  // admin boost plans
  adminBoostPlans: () => api.get('/marketplace/admin/boost-plans'),
  adminCreateBoostPlan: (data) => api.post('/marketplace/admin/boost-plans', data),
  adminUpdateBoostPlan: (id, data) => api.put(`/marketplace/admin/boost-plans/${id}`, data),
  adminToggleBoostPlan: (id) => api.post(`/marketplace/admin/boost-plans/${id}/toggle`),
  adminDeleteBoostPlan: (id) => api.delete(`/marketplace/admin/boost-plans/${id}`),
};

// Favoris (Immobilier + Marketplace)
export const favoritesAPI = {
  toggle: (itemType, itemId) => api.post('/favorites/toggle', { item_type: itemType, item_id: itemId }),
  ids: (itemType) => api.get('/favorites/ids', { params: itemType ? { item_type: itemType } : {} }),
  list: (itemType) => api.get('/favorites', { params: itemType ? { item_type: itemType } : {} }),
};

// Services APIs
export const servicesAPI = {
  getCategories: () => api.get('/services/categories'),
  getOnDemandCategories: () => api.get('/services/ondemand-categories'),
  getProviders: (params) => api.get('/services/providers', { params }),
  getProvider: (id) => api.get(`/services/providers/${id}`),
  createBooking: (data) => api.post('/services/bookings', data),
  getBookings: (params) => api.get('/services/bookings', { params }),
  getBooking: (id) => api.get(`/services/bookings/${id}`),
  cancelBooking: (id) => api.post(`/services/bookings/${id}/cancel`),
  getNearby: (params) => api.get('/services/nearby', { params }),
};

// V3Cube Config APIs
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
};

// Trending services ("place de marché vivante") — zone-aware popular services.
export const serviceTrendsAPI = {
  track: (payload) => api.post('/service-trends/track', payload),
  trending: (zone, limit = 8) => api.get('/service-trends/trending', { params: { zone, limit } }),
  adminGetPinned: () => api.get('/service-trends/admin/pinned'),
  adminSetPinned: (items) => api.put('/service-trends/admin/pinned', { items }),
};

// Zones — admin-managed geographic zones + programmed (scheduled) shortcuts.
export const zonesAPI = {
  resolve: (params) => api.get('/zones/resolve', { params }),
  adminList: () => api.get('/zones/admin/list'),
  create: (data) => api.post('/zones/admin', data),
  update: (id, data) => api.put(`/zones/admin/${id}`, data),
  remove: (id) => api.delete(`/zones/admin/${id}`),
  getShortcuts: (id) => api.get(`/zones/admin/${id}/shortcuts`),
  setShortcuts: (id, entries) => api.put(`/zones/admin/${id}/shortcuts`, { entries }),
};

// Transports publics — réseau de transport en commun (données simulées).
export const transportAPI = {
  nearby: (params) => api.get('/transport/nearby', { params }),
  stopDepartures: (stopId, mins) => api.get(`/transport/stops/${stopId}/departures`, { params: mins != null ? { mins } : {} }),
  journey: (params) => api.get('/transport/journey', { params }),
  listJourneys: () => api.get('/transport/journeys'),
  saveJourney: (data) => api.post('/transport/journeys', data),
  deleteJourney: (jid) => api.delete(`/transport/journeys/${jid}`),
  // admin
  adminListStops: () => api.get('/transport/admin/stops'),
  createStop: (data) => api.post('/transport/admin/stops', data),
  updateStop: (id, data) => api.put(`/transport/admin/stops/${id}`, data),
  removeStop: (id) => api.delete(`/transport/admin/stops/${id}`),
  adminListLines: () => api.get('/transport/admin/lines'),
  createLine: (data) => api.post('/transport/admin/lines', data),
  updateLine: (id, data) => api.put(`/transport/admin/lines/${id}`, data),
  removeLine: (id) => api.delete(`/transport/admin/lines/${id}`),
  // GTFS (real data) status & manual refresh
  gtfsStatus: () => api.get('/transport/admin/gtfs/status'),
  gtfsRefresh: (force = false) => api.post(`/transport/admin/gtfs/refresh?force=${force}`),
  setGtfsRealtime: (realtime_urls) => api.put('/transport/admin/gtfs/realtime', { realtime_urls }),
  scanGtfsRealtime: () => api.post('/transport/admin/gtfs/realtime/scan'),
  ackGtfsAlerts: () => api.post('/transport/admin/gtfs/alerts/ack'),
  // Disruptions & strikes (perturbations / grèves)
  disruptions: () => api.get('/transport/disruptions'),
  disruptionsHistory: () => api.get('/transport/disruptions/history'),
  adminListDisruptions: () => api.get('/transport/admin/disruptions'),
  createDisruption: (data) => api.post('/transport/admin/disruptions', data),
  updateDisruption: (id, data) => api.put(`/transport/admin/disruptions/${id}`, data),
  removeDisruption: (id) => api.delete(`/transport/admin/disruptions/${id}`),
};

// Parcel delivery APIs (single & multi-drop)
export const parcelAPI = {
  estimate: (data) => api.post('/parcels/estimate', data),
  create: (data) => api.post('/parcels', data),
  list: () => api.get('/parcels'),
  get: (id) => api.get(`/parcels/${id}`),
  driverAvailable: () => api.get('/parcels/driver/available'),
  driverActive: () => api.get('/parcels/driver/active'),
  accept: (id) => api.post(`/parcels/${id}/accept`),
  updateStatus: (id, status) => api.post(`/parcels/${id}/status`, { status }),
  deliverLeg: (id, index) => api.post(`/parcels/${id}/legs/${index}/deliver`),
};

// Medical module APIs (prise de RDV + transport médical / ambulance)
export const chatAPI = {
  messages: (refType, refId, after) => api.get(`/chat/${refType}/${refId}/messages`, { params: after ? { after } : {} }),
  send: (refType, refId, text) => api.post(`/chat/${refType}/${refId}/messages`, { text }),
  unread: (refType, refId) => api.get(`/chat/${refType}/${refId}/unread`),
};

export const medicalAPI = {
  listDoctors: (specialty) => api.get('/medical/doctors', { params: specialty && specialty !== 'all' ? { specialty } : {} }),
  createAppointment: (data) => api.post('/medical/appointments', data),
  listAppointments: () => api.get('/medical/appointments'),
  ambulanceTypes: () => api.get('/medical/ambulance-types'),
  estimateTransport: (data) => api.post('/medical/transport/estimate', data),
  createTransport: (data) => api.post('/medical/transport', data),
  listTransport: () => api.get('/medical/transport'),
  transportGet: (id) => api.get(`/medical/transport/${id}`),
  transportDriverAvailable: () => api.get('/medical/transport/driver/available'),
  transportDriverActive: () => api.get('/medical/transport/driver/active'),
  acceptTransport: (id) => api.post(`/medical/transport/${id}/accept`),
  updateTransportStatus: (id, status) => api.post(`/medical/transport/${id}/status`, { status }),
};



// Coupon APIs
export const couponAPI = {
  validate: (code, amount, serviceType) => api.post('/coupons/validate', { code, amount, service_type: serviceType }),
  apply: (code, amount, rideId, orderId) => api.post('/coupons/apply', { code, amount, ride_id: rideId, order_id: orderId }),
  list: () => api.get('/coupons'),
  adminCreate: (data) => api.post('/coupons/admin/create', data),
  adminList: () => api.get('/coupons/admin/all'),
  adminToggle: (id) => api.put(`/coupons/admin/${id}/toggle`),
  adminDelete: (id) => api.delete(`/coupons/admin/${id}`),
  adminBulk: (action, ids) => api.post('/coupons/admin/bulk', { action, ids }),
};

// Simulation APIs
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

export const homeCategoriesAPI = {
  public: (section) => api.get('/home-categories', { params: section ? { section } : {} }),
  adminList: () => api.get('/home-categories/admin'),
  create: (data) => api.post('/home-categories/admin', data),
  update: (id, data) => api.put(`/home-categories/admin/${id}`, data),
  remove: (id) => api.delete(`/home-categories/admin/${id}`),
  reorder: (orderedIds) => api.post('/home-categories/admin/reorder', { ordered_ids: orderedIds }),
  adminSections: () => api.get('/home-categories/admin/sections'),
  reorderSections: (orderedKeys) => api.post('/home-categories/admin/sections/reorder', { ordered_keys: orderedKeys }),
  toggleSection: (key) => api.post(`/home-categories/admin/sections/${key}/toggle`),
  updateSection: (key, data) => api.put(`/home-categories/admin/sections/${key}`, data),
};

export const promoBannersAPI = {
  public: (location, surface) => api.get('/promo-banners', { params: { ...(location ? { location } : {}), ...(surface ? { surface } : {}) } }),
  preview: (zone) => api.get('/promo-banners', { params: {
    ...(zone?.country ? { country: zone.country } : {}),
    ...(zone?.state ? { state: zone.state } : {}),
    ...(zone?.city ? { city: zone.city } : {}),
  } }),
  adminList: () => api.get('/promo-banners/admin'),
  create: (data) => api.post('/promo-banners/admin', data),
  update: (id, data) => api.put(`/promo-banners/admin/${id}`, data),
  remove: (id) => api.delete(`/promo-banners/admin/${id}`),
  reorder: (orderedIds) => api.post('/promo-banners/admin/reorder', { ordered_ids: orderedIds }),
  impression: (id) => api.post(`/promo-banners/${id}/impression`),
  click: (id) => api.post(`/promo-banners/${id}/click`),
  billing: () => api.get('/promo-banners/admin/billing'),
};

export const newsAPI = {
  feed: (location) => api.get('/news/feed', { params: location ? { location } : {} }),
  unreadCount: (location) => api.get('/news/unread-count', { params: location ? { location } : {} }),
  markRead: () => api.post('/news/mark-read'),
  adminList: () => api.get('/news/admin'),
  adminPreview: (zone, audience) => api.get('/news/admin/preview', { params: {
    ...(zone?.country ? { country: zone.country } : {}),
    ...(zone?.state ? { state: zone.state } : {}),
    ...(zone?.city ? { city: zone.city } : {}),
    audience: audience || 'rider',
  } }),
  create: (data) => api.post('/news/admin', data),
  update: (id, data) => api.put(`/news/admin/${id}`, data),
  toggle: (id) => api.put(`/news/admin/${id}/toggle`),
  remove: (id) => api.delete(`/news/admin/${id}`),
};

export const realEstateAPI = {
  list: (params) => api.get('/real-estate/listings', { params }),
  get: (id) => api.get(`/real-estate/listings/${id}`),
  create: (data) => api.post('/real-estate/listings', data),
  update: (id, data) => api.put(`/real-estate/listings/${id}`, data),
  remove: (id) => api.delete(`/real-estate/listings/${id}`),
  setStatus: (id, status) => api.post(`/real-estate/listings/${id}/status`, { status }),
  myListings: () => api.get('/real-estate/my/listings'),
  myInquiries: () => api.get('/real-estate/my/inquiries'),
  myUnreadCount: () => api.get('/real-estate/my/unread-count'),
  createInquiry: (id, data) => api.post(`/real-estate/listings/${id}/inquiries`, data),
  listingInquiries: (id) => api.get(`/real-estate/listings/${id}/inquiries`),
  // boost (paiement portefeuille / SB PayGo)
  boostPlans: (country) => api.get('/real-estate/boost-plans', { params: country ? { country } : {} }),
  boostPaymentMethods: () => api.get('/real-estate/boost/payment-methods'),
  boostPay: (id, planId, paymentMethod) => api.post(`/real-estate/listings/${id}/boost/pay`, { plan_id: planId, payment_method: paymentMethod }),
  // admin
  adminList: (status) => api.get('/admin/real-estate/listings', { params: status ? { status } : {} }),
  adminToggleStatus: (id) => api.post(`/admin/real-estate/listings/${id}/toggle-status`),
  adminFeature: (id) => api.post(`/admin/real-estate/listings/${id}/feature`),
  adminRemove: (id) => api.delete(`/admin/real-estate/listings/${id}`),
  // admin boost plans
  adminBoostPlans: () => api.get('/admin/real-estate/boost-plans'),
  adminCreateBoostPlan: (data) => api.post('/admin/real-estate/boost-plans', data),
  adminUpdateBoostPlan: (id, data) => api.put(`/admin/real-estate/boost-plans/${id}`, data),
  adminToggleBoostPlan: (id) => api.post(`/admin/real-estate/boost-plans/${id}/toggle`),
  adminDeleteBoostPlan: (id) => api.delete(`/admin/real-estate/boost-plans/${id}`),
  // SB PayGo SSO recharge link
  sbpaygoSsoLink: () => api.post('/finance/sbpaygo/sso-link'),
};

export const pharmacyAPI = {
  // public / customer
  pharmacies: () => api.get('/pharmacy/pharmacies'),
  settings: () => api.get('/pharmacy/settings'),
  categories: () => api.get('/pharmacy/categories'),
  products: (params) => api.get('/pharmacy/products', { params }),
  estimate: (data) => api.post('/pharmacy/orders/estimate', data),
  paymentMethods: () => api.get('/pharmacy/payment-methods'),
  sbpaygoSsoLink: () => api.post('/finance/sbpaygo/sso-link'),
  createOrder: (data) => api.post('/pharmacy/orders', data),
  myOrders: () => api.get('/pharmacy/orders'),
  getOrder: (id) => api.get(`/pharmacy/orders/${id}`),
  cancelOrder: (id) => api.post(`/pharmacy/orders/${id}/cancel`),
  payOrder: (id, paymentMethod) => api.post(`/pharmacy/orders/${id}/pay`, { payment_method: paymentMethod }),
  // driver
  driverAvailable: () => api.get('/pharmacy/driver/available'),
  driverActive: () => api.get('/pharmacy/driver/active'),
  accept: (id) => api.post(`/pharmacy/orders/${id}/accept`),
  updateStatus: (id, status) => api.post(`/pharmacy/orders/${id}/status`, { status }),
  // admin
  adminPharmacies: () => api.get('/admin/pharmacy/pharmacies'),
  adminCreatePharmacy: (data) => api.post('/admin/pharmacy/pharmacies', data),
  adminUpdatePharmacy: (id, data) => api.put(`/admin/pharmacy/pharmacies/${id}`, data),
  adminDeletePharmacy: (id) => api.delete(`/admin/pharmacy/pharmacies/${id}`),
  adminProducts: (category) => api.get('/admin/pharmacy/products', { params: category ? { category } : {} }),
  adminCreateProduct: (data) => api.post('/admin/pharmacy/products', data),
  adminUpdateProduct: (id, data) => api.put(`/admin/pharmacy/products/${id}`, data),
  adminDeleteProduct: (id) => api.delete(`/admin/pharmacy/products/${id}`),
  adminOrders: (status) => api.get('/admin/pharmacy/orders', { params: status ? { status } : {} }),
  adminGetOrder: (id) => api.get(`/admin/pharmacy/orders/${id}`),
  adminQuote: (id, medicationTotal) => api.post(`/admin/pharmacy/orders/${id}/quote`, { medication_total: medicationTotal }),
  adminOrderStatus: (id, status) => api.post(`/admin/pharmacy/orders/${id}/status`, { status }),
  // admin settings & categories
  adminSettings: () => api.get('/admin/pharmacy/settings'),
  adminUpdateSettings: (data) => api.put('/admin/pharmacy/settings', data),
  adminCategories: () => api.get('/admin/pharmacy/categories'),
  adminCreateCategory: (data) => api.post('/admin/pharmacy/categories', data),
  adminUpdateCategory: (key, data) => api.put(`/admin/pharmacy/categories/${key}`, data),
  adminDeleteCategory: (key) => api.delete(`/admin/pharmacy/categories/${key}`),
};

export const serviceSettingsAPI = {
  publicSettings: (key) => api.get(`/services/${key}/settings`),
  adminList: () => api.get('/admin/services/settings'),
  adminGet: (key) => api.get(`/admin/services/settings/${key}`),
  adminUpdate: (key, data) => api.put(`/admin/services/settings/${key}`, data),
};

export const placesAPI = {
  getSaved: () => api.get('/places/saved'),
  setSaved: (kind, place) => api.put(`/places/saved/${kind}`, place),
  deleteSaved: (kind) => api.delete(`/places/saved/${kind}`),
  addRecent: (place) => api.post('/places/recent', place),
};

export const fraudAPI = {
  summary: () => api.get('/fraud/summary'),
  alerts: (params) => api.get('/fraud/alerts', { params }),
  resolveAlert: (id, note) => api.post(`/fraud/alerts/${id}/resolve`, { note }),
  walletRisk: () => api.get('/fraud/wallet-risk'),
  declareChargeback: (payload) => api.post('/fraud/chargeback', payload),
  blockUser: (userId, reason) => api.post(`/fraud/users/${userId}/block`, { reason }),
  unblockUser: (userId) => api.post(`/fraud/users/${userId}/unblock`, {}),
};


export const geoAPI = {
  ipLocate: () => api.get('/geo/ip-locate'),
  getCountries: () => api.get('/geo/countries'),
  getStates: (country) => api.get('/geo/states', { params: { country } }),
  getCities: (country, state) => api.get('/geo/cities', { params: { country, state } }),
};

export const debtsAPI = {
  me: () => api.get('/debts/me'),
  pay: () => api.post('/debts/pay'),
};

export const simulationAPI = {
  start: () => api.post('/simulation/start'),
  stop: () => api.post('/simulation/stop'),
  status: () => api.get('/simulation/status'),
};

export const kycAPI = {
  me: () => api.get('/kyc/me'),
  submit: (data) => api.post('/kyc/submit', data),
  adminList: (status = '') => api.get('/kyc/admin/list', { params: status ? { status } : {} }),
  adminApprove: (id) => api.post(`/kyc/admin/${id}/approve`),
  adminReject: (id, reason) => api.post(`/kyc/admin/${id}/reject`, { reason }),
};

export const studentAPI = {
  me: () => api.get('/student/me'),
  config: () => api.get('/student/config'),
  checkDomain: (email) => api.get('/student/domains/check', { params: { email } }),
  requestEmailOtp: (email) => api.post('/student/verify/email/request', { email }),
  confirmEmailOtp: (email, code) => api.post('/student/verify/email/confirm', { email, code }),
  uploadDocument: (file, docType = 'student_card') => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/student/documents?doc_type=${encodeURIComponent(docType)}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  quote: (amount, kind = 'ride') => api.get('/student/discount/quote', { params: { amount, kind } }),
  // admin
  adminGetConfig: () => api.get('/student/admin/config'),
  adminUpdateConfig: (data) => api.put('/student/admin/config', data),
  adminDomains: () => api.get('/student/admin/domains'),
  adminCreateDomain: (data) => api.post('/student/admin/domains', data),
  adminUpdateDomain: (id, data) => api.put(`/student/admin/domains/${id}`, data),
  adminDeleteDomain: (id) => api.delete(`/student/admin/domains/${id}`),
  adminList: (status = '') => api.get('/student/admin/list', { params: status ? { status } : {} }),
  adminApprove: (userId) => api.post(`/student/admin/${userId}/approve`),
  adminReject: (userId, reason) => api.post(`/student/admin/${userId}/reject`, { reason }),
  adminStats: () => api.get('/student/admin/stats'),
  // Pass Campus
  campusPlans: () => api.get('/student/campus/plans'),
  campusSubscription: () => api.get('/student/campus/subscription'),
  campusSubscribe: (planId) => api.post('/student/campus/subscribe', { plan_id: planId }),
  campusCancel: () => api.post('/student/campus/subscription/cancel'),
  campusAdminPlans: () => api.get('/student/campus/admin/plans'),
  campusAdminCreatePlan: (data) => api.post('/student/campus/admin/plans', data),
  campusAdminUpdatePlan: (id, data) => api.put(`/student/campus/admin/plans/${id}`, data),
  campusAdminDeletePlan: (id) => api.delete(`/student/campus/admin/plans/${id}`),
  // Recurring bookings
  recurringList: () => api.get('/student/campus/recurring'),
  recurringCreate: (data) => api.post('/student/campus/recurring', data),
  recurringUpdate: (id, data) => api.put(`/student/campus/recurring/${id}`, data),
  recurringDelete: (id) => api.delete(`/student/campus/recurring/${id}`),
  recurringBookNext: (id) => api.get(`/student/campus/recurring/${id}/book-next`),
  // Campus zones + Campus Share
  campusZones: (lat, lng) => api.get('/student/zones/campus', { params: (lat != null && lng != null) ? { lat, lng } : {} }),
  zonesAdminList: () => api.get('/student/admin/campus-zones'),
  zonesAdminCreate: (data) => api.post('/student/admin/campus-zones', data),
  zonesAdminUpdate: (id, data) => api.put(`/student/admin/campus-zones/${id}`, data),
  zonesAdminDelete: (id) => api.delete(`/student/admin/campus-zones/${id}`),
  shareRequest: (data) => api.post('/student/campus-share/request', data),
  shareMatches: () => api.get('/student/campus-share/matches'),
  shareCancel: () => api.delete('/student/campus-share/request'),
  // Phase 4 — Safety + Safe Ride Night
  safetySettings: () => api.get('/student/safety/settings'),
  safetyUpdate: (data) => api.put('/student/safety/settings', data),
  safeRideStart: (rideId) => api.post('/student/safety/safe-ride/start', { ride_id: rideId }),
  safeRideActive: () => api.get('/student/safety/safe-ride/active'),
  recommendedDrivers: (lat, lng) => api.get('/student/safety/recommended-drivers', { params: { lat, lng } }),
  driverTrust: (driverId) => api.get(`/student/safety/driver/${driverId}/trust`),
  listContacts: () => api.get('/phase1/emergency-contacts'),
  addContact: (data) => api.post('/phase1/emergency-contacts', data),
  removeContact: (id) => api.delete(`/phase1/emergency-contacts/${id}`),
  // Phase 5 — Rewards
  rewardsMe: () => api.get('/student/rewards/me'),
  rewardsCatalog: () => api.get('/student/rewards/catalog'),
  rewardsRedeem: (rewardId) => api.post('/student/rewards/redeem', { reward_id: rewardId }),
  rewardsAdminConfig: () => api.get('/student/rewards/admin/config'),
  rewardsAdminUpdateConfig: (data) => api.put('/student/rewards/admin/config', data),
  rewardsAdminCatalog: () => api.get('/student/rewards/admin/catalog'),
  rewardsAdminCreate: (data) => api.post('/student/rewards/admin/catalog', data),
  rewardsAdminUpdate: (id, data) => api.put(`/student/rewards/admin/catalog/${id}`, data),
  rewardsAdminDelete: (id) => api.delete(`/student/rewards/admin/catalog/${id}`),
  // Phase 5 — Events
  eventsList: () => api.get('/student/events'),
  eventsMyReservations: () => api.get('/student/events/my-reservations'),
  eventReserve: (data) => api.post('/student/events/reserve', data),
  eventCancelReservation: (id) => api.delete(`/student/events/reserve/${id}`),
  eventsAdminList: () => api.get('/student/events/admin/list'),
  eventAdminCreate: (data) => api.post('/student/events/admin', data),
  eventAdminUpdate: (id, data) => api.put(`/student/events/admin/${id}`, data),
  eventAdminDelete: (id) => api.delete(`/student/events/admin/${id}`),
  // Phase 6 — Marketplace étudiante + IA
  mktCategories: () => api.get('/student/marketplace/categories'),
  mktListings: (params = {}) => api.get('/student/marketplace/listings', { params }),
  mktListing: (id) => api.get(`/student/marketplace/listings/${id}`),
  mktMyListings: () => api.get('/student/marketplace/my-listings'),
  mktCreate: (data) => api.post('/student/marketplace/listings', data),
  mktDelete: (id) => api.delete(`/student/marketplace/listings/${id}`),
  mktBuy: (id) => api.post(`/student/marketplace/listings/${id}/buy`),
  mktOrders: () => api.get('/student/marketplace/orders'),
  mktSales: () => api.get('/student/marketplace/sales'),
  mktAiSuggest: (data) => api.post('/student/marketplace/ai/suggest', data),
  mktAiSearch: (query) => api.post('/student/marketplace/ai/search', { query }),
  mktBoostPlans: () => api.get('/student/marketplace/boost/plans'),
  mktBoost: (id, planId, method) => api.post(`/student/marketplace/listings/${id}/boost`, { plan_id: planId, method }),
  mktAdminBoostConfig: () => api.get('/student/marketplace/admin/boost/config'),
  mktAdminUpdateBoostConfig: (data) => api.put('/student/marketplace/admin/boost/config', data),
  mktAdminBoostRevenue: () => api.get('/student/marketplace/admin/boost/revenue'),
  mktAlerts: () => api.get('/student/marketplace/alerts/me'),
  mktUpdateAlerts: (data) => api.put('/student/marketplace/alerts/me', data),
  mktDigestConfig: () => api.get('/student/marketplace/admin/digest/config'),
  mktUpdateDigestConfig: (data) => api.put('/student/marketplace/admin/digest/config', data),
  mktDigestSendNow: (testUserId) => api.post('/student/marketplace/admin/digest/send-now', testUserId ? { test_user_id: testUserId } : {}),
  mktDigestHistory: () => api.get('/student/marketplace/admin/digest/history'),
  mktReview: (orderId, data) => api.post(`/student/marketplace/orders/${orderId}/review`, data),
  mktGetReview: (orderId) => api.get(`/student/marketplace/orders/${orderId}/review`),
  mktSeller: (sellerId) => api.get(`/student/marketplace/sellers/${sellerId}`),
  mktAdminSellerConfig: () => api.get('/student/marketplace/admin/seller-config'),
  mktUpdateSellerConfig: (data) => api.put('/student/marketplace/admin/seller-config', data),
  mktContact: (listingId, text) => api.post(`/student/marketplace/listings/${listingId}/contact`, { text }),
  mktConversations: () => api.get('/student/marketplace/conversations'),
  mktConversationsUnread: () => api.get('/student/marketplace/conversations/unread-total'),
  mktMessages: (cid, after) => api.get(`/student/marketplace/conversations/${cid}/messages`, { params: after ? { after } : {} }),
  mktSendMessage: (cid, text) => api.post(`/student/marketplace/conversations/${cid}/messages`, { text }),
  mktSellerSettings: () => api.get('/student/marketplace/seller-settings'),
  mktUpdateSellerSettings: (data) => api.put('/student/marketplace/seller-settings', data),
  mktChatSuggestions: (payload) => api.post('/student/marketplace/chat-suggestions', payload),
  mktMakeOffer: (cid, amount) => api.post(`/student/marketplace/conversations/${cid}/offer`, { amount }),
  mktRespondOffer: (msgId, action) => api.post(`/student/marketplace/offers/${msgId}/respond`, { action }),
  mktPayOffer: (msgId) => api.post(`/student/marketplace/offers/${msgId}/pay`),
  mktUploadImage: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

// ── SB Drive Access (transport adapté PMR / handicap) ──
export const accessAPI = {
  needsCatalog: () => api.get('/access/needs-catalog'),
  getConfig: (location = '') => api.get('/access/config', { params: location ? { location } : {} }),
  getProfile: () => api.get('/access/profile'),
  updateProfile: (data) => api.put('/access/profile', data),
  match: (data) => api.post('/access/match', data),
  createBooking: (data) => api.post('/access/bookings', data),
  myBookings: () => api.get('/access/bookings'),
  // SOS / Sécurité
  triggerSos: (data) => api.post('/access/sos', data),
  sosLocation: (id, data) => api.post(`/access/sos/${id}/location`, data),
  sosResolve: (id) => api.post(`/access/sos/${id}/resolve`, {}),
  sosActive: () => api.get('/access/sos/active'),
  // SB Access Plus (abonnement)
  plusPlans: () => api.get('/access/plus/plans'),
  plusSubscription: () => api.get('/access/plus/subscription'),
  plusSubscribe: (planId) => api.post('/access/plus/subscribe', { plan_id: planId }),
  plusCancel: () => api.post('/access/plus/cancel', {}),
  listContacts: () => api.get('/phase1/emergency-contacts'),
  addContact: (data) => api.post('/phase1/emergency-contacts', data),
  removeContact: (id) => api.delete(`/phase1/emergency-contacts/${id}`),
  listRecurring: () => api.get('/access/recurring'),
  createRecurring: (data) => api.post('/access/recurring', data),
  updateRecurring: (id, data) => api.put(`/access/recurring/${id}`, data),
  deleteRecurring: (id) => api.delete(`/access/recurring/${id}`),
  skipRecurring: (id, data) => api.post(`/access/recurring/${id}/skip`, data || {}),
  // admin
  adminCategories: () => api.get('/access/admin/categories'),
  adminCreateCategory: (data) => api.post('/access/admin/categories', data),
  adminUpdateCategory: (id, data) => api.put(`/access/admin/categories/${id}`, data),
  adminDeleteCategory: (id) => api.delete(`/access/admin/categories/${id}`),
  adminGetSettings: () => api.get('/access/admin/settings'),
  adminUpdateSettings: (data) => api.put('/access/admin/settings', data),
  adminDrivers: () => api.get('/access/admin/drivers'),
  adminCertifyDriver: (id, data) => api.post(`/access/admin/drivers/${id}/certify`, data),
  adminUpdateDriverProfile: (id, data) => api.put(`/access/admin/drivers/${id}/profile`, data),
  uploadImage: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  adminBookings: () => api.get('/access/admin/bookings'),
  adminSos: () => api.get('/access/admin/sos'),
  adminResolveSos: (id, data) => api.post(`/access/admin/sos/${id}/resolve`, data || {}),
  adminPlusPlans: () => api.get('/access/admin/plus/plans'),
  adminPlusCreatePlan: (data) => api.post('/access/admin/plus/plans', data),
  adminPlusUpdatePlan: (id, data) => api.put(`/access/admin/plus/plans/${id}`, data),
  adminPlusDeletePlan: (id) => api.delete(`/access/admin/plus/plans/${id}`),
  adminPlusRevenue: () => api.get('/access/admin/plus/revenue'),
  adminStats: () => api.get('/access/admin/stats'),
  adminDemandForecast: () => api.get('/access/admin/ai/demand-forecast'),
  adminAllocationPreview: (data) => api.post('/access/admin/ai/allocation-preview', data),
};

// SB Drive — Location moto self-drive (libre-service)
export const motoRentalAPI = {
  fleet: () => api.get('/moto-rental/fleet'),
  motoDetail: (id) => api.get(`/moto-rental/fleet/${id}`),
  quote: (data) => api.post('/moto-rental/quote', data),
  book: (data) => api.post('/moto-rental/book', data),
  myRentals: () => api.get('/moto-rental/my'),
  cancel: (id) => api.post(`/moto-rental/${id}/cancel`, {}),
  pickupPhotos: (id, photos) => api.post(`/moto-rental/${id}/pickup-photos`, { photos }),
  depositCheckout: (id, data) => api.post(`/moto-rental/${id}/deposit-checkout`, data),
  depositStatus: (sessionId) => api.get(`/moto-rental/deposit-status/${sessionId}`),
  uploadImage: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  adminFleet: () => api.get('/moto-rental/admin/fleet'),
  adminCreateMoto: (data) => api.post('/moto-rental/admin/fleet', data),
  adminUpdateMoto: (id, data) => api.put(`/moto-rental/admin/fleet/${id}`, data),
  adminDeleteMoto: (id) => api.delete(`/moto-rental/admin/fleet/${id}`),
  adminRentals: () => api.get('/moto-rental/admin/rentals'),
  adminReviewLicense: (id, data) => api.post(`/moto-rental/admin/rentals/${id}/license`, data),
  adminReturn: (id, data) => api.post(`/moto-rental/admin/rentals/${id}/return`, data),
  adminUploadImage: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

export const carRentalAPI = {
  fleet: () => api.get('/car-rental/fleet'),
  carDetail: (id) => api.get(`/car-rental/fleet/${id}`),
  quote: (data) => api.post('/car-rental/quote', data),
  book: (data) => api.post('/car-rental/book', data),
  myRentals: () => api.get('/car-rental/my'),
  cancel: (id) => api.post(`/car-rental/${id}/cancel`, {}),
  pickupPhotos: (id, photos) => api.post(`/car-rental/${id}/pickup-photos`, { photos }),
  depositCheckout: (id, data) => api.post(`/car-rental/${id}/deposit-checkout`, data),
  depositStatus: (sessionId) => api.get(`/car-rental/deposit-status/${sessionId}`),
  uploadImage: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  adminFleet: () => api.get('/car-rental/admin/fleet'),
  adminCreateCar: (data) => api.post('/car-rental/admin/fleet', data),
  adminUpdateCar: (id, data) => api.put(`/car-rental/admin/fleet/${id}`, data),
  adminDeleteCar: (id) => api.delete(`/car-rental/admin/fleet/${id}`),
  adminRentals: () => api.get('/car-rental/admin/rentals'),
  adminReviewLicense: (id, data) => api.post(`/car-rental/admin/rentals/${id}/license`, data),
  adminReturn: (id, data) => api.post(`/car-rental/admin/rentals/${id}/return`, data),
  adminUploadImage: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

export const hotelsAPI = {
  cities: () => api.get('/hotels/cities'),
  list: (params) => api.get('/hotels', { params }),
  detail: (id, params) => api.get(`/hotels/${id}`, { params }),
  quote: (data) => api.post('/hotels/quote', data),
  book: (data) => api.post('/hotels/book', data),
  myBookings: () => api.get('/hotels/bookings/my'),
  cancel: (id) => api.post(`/hotels/bookings/${id}/cancel`, {}),
  // admin
  adminHotels: () => api.get('/hotels/admin/hotels'),
  adminCreateHotel: (data) => api.post('/hotels/admin/hotels', data),
  adminUpdateHotel: (id, data) => api.put(`/hotels/admin/hotels/${id}`, data),
  adminDeleteHotel: (id) => api.delete(`/hotels/admin/hotels/${id}`),
  adminRooms: (hotelId) => api.get(`/hotels/admin/hotels/${hotelId}/rooms`),
  adminCreateRoom: (hotelId, data) => api.post(`/hotels/admin/hotels/${hotelId}/rooms`, data),
  adminUpdateRoom: (id, data) => api.put(`/hotels/admin/rooms/${id}`, data),
  adminDeleteRoom: (id) => api.delete(`/hotels/admin/rooms/${id}`),
  adminBookings: () => api.get('/hotels/admin/bookings'),
  uploadImage: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

export const carpoolAPI = {
  config: () => api.get('/carpool/config'),
  search: (params) => api.get('/carpool/rides', { params }),
  create: (data) => api.post('/carpool/rides', data),
  book: (id, seats) => api.post(`/carpool/rides/${id}/book`, { seats }),
  cancelBooking: (id) => api.post(`/carpool/rides/${id}/cancel`, {}),
  complete: (id) => api.post(`/carpool/rides/${id}/complete`, {}),
  cancelRide: (id) => api.post(`/carpool/rides/${id}/cancel-ride`, {}),
  rate: (id, data) => api.post(`/carpool/rides/${id}/rate`, data),
  driverReviews: (driverId) => api.get(`/carpool/drivers/${driverId}/reviews`),
  adminGetConfig: () => api.get('/carpool/admin/config'),
  adminSetConfig: (data) => api.put('/carpool/admin/config', data),
  adminRevenue: (params) => api.get('/carpool/admin/revenue', { params }),
  myRides: () => api.get('/carpool/my-rides'),
  listRequests: (params) => api.get('/carpool/requests', { params }),
  createRequest: (data) => api.post('/carpool/requests', data),
  myRequests: () => api.get('/carpool/my-requests'),
  cancelRequest: (id) => api.post(`/carpool/requests/${id}/cancel`, {}),
};


export const flightsAPI = {
  airports: () => api.get('/flights/airports'),
  search: (params) => api.get('/flights', { params }),
  detail: (id) => api.get(`/flights/${id}`),
  book: (data) => api.post('/flights/book', data),
  myBookings: () => api.get('/flights/bookings/my'),
  cancel: (id) => api.post(`/flights/bookings/${id}/cancel`, {}),
  // vols en direct (Duffel — temps réel)
  liveSearch: (params) => api.get('/flights/live/search', { params }),
  liveBook: (data) => api.post('/flights/live/book', data),
  liveHold: (data) => api.post('/flights/live/hold', data),
  payHeld: (id) => api.post(`/flights/live/bookings/${id}/pay`, {}),
  eticket: (id) => api.get(`/flights/bookings/${id}/eticket`, { responseType: 'blob' }),
  // admin
  adminFlights: () => api.get('/flights/admin/flights'),
  adminCreateFlight: (data) => api.post('/flights/admin/flights', data),
  adminUpdateFlight: (id, data) => api.put(`/flights/admin/flights/${id}`, data),
  adminDeleteFlight: (id) => api.delete(`/flights/admin/flights/${id}`),
  adminBookings: () => api.get('/flights/admin/bookings'),
};

export const travelPackagesAPI = {
  list: () => api.get('/travel-packages'),
  detail: (id) => api.get(`/travel-packages/${id}`),
  quote: (id, data) => api.post(`/travel-packages/${id}/quote`, data),
  book: (id, data) => api.post(`/travel-packages/${id}/book`, data),
  myBookings: () => api.get('/travel-packages/bookings/my'),
  cancel: (id) => api.post(`/travel-packages/bookings/${id}/cancel`, {}),
  // admin
  adminOptions: () => api.get('/travel-packages/admin/options'),
  adminPackages: () => api.get('/travel-packages/admin/packages'),
  adminCreatePackage: (data) => api.post('/travel-packages/admin/packages', data),
  adminUpdatePackage: (id, data) => api.put(`/travel-packages/admin/packages/${id}`, data),
  adminDeletePackage: (id) => api.delete(`/travel-packages/admin/packages/${id}`),
  adminBookings: () => api.get('/travel-packages/admin/bookings'),
};


export default api;
