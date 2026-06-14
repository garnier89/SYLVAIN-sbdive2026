import { api } from './client';

export const eventsAPI = {
  list: (params) => api.get('/events', { params }),
  categories: () => api.get('/events/categories'),
  get: (id) => api.get(`/events/${id}`),
  purchase: (id, payload) => api.post(`/events/${id}/purchase`, payload),
  purchasePremium: (id, payload) => api.post(`/events/${id}/purchase-premium`, payload),
  myTickets: () => api.get('/events/my/tickets'),
  cancelTicket: (ticketId) => api.post(`/events/tickets/${ticketId}/cancel`),
  // admin
  adminList: () => api.get('/admin/events'),
  adminCreate: (payload) => api.post('/admin/events', payload),
  adminUpdate: (id, payload) => api.put(`/admin/events/${id}`, payload),
  adminDelete: (id) => api.delete(`/admin/events/${id}`),
  adminAttendees: (id) => api.get(`/admin/events/${id}/attendees`),
  adminGetSettings: () => api.get('/admin/events/config/settings'),
  adminSetSettings: (payload) => api.put('/admin/events/config/settings', payload),
  adminOrganizers: () => api.get('/admin/events/config/organizers'),
};

export const organizerAPI = {
  me: () => api.get('/organizer/me'),
  register: (payload) => api.post('/organizer/register', payload),
  settings: () => api.get('/organizer/settings'),
  dashboard: () => api.get('/organizer/dashboard'),
  createEvent: (payload) => api.post('/organizer/events', payload),
  updateEvent: (id, payload) => api.put(`/organizer/events/${id}`, payload),
  deleteEvent: (id) => api.delete(`/organizer/events/${id}`),
  attendees: (id) => api.get(`/organizer/events/${id}/attendees`),
  checkinStats: (id) => api.get(`/organizer/events/${id}/checkin-stats`),
  eventLive: (id) => api.get(`/organizer/events/${id}/live`),
  checkin: (id, qr_token) => api.post(`/organizer/events/${id}/checkin`, { qr_token }),
  createStaff: (payload) => api.post('/organizer/staff', payload),
  listStaff: () => api.get('/organizer/staff'),
  revokeStaffInvite: (id) => api.post(`/organizer/staff/${id}/revoke`),
  revokeStaffMember: (id) => api.post(`/organizer/staff/members/${id}/revoke`),
  joinStaff: (code) => api.post('/organizer/staff/join', { code }),
  myStaffEvents: () => api.get('/organizer/staff/my'),
  boost: (id, days) => api.post(`/organizer/events/${id}/boost`, { days }),
};

// Services APIs
