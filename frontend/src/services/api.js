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
  getProfile: () => api.get('/drivers/profile'),
  toggleOnline: () => api.post('/drivers/toggle-online'),
  updateLocation: (lat, lng) => api.post('/drivers/location', { lat, lng }),
  getEarnings: () => api.get('/drivers/earnings'),
  getRideHistory: () => api.get('/drivers/ride-history'),
  uploadDocument: (file, docType) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/drivers/documents?doc_type=${docType}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Merchant APIs
export const merchantAPI = {
  register: (data) => api.post('/merchants/register', data),
  list: (params) => api.get('/merchants', { params }),
  get: (id) => api.get(`/merchants/${id}`),
  getProducts: (id) => api.get(`/merchants/${id}/products`),
  addProduct: (data) => api.post('/merchants/products', data),
  updateProduct: (id, data) => api.put(`/merchants/products/${id}`, data),
  deleteProduct: (id) => api.delete(`/merchants/products/${id}`),
};

// Ride APIs
export const rideAPI = {
  estimate: (data) => api.post('/rides/estimate', data),
  create: (data) => api.post('/rides', data),
  get: (id) => api.get(`/rides/${id}`),
  accept: (id) => api.post(`/rides/${id}/accept`),
  updateStatus: (id, status) => api.post(`/rides/${id}/status`, { status }),
  cancel: (id, reason) => api.post(`/rides/${id}/cancel`, { reason }),
  list: (params) => api.get('/rides', { params }),
  rate: (id, data) => api.post(`/rides/${id}/rate`, data),
  getActive: () => api.get('/rides/active/current'),
  getAvailable: () => api.get('/rides/pending/available'),
};

// Order APIs
export const orderAPI = {
  create: (data) => api.post('/orders', data),
  get: (id) => api.get(`/orders/${id}`),
  updateStatus: (id, status) => api.post(`/orders/${id}/status`, { status }),
  assignDriver: (id, driverId) => api.post(`/orders/${id}/assign-driver`, { driver_id: driverId }),
  list: (params) => api.get('/orders', { params }),
  rate: (id, data) => api.post(`/orders/${id}/rate`, data),
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
  listRides: (params) => api.get('/admin/rides', { params }),
  listOrders: (params) => api.get('/admin/orders', { params }),
  suspendUser: (id) => api.post(`/admin/users/${id}/suspend`),
  unsuspendUser: (id) => api.post(`/admin/users/${id}/unsuspend`),
  revenue: () => api.get('/admin/revenue'),
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (settings) => api.put('/admin/settings', { settings }),
  listTickets: () => api.get('/support/tickets'),
  replyTicket: (id, message) => api.post(`/support/tickets/${id}/reply`, { message }),
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
  deleteListing: (id) => api.delete(`/marketplace/listings/${id}`),
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
};

// Coupon APIs
export const couponAPI = {
  validate: (code, amount, serviceType) => api.post('/coupons/validate', { code, amount, service_type: serviceType }),
  apply: (code, amount, rideId, orderId) => api.post('/coupons/apply', { code, amount, ride_id: rideId, order_id: orderId }),
  list: () => api.get('/coupons'),
  adminCreate: (data) => api.post('/coupons/admin/create', data),
  adminList: () => api.get('/coupons/admin/all'),
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
};

export const placesAPI = {
  getSaved: () => api.get('/places/saved'),
  setSaved: (kind, place) => api.put(`/places/saved/${kind}`, place),
  deleteSaved: (kind) => api.delete(`/places/saved/${kind}`),
  addRecent: (place) => api.post('/places/recent', place),
};

export const simulationAPI = {
  start: () => api.post('/simulation/start'),
  stop: () => api.post('/simulation/stop'),
  status: () => api.get('/simulation/status'),
};

export default api;
