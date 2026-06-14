import { api } from './client';

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  refresh: () => api.post('/auth/refresh'),
  changePassword: (data) => api.post('/auth/change-password', data),
  googleSession: (sessionId) => api.post('/auth/google/session', { session_id: sessionId }),
  firebaseStatus: () => api.get('/auth/firebase/status'),
  firebaseVerifyPhone: (idToken) => api.post('/auth/firebase/verify-phone', { id_token: idToken }),
  firebaseLogin: (data) => api.post('/auth/firebase/login', data),
};

// Masked in-app calling (WebRTC) + Twilio relay fallback (anti-fraud, Bolt-like)
// Admin — gestion des places de parking (CRUD)

export const callsAPI = {
  initiate: (rideId) => api.post(`/calls/ride/${rideId}/initiate`),
  markFailed: (rideId, callId) => api.post(`/calls/ride/${rideId}/failed`, { call_id: callId }),
  markConnected: (rideId) => api.post(`/calls/ride/${rideId}/connected`),
  relay: (rideId) => api.post(`/calls/ride/${rideId}/relay`),
  status: (rideId) => api.get(`/calls/ride/${rideId}/status`),
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

export const fraudAPI = {
  summary: () => api.get('/fraud/summary'),
  alerts: (params) => api.get('/fraud/alerts', { params }),
  resolveAlert: (id, note) => api.post(`/fraud/alerts/${id}/resolve`, { note }),
  walletRisk: () => api.get('/fraud/wallet-risk'),
  declareChargeback: (payload) => api.post('/fraud/chargeback', payload),
  blockUser: (userId, reason) => api.post(`/fraud/users/${userId}/block`, { reason }),
  unblockUser: (userId) => api.post(`/fraud/users/${userId}/unblock`, {}),
};

export const debtsAPI = {
  me: () => api.get('/debts/me'),
  pay: () => api.post('/debts/pay'),
};

export const kycAPI = {
  me: () => api.get('/kyc/me'),
  submit: (data) => api.post('/kyc/submit', data),
  adminList: (status = '') => api.get('/kyc/admin/list', { params: status ? { status } : {} }),
  adminApprove: (id) => api.post(`/kyc/admin/${id}/approve`),
  adminReject: (id, reason) => api.post(`/kyc/admin/${id}/reject`, { reason }),
};
