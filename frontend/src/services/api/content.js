import { api } from './client';

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

export const serviceTrendsAPI = {
  track: (payload) => api.post('/service-trends/track', payload),
  trending: (zone, limit = 8) => api.get('/service-trends/trending', { params: { zone, limit } }),
  adminGetPinned: () => api.get('/service-trends/admin/pinned'),
  adminSetPinned: (items) => api.put('/service-trends/admin/pinned', { items }),
};

// Zones — admin-managed geographic zones + programmed (scheduled) shortcuts.

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

// Home feature banners CMS (SB Student / Livraison hero / custom) — admin-piloted

export const homeBannersAPI = {
  public: (location) => api.get('/home-banners', { params: location ? { location } : {} }),
  preview: (zone) => api.get('/home-banners', { params: {
    ...(zone?.country ? { country: zone.country } : {}),
    ...(zone?.state ? { state: zone.state } : {}),
    ...(zone?.city ? { city: zone.city } : {}),
  } }),
  dismiss: (id, data) => api.post(`/home-banners/${id}/dismiss`, data || {}),
  impression: (id, data) => api.post(`/home-banners/${id}/impression`, data || {}),
  click: (id, data) => api.post(`/home-banners/${id}/click`, data || {}),
  analytics: () => api.get('/admin/home-banners/analytics'),
  events: (id, params) => api.get(`/admin/home-banners/${id}/events`, { params }),
  adminList: () => api.get('/admin/home-banners'),
  create: (data) => api.post('/admin/home-banners', data),
  update: (id, data) => api.put(`/admin/home-banners/${id}`, data),
  toggle: (id) => api.patch(`/admin/home-banners/${id}/toggle`),
  remove: (id) => api.delete(`/admin/home-banners/${id}`),
  reorder: (orderedIds) => api.post('/admin/home-banners/reorder', { ordered_ids: orderedIds }),
};

// SB Ferry — billetterie maritime (Antilles) + correspondance VTC

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

export const serviceSettingsAPI = {
  publicSettings: (key) => api.get(`/services/${key}/settings`),
  adminList: () => api.get('/admin/services/settings'),
  adminGet: (key) => api.get(`/admin/services/settings/${key}`),
  adminUpdate: (key, data) => api.put(`/admin/services/settings/${key}`, data),
};
