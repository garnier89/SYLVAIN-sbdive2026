import { api } from './client';

export const ferryAPI = {
  ports: () => api.get('/ferry/ports'),
  routes: (params) => api.get('/ferry/routes', { params }),
  route: (id) => api.get(`/ferry/routes/${id}`),
  book: (data) => api.post('/ferry/bookings', data),
  stripeCheckout: (data) => api.post('/ferry/bookings/stripe-checkout', data),
  stripeStatus: (sessionId) => api.get(`/ferry/stripe-status/${sessionId}`),
  myBookings: () => api.get('/ferry/bookings'),
  booking: (id) => api.get(`/ferry/bookings/${id}`),
  adminRoutes: () => api.get('/admin/ferry/routes'),
  createRoute: (d) => api.post('/admin/ferry/routes', d),
  updateRoute: (id, d) => api.put(`/admin/ferry/routes/${id}`, d),
  toggleRoute: (id) => api.patch(`/admin/ferry/routes/${id}/toggle`),
  deleteRoute: (id) => api.delete(`/admin/ferry/routes/${id}`),
  adminPorts: () => api.get('/admin/ferry/ports'),
  adminCompanies: () => api.get('/admin/ferry/companies'),
  updateCompany: (id, d) => api.put(`/admin/ferry/companies/${id}`, d),
  adminConfig: () => api.get('/admin/ferry/config'),
  updateConfig: (d) => api.put('/admin/ferry/config', d),
  adminRevenue: (params) => api.get('/admin/ferry/revenue', { params }),
  adminSettlements: (month) => api.get('/admin/ferry/settlements', { params: month ? { month } : {} }),
  settleBatch: (data) => api.post('/admin/ferry/settlements/settle-batch', data),
  adminBookings: () => api.get('/admin/ferry/bookings'),
  settleBooking: (id) => api.post(`/admin/ferry/bookings/${id}/settle`),
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
