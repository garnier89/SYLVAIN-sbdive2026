import api from '../services/api';

export const aclAPI = {
  myPermissions: () => api.get('/acl/me/permissions').then(r => r.data),
  listRoles: () => api.get('/acl/roles').then(r => r.data),
  createRole: (body) => api.post('/acl/roles', body).then(r => r.data),
  updateRole: (id, body) => api.put(`/acl/roles/${id}`, body).then(r => r.data),
  deleteRole: (id) => api.delete(`/acl/roles/${id}`).then(r => r.data),
  listAdminUsers: () => api.get('/acl/users').then(r => r.data),
  assignRoles: (userId, roleIds) => api.post(`/acl/users/${userId}/roles`, { user_id: userId, role_ids: roleIds }).then(r => r.data),
  permissionsRegistry: () => api.get('/acl/permissions/registry').then(r => r.data),
};

export const subscriptionsAPI = {
  listPlans: () => api.get('/subscriptions/plans').then(r => r.data),
  my: () => api.get('/subscriptions/my').then(r => r.data),
  subscribe: (planId, paymentMethod = 'wallet') => api.post('/subscriptions/subscribe', { plan_id: planId, payment_method: paymentMethod }).then(r => r.data),
  cancel: () => api.post('/subscriptions/cancel').then(r => r.data),
  adminListPlans: () => api.get('/subscriptions/admin/plans').then(r => r.data),
  adminListSubscriptions: (status) => api.get('/subscriptions/admin/subscriptions', { params: status ? { status } : {} }).then(r => r.data),
};

export const geoAPI = {
  countries: (q) => api.get('/geo/countries', { params: q ? { q } : {} }).then(r => r.data),
  phoneCodes: () => api.get('/geo/phone-codes').then(r => r.data),
  getCountry: (code) => api.get(`/geo/countries/${code}`).then(r => r.data),
};

export const auditAPI = {
  logs: (filters = {}) => api.get('/audit/logs', { params: filters }).then(r => r.data),
  actions: () => api.get('/audit/actions').then(r => r.data),
};

export const driverShiftsAPI = {
  start: (body = {}) => api.post('/driver-shifts/start', body).then(r => r.data),
  end: (body = {}) => api.post('/driver-shifts/end', body).then(r => r.data),
  my: (limit = 30) => api.get('/driver-shifts/my', { params: { limit } }).then(r => r.data),
  active: () => api.get('/driver-shifts/my/active').then(r => r.data),
  adminSummary: () => api.get('/driver-shifts/admin/summary').then(r => r.data),
};
