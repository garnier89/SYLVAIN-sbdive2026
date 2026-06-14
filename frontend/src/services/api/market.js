import { api } from './client';

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
