import { api } from './client';

export const familyAPI = {
  context: () => api.get('/family/context'),
  seedDemo: () => api.post('/family/seed-demo'),
  members: () => api.get('/family/members'),
  addMember: (p) => api.post('/family/members', p),
  deleteMember: (id) => api.delete(`/family/members/${id}`),
  join: (code) => api.post('/family/join', { code }),
  sharePing: (p) => api.post('/family/share-ping', p),
  places: () => api.get('/family/places'),
  createPlace: (p) => api.post('/family/places', p),
  deletePlace: (id) => api.delete(`/family/places/${id}`),
  sos: (p) => api.post('/family/sos', p),
  alerts: () => api.get('/family/alerts'),
  readAlert: (id) => api.post(`/family/alerts/${id}/read`),
  readAllAlerts: () => api.post('/family/alerts/read-all'),
};

export const proAPI = {
  status: () => api.get('/tracking-pro/status'),
  checkout: (package_id, origin_url) => api.post('/tracking-pro/checkout', { package_id, origin_url }),
  checkoutStatus: (sessionId) => api.get(`/tracking-pro/checkout-status/${sessionId}`),
};

export const securityAPI = {
  overview: () => api.get('/security/overview'),
};

export const employeesAPI = {
  context: () => api.get('/employees/context'),
  seedDemo: () => api.post('/employees/seed-demo'),
  list: () => api.get('/employees'),
  add: (p) => api.post('/employees', p),
  invite: (p) => api.post('/employees/invite', p),
  remove: (id) => api.delete(`/employees/${id}`),
  join: (code) => api.post('/employees/join', { code }),
  clockIn: (p) => api.post('/employees/clock-in', p),
  clockOut: (p) => api.post('/employees/clock-out', p),
  ping: (p) => api.post('/employees/ping', p),
  timesheet: (id) => api.get(`/employees/${id}/timesheet`),
  routes: () => api.get('/employees/routes'),
  createRoute: (p) => api.post('/employees/routes', p),
  toggleStop: (rid, sid) => api.post(`/employees/routes/${rid}/stops/${sid}/toggle`),
  deleteRoute: (id) => api.delete(`/employees/routes/${id}`),
  reports: () => api.get('/employees/reports'),
  reportPdf: () => api.get('/employees/report.pdf', { responseType: 'blob' }),
  memberships: () => api.get('/employees/memberships'),
  myRoutes: () => api.get('/employees/my-routes'),
  toggleMyStop: (rid, sid) => api.post(`/employees/my/routes/${rid}/stops/${sid}/toggle`),
  supervised: () => api.get('/employees/supervised'),
  supervisedTeam: (orgId) => api.get(`/employees/supervised/${orgId}`),
};

export const fleetAPI = {
  context: () => api.get('/fleet/context'),
  updateContext: (p) => api.put('/fleet/context', p),
  seedDemo: () => api.post('/fleet/seed-demo'),
  vehicles: () => api.get('/fleet/vehicles'),
  vehicle: (id) => api.get(`/fleet/vehicles/${id}`),
  createVehicle: (p) => api.post('/fleet/vehicles', p),
  updateVehicle: (id, p) => api.put(`/fleet/vehicles/${id}`, p),
  deleteVehicle: (id) => api.delete(`/fleet/vehicles/${id}`),
  history: (id) => api.get(`/fleet/vehicles/${id}/history`),
  command: (id, command, confirm = false) => api.post(`/fleet/vehicles/${id}/command`, { command, confirm }),
  commands: (id) => api.get(`/fleet/vehicles/${id}/commands`),
  drivers: () => api.get('/fleet/drivers'),
  addDriver: (p) => api.post('/fleet/drivers', p),
  deleteDriver: (id) => api.delete(`/fleet/drivers/${id}`),
  geofences: () => api.get('/fleet/geofences'),
  createGeofence: (p) => api.post('/fleet/geofences', p),
  deleteGeofence: (id) => api.delete(`/fleet/geofences/${id}`),
  alerts: () => api.get('/fleet/alerts'),
  readAlert: (id) => api.post(`/fleet/alerts/${id}/read`),
  readAllAlerts: () => api.post('/fleet/alerts/read-all'),
  reportPdf: () => api.get('/fleet/report.pdf', { responseType: 'blob' }),
  myPing: (p) => api.post('/fleet/my-ping', p),
};
