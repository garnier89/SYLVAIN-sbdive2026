import api from '../services/api';

export const kioskAPI = {
  // Public
  unlock: (pin_code) => api.post('/kiosk/unlock', { pin_code }).then(r => r.data),
  getInfo: (token) => api.get(`/kiosk/${token}/info`).then(r => r.data),
  nearestDriver: (token) => api.get(`/kiosk/${token}/nearest-driver`).then(r => r.data),
  estimate: (token, body) => api.post(`/kiosk/${token}/estimate`, body).then(r => r.data),
  book: (token, body) => api.post(`/kiosk/${token}/book`, body).then(r => r.data),
  rideStatus: (token, ride_id) => api.get(`/kiosk/${token}/ride/${ride_id}`).then(r => r.data),
  geocode: (token, q) => api.get(`/kiosk/${token}/geocode`, { params: { q } }).then(r => r.data),
  // Admin
  adminCreate: (body) => api.post('/kiosk/admin/create', body).then(r => r.data),
  adminList: () => api.get('/kiosk/admin/list').then(r => r.data),
  adminUpdate: (id, body) => api.put(`/kiosk/admin/${id}`, body).then(r => r.data),
  adminDelete: (id) => api.delete(`/kiosk/admin/${id}`).then(r => r.data),
  adminRegenerateToken: (id) => api.post(`/kiosk/admin/${id}/regenerate-token`).then(r => r.data),
};

export default kioskAPI;
