import api from './client';

// Mirror du web frontend/src/services/api.js, adapté Bearer tokens.

export const authAPI = {
  login: (data: { email?: string; phone?: string; password: string }) =>
    api.post('/auth/login', data),
  register: (data: any) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  refresh: () => api.post('/auth/refresh'),
  googleSession: (sessionId: string) =>
    api.post('/auth/google/session', { session_id: sessionId }),
  requestOtp: (phone: string) => api.post('/auth/otp/request', { phone }),
  verifyOtp: (phone: string, otp: string) =>
    api.post('/auth/otp/verify', { phone, otp }),
};

export const userAPI = {
  getAddresses: () => api.get('/users/addresses'),
  addAddress: (data: any) => api.post('/users/addresses', data),
  deleteAddress: (id: string) => api.delete(`/users/addresses/${id}`),
  registerPushToken: (token: string) => api.post('/users/push-token', { token }),
};

export const driverAPI = {
  register: (data: any) => api.post('/drivers/register', data),
  getProfile: () => api.get('/drivers/profile'),
  toggleOnline: () => api.post('/drivers/toggle-online'),
  updateLocation: (lat: number, lng: number) =>
    api.post('/drivers/location', { lat, lng }),
  getEarnings: () => api.get('/drivers/earnings'),
  getRideHistory: () => api.get('/drivers/ride-history'),
  myActivity: () => api.get('/drivers/my-activity'),
  getWeeklyReport: () => api.get('/driver/weekly-reports/current'),
  getWeeklyReportHistory: () => api.get('/driver/weekly-reports/history'),
};

export const merchantAPI = {
  register: (data: any) => api.post('/merchants/register', data),
  list: (params?: any) => api.get('/merchants', { params }),
  get: (id: string) => api.get(`/merchants/${id}`),
  getProducts: (id: string) => api.get(`/merchants/${id}/products`),
  addProduct: (data: any) => api.post('/merchants/products', data),
  updateProduct: (id: string, data: any) =>
    api.put(`/merchants/products/${id}`, data),
  deleteProduct: (id: string) => api.delete(`/merchants/products/${id}`),
};

export const rideAPI = {
  estimate: (data: any) => api.post('/rides/estimate', data),
  create: (data: any) => api.post('/rides', data),
  get: (id: string) => api.get(`/rides/${id}`),
  accept: (id: string) => api.post(`/rides/${id}/accept`),
  updateStatus: (id: string, status: string) =>
    api.post(`/rides/${id}/status`, { status }),
  cancel: (id: string, reason?: string) =>
    api.post(`/rides/${id}/cancel`, { reason }),
  list: (params?: any) => api.get('/rides', { params }),
  rate: (id: string, data: any) => api.post(`/rides/${id}/rate`, data),
  getActive: () => api.get('/rides/active/current'),
  getAvailable: () => api.get('/rides/pending/available'),
};

export const orderAPI = {
  create: (data: any) => api.post('/orders', data),
  get: (id: string) => api.get(`/orders/${id}`),
  list: (params?: any) => api.get('/orders', { params }),
  updateStatus: (id: string, status: string) =>
    api.post(`/orders/${id}/status`, { status }),
};

export const walletAPI = {
  get: () => api.get('/wallet'),
  topup: (amount: number, paymentMethod: string) =>
    api.post('/wallet/topup', { amount, payment_method: paymentMethod }),
};

export const configAPI = {
  getAppConfig: () => api.get('/config/app'),
  getVehicleCategories: () => api.get('/config/vehicle-categories'),
  getVehicleTypes: (categorySlug?: string) =>
    api.get('/config/vehicle-types', {
      params: categorySlug ? { category_slug: categorySlug } : {},
    }),
  getNearbyCategories: () => api.get('/config/nearby-categories'),
  getParcelTypes: () => api.get('/config/parcel-types'),
};

export const servicesAPI = {
  getCategories: () => api.get('/services/categories'),
  createBooking: (data: any) => api.post('/services/bookings', data),
  getNearby: (params?: any) => api.get('/services/nearby', { params }),
};

export const phase2API = {
  catalog: (collection: string, params?: any) =>
    api.get(`/phase2/catalogs/${collection}`, { params }),
  liveStats: () => api.get('/phase2/taxi-bidding/live-stats'),
  bookRunner: (data: any) => api.post('/phase2/runner/book', data),
};

export const voiceAPI = {
  parseBooking: (transcript: string) =>
    api.post('/voice/parse-booking', { transcript }),
};

export const parcelAPI = {
  driverAvailable: () => api.get('/parcels/driver/available'),
  driverActive: () => api.get('/parcels/driver/active'),
  accept: (id: string) => api.post(`/parcels/${id}/accept`),
  updateStatus: (id: string, status: string) =>
    api.post(`/parcels/${id}/status`, { status }),
  deliverLeg: (id: string, index: number) =>
    api.post(`/parcels/${id}/legs/${index}/deliver`),
};

export const medicalAPI = {
  transportDriverAvailable: () => api.get('/medical/transport/driver/available'),
  transportDriverActive: () => api.get('/medical/transport/driver/active'),
  acceptTransport: (id: string) => api.post(`/medical/transport/${id}/accept`),
  updateTransportStatus: (id: string, status: string) =>
    api.post(`/medical/transport/${id}/status`, { status }),
};

export const pharmacyAPI = {
  pharmacies: () => api.get('/pharmacy/pharmacies'),
  settings: () => api.get('/pharmacy/settings'),
  categories: () => api.get('/pharmacy/categories'),
  products: (params?: any) => api.get('/pharmacy/products', { params }),
  estimate: (data: any) => api.post('/pharmacy/orders/estimate', data),
  paymentMethods: () => api.get('/pharmacy/payment-methods'),
  createOrder: (data: any) => api.post('/pharmacy/orders', data),
  myOrders: () => api.get('/pharmacy/orders'),
  getOrder: (id: string) => api.get(`/pharmacy/orders/${id}`),
  cancelOrder: (id: string) => api.post(`/pharmacy/orders/${id}/cancel`),
  payOrder: (id: string, paymentMethod: string) =>
    api.post(`/pharmacy/orders/${id}/pay`, { payment_method: paymentMethod }),
  sbpaygoSsoLink: () => api.post('/finance/sbpaygo/sso-link'),
};

export const adminAPI = {
  dashboard: () => api.get('/admin/dashboard'),
};
