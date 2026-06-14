import { api } from './client';

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
