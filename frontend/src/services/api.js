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
  getProducts: (id) => api.get(`/merchants/${id}/products`),
  addProduct: (data) => api.post('/merchants/products', data),
  updateProduct: (id, data) => api.put(`/merchants/products/${id}`, data),
  deleteProduct: (id) => api.delete(`/merchants/products/${id}`),
};

// Ride APIs
export const rideAPI = {
  estimate: (data) => api.post('/rides/estimate', data),
  demandZones: (lat, lng) => api.get('/phase2/demand-zones', { params: { lat, lng } }),
  nearbyDrivers: (lat, lng) => api.get('/rides/nearby/drivers', { params: { lat, lng } }),
  getBestAutoPromo: (amount, service = 'ride', pickup = '') => api.get('/auto-promotions/best', { params: { amount, service, pickup } }),
  validateVoucher: (code, amount, pickup_address = '') => api.post('/vouchers/validate', { code, amount, pickup_address }),
  create: (data) => api.post('/rides', data),
  get: (id) => api.get(`/rides/${id}`),
  accept: (id) => api.post(`/rides/${id}/accept`),
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
};

// Order APIs
export const orderAPI = {
  create: (data) => api.post('/orders', data),
  get: (id) => api.get(`/orders/${id}`),
  updateStatus: (id, status) => api.post(`/orders/${id}/status`, { status }),
  assignDriver: (id, driverId) => api.post(`/orders/${id}/assign-driver`, { driver_id: driverId }),
  list: (params) => api.get('/orders', { params }),
  rate: (id, data) => api.post(`/orders/${id}/rate`, data),
  // Food delivery — driver jobs + live tracking
  availableDeliveries: () => api.get('/orders/available-deliveries'),
  driverActiveOrders: () => api.get('/orders/driver/active'),
  claim: (id) => api.post(`/orders/${id}/claim`),
  track: (id) => api.get(`/orders/${id}/track`),
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
  approveDriver: (id) => api.post(`/admin/drivers/${id}/approve`),
  rejectDriver: (id, reason) => api.post(`/admin/drivers/${id}/reject`, { reason }),
  getDriverDocuments: (driverId) => api.get(`/admin/drivers/${driverId}/documents`),
  setDriverDocumentStatus: (driverId, docType, status, reason) => api.put(`/admin/drivers/${driverId}/documents/${docType}/status`, { status, reason }),
  setDriverInfoChangeStatus: (driverId, status, reason) => api.put(`/admin/drivers/${driverId}/info-change/status`, { status, reason }),
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
  listRides: (params) => api.get('/admin/rides', { params }),
  listOrders: (params) => api.get('/admin/orders', { params }),
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
};

// Carpool APIs
export const carpoolAPI = {
  createRide: (data) => api.post('/carpool/rides', data),
  searchRides: (params) => api.get('/carpool/rides', { params }),
  bookSeat: (rideId) => api.post(`/carpool/rides/${rideId}/book`),
  myRides: () => api.get('/carpool/my-rides'),
};

// Services APIs
export const servicesAPI = {
  getCategories: () => api.get('/services/categories'),
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
  getRideProfiles: () => api.get('/config/ride-profiles'),
  getBusinessTripReasons: () => api.get('/config/business-trip-reasons'),
  getTaxiBooking: () => api.get('/config/taxi-booking'),
  getPaymentMethods: () => api.get('/config/payment-methods'),
  getAppSettings: (params) => api.get('/config/app-settings', { params }),
  getGeneralSettings: () => api.get('/config/general-settings'),
};

// Trending services ("place de marché vivante") — zone-aware popular services.
export const serviceTrendsAPI = {
  track: (payload) => api.post('/service-trends/track', payload),
  trending: (zone, limit = 8) => api.get('/service-trends/trending', { params: { zone, limit } }),
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
};

export const promoBannersAPI = {
  public: (location) => api.get('/promo-banners', { params: location ? { location } : {} }),
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

export default api;
