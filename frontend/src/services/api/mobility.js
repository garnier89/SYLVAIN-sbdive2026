import { api } from './client';

export const rideAPI = {
  estimate: (data) => api.post('/rides/estimate', data),
  demandZones: (lat, lng) => api.get('/phase2/demand-zones', { params: { lat, lng } }),
  nearbyDrivers: (lat, lng) => api.get('/rides/nearby/drivers', { params: { lat, lng } }),
  biddingAvgFares: () => api.get('/rides/bidding/avg-fares'),
  getBestAutoPromo: (amount, service = 'ride', pickup = '') => api.get('/auto-promotions/best', { params: { amount, service, pickup } }),
  validateVoucher: (code, amount, pickup_address = '') => api.post('/vouchers/validate', { code, amount, pickup_address }),
  create: (data) => api.post('/rides', data),
  availabilityAlert: (data) => api.post('/rides/availability-alert', data),
  get: (id) => api.get(`/rides/${id}`),
  accept: (id) => api.post(`/rides/${id}/accept`),
  decline: (id) => api.post(`/rides/${id}/decline`),
  driverCancelBooking: (id) => api.post(`/rides/${id}/driver-cancel-booking`),
  updateStatus: (id, status) => api.post(`/rides/${id}/status`, { status }),
  cancel: (id, reason) => api.post(`/rides/${id}/cancel`, { reason }),
  list: (params) => api.get('/rides', { params }),
  driverBookings: () => api.get('/rides/driver/bookings'),
  driverHomeFeed: () => api.get('/rides/driver/home-feed'),
  taxiHall: (data) => api.post('/rides/taxi-hall', data),
  taxiHallEligibility: () => api.get('/rides/taxi-hall/eligibility'),
  rate: (id, data) => api.post(`/rides/${id}/rate`, data),
  ratePassenger: (id, data) => api.post(`/rides/${id}/rate-passenger`, data),
  complete: (id, extra_charges) => api.post(`/rides/${id}/status`, { status: 'completed', extra_charges }),
  getActive: () => api.get('/rides/active/current'),
  getAvailable: () => api.get('/rides/pending/available'),
  updateRoute: (id, data) => api.post(`/rides/${id}/update-route`, data),
  changePaymentMethod: (id, payment_method) => api.put(`/rides/${id}/payment-method`, { payment_method }),
  collectCash: (id, payload) => api.post(`/rides/${id}/collect-cash`, typeof payload === 'boolean' ? { received: payload } : payload),
  airports: () => api.get('/phase2/airports'),
  flightRefresh: (id) => api.post(`/phase2/rides/${id}/flight-refresh`),
  // Mise à disposition (rental) — live billing meter
  rentalStart: (id) => api.post(`/rides/${id}/rental/start`),
  rentalAddStop: (id, stop) => api.post(`/rides/${id}/rental/add-stop`, stop),
  rentalMeter: (id) => api.get(`/rides/${id}/rental/meter`),
  rentalEnd: (id, actual_km) => api.post(`/rides/${id}/rental/end`, { actual_km }),
};

// Airport Transfer admin

export const safetyAudioAPI = {
  upload: (blob, { ride_id, kind = 'ride', duration_sec = 0 } = {}) => {
    const fd = new FormData();
    const ext = (blob.type || 'audio/webm').includes('ogg') ? 'ogg' : 'webm';
    fd.append('file', blob, `safety_${Date.now()}.${ext}`);
    if (ride_id) fd.append('ride_id', ride_id);
    fd.append('kind', kind);
    fd.append('duration_sec', String(duration_sec));
    return api.post('/safety/audio/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  listForRide: (rideId) => api.get(`/safety/audio/ride/${rideId}`),
  adminList: (params) => api.get('/admin/safety/recordings', { params }),
};

// Dispatch control tower (admin / dispatcher)

export const dispatcherAPI = {
  getLiveData: () => api.get('/dispatcher/live'),
  assignRide: (rideId, driverId) => api.post('/dispatcher/assign-ride', { ride_id: rideId, driver_id: driverId }),
};

// Marketplace APIs

export const zonesAPI = {
  resolve: (params) => api.get('/zones/resolve', { params }),
  adminList: () => api.get('/zones/admin/list'),
  create: (data) => api.post('/zones/admin', data),
  update: (id, data) => api.put(`/zones/admin/${id}`, data),
  remove: (id) => api.delete(`/zones/admin/${id}`),
  getShortcuts: (id) => api.get(`/zones/admin/${id}/shortcuts`),
  setShortcuts: (id, entries) => api.put(`/zones/admin/${id}/shortcuts`, { entries }),
};

// Transports publics — réseau de transport en commun (données simulées).

export const transportAPI = {
  nearby: (params) => api.get('/transport/nearby', { params }),
  stopDepartures: (stopId, mins) => api.get(`/transport/stops/${stopId}/departures`, { params: mins != null ? { mins } : {} }),
  journey: (params) => api.get('/transport/journey', { params }),
  listJourneys: () => api.get('/transport/journeys'),
  saveJourney: (data) => api.post('/transport/journeys', data),
  deleteJourney: (jid) => api.delete(`/transport/journeys/${jid}`),
  // admin
  adminListStops: () => api.get('/transport/admin/stops'),
  createStop: (data) => api.post('/transport/admin/stops', data),
  updateStop: (id, data) => api.put(`/transport/admin/stops/${id}`, data),
  removeStop: (id) => api.delete(`/transport/admin/stops/${id}`),
  adminListLines: () => api.get('/transport/admin/lines'),
  createLine: (data) => api.post('/transport/admin/lines', data),
  updateLine: (id, data) => api.put(`/transport/admin/lines/${id}`, data),
  removeLine: (id) => api.delete(`/transport/admin/lines/${id}`),
  // GTFS (real data) status & manual refresh
  gtfsStatus: () => api.get('/transport/admin/gtfs/status'),
  gtfsRefresh: (force = false) => api.post(`/transport/admin/gtfs/refresh?force=${force}`),
  setGtfsRealtime: (realtime_urls) => api.put('/transport/admin/gtfs/realtime', { realtime_urls }),
  scanGtfsRealtime: () => api.post('/transport/admin/gtfs/realtime/scan'),
  ackGtfsAlerts: () => api.post('/transport/admin/gtfs/alerts/ack'),
  // Disruptions & strikes (perturbations / grèves)
  disruptions: () => api.get('/transport/disruptions'),
  disruptionsHistory: () => api.get('/transport/disruptions/history'),
  adminListDisruptions: () => api.get('/transport/admin/disruptions'),
  createDisruption: (data) => api.post('/transport/admin/disruptions', data),
  updateDisruption: (id, data) => api.put(`/transport/admin/disruptions/${id}`, data),
  removeDisruption: (id) => api.delete(`/transport/admin/disruptions/${id}`),
};

// Parcel delivery APIs (single & multi-drop)

export const parcelAPI = {
  estimate: (data) => api.post('/parcels/estimate', data),
  create: (data) => api.post('/parcels', data),
  list: () => api.get('/parcels'),
  get: (id) => api.get(`/parcels/${id}`),
  driverAvailable: () => api.get('/parcels/driver/available'),
  driverActive: () => api.get('/parcels/driver/active'),
  accept: (id) => api.post(`/parcels/${id}/accept`),
  updateStatus: (id, status) => api.post(`/parcels/${id}/status`, { status }),
  deliverLeg: (id, index) => api.post(`/parcels/${id}/legs/${index}/deliver`),
};

// Medical module APIs (prise de RDV + transport médical / ambulance)

export const placesAPI = {
  getSaved: () => api.get('/places/saved'),
  setSaved: (kind, place) => api.put(`/places/saved/${kind}`, place),
  deleteSaved: (kind) => api.delete(`/places/saved/${kind}`),
  addRecent: (place) => api.post('/places/recent', place),
};

export const geoAPI = {
  ipLocate: () => api.get('/geo/ip-locate'),
  getCountries: () => api.get('/geo/countries'),
  getStates: (country) => api.get('/geo/states', { params: { country } }),
  getCities: (country, state) => api.get('/geo/cities', { params: { country, state } }),
};

export const accessAPI = {
  needsCatalog: () => api.get('/access/needs-catalog'),
  getConfig: (location = '') => api.get('/access/config', { params: location ? { location } : {} }),
  getProfile: () => api.get('/access/profile'),
  updateProfile: (data) => api.put('/access/profile', data),
  match: (data) => api.post('/access/match', data),
  createBooking: (data) => api.post('/access/bookings', data),
  myBookings: () => api.get('/access/bookings'),
  // SOS / Sécurité
  triggerSos: (data) => api.post('/access/sos', data),
  sosLocation: (id, data) => api.post(`/access/sos/${id}/location`, data),
  sosResolve: (id) => api.post(`/access/sos/${id}/resolve`, {}),
  sosActive: () => api.get('/access/sos/active'),
  // SB Access Plus (abonnement)
  plusPlans: () => api.get('/access/plus/plans'),
  plusSubscription: () => api.get('/access/plus/subscription'),
  plusSubscribe: (planId) => api.post('/access/plus/subscribe', { plan_id: planId }),
  plusCancel: () => api.post('/access/plus/cancel', {}),
  listContacts: () => api.get('/phase1/emergency-contacts'),
  addContact: (data) => api.post('/phase1/emergency-contacts', data),
  removeContact: (id) => api.delete(`/phase1/emergency-contacts/${id}`),
  listRecurring: () => api.get('/access/recurring'),
  createRecurring: (data) => api.post('/access/recurring', data),
  updateRecurring: (id, data) => api.put(`/access/recurring/${id}`, data),
  deleteRecurring: (id) => api.delete(`/access/recurring/${id}`),
  skipRecurring: (id, data) => api.post(`/access/recurring/${id}/skip`, data || {}),
  // admin
  adminCategories: () => api.get('/access/admin/categories'),
  adminCreateCategory: (data) => api.post('/access/admin/categories', data),
  adminUpdateCategory: (id, data) => api.put(`/access/admin/categories/${id}`, data),
  adminDeleteCategory: (id) => api.delete(`/access/admin/categories/${id}`),
  adminGetSettings: () => api.get('/access/admin/settings'),
  adminUpdateSettings: (data) => api.put('/access/admin/settings', data),
  adminDrivers: () => api.get('/access/admin/drivers'),
  adminCertifyDriver: (id, data) => api.post(`/access/admin/drivers/${id}/certify`, data),
  adminUpdateDriverProfile: (id, data) => api.put(`/access/admin/drivers/${id}/profile`, data),
  uploadImage: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  adminBookings: () => api.get('/access/admin/bookings'),
  adminSos: () => api.get('/access/admin/sos'),
  adminResolveSos: (id, data) => api.post(`/access/admin/sos/${id}/resolve`, data || {}),
  adminPlusPlans: () => api.get('/access/admin/plus/plans'),
  adminPlusCreatePlan: (data) => api.post('/access/admin/plus/plans', data),
  adminPlusUpdatePlan: (id, data) => api.put(`/access/admin/plus/plans/${id}`, data),
  adminPlusDeletePlan: (id) => api.delete(`/access/admin/plus/plans/${id}`),
  adminPlusRevenue: () => api.get('/access/admin/plus/revenue'),
  adminStats: () => api.get('/access/admin/stats'),
  adminDemandForecast: () => api.get('/access/admin/ai/demand-forecast'),
  adminAllocationPreview: (data) => api.post('/access/admin/ai/allocation-preview', data),
};

// SB Drive — Location moto self-drive (libre-service)

export const carpoolAPI = {
  config: () => api.get('/carpool/config'),
  search: (params) => api.get('/carpool/rides', { params }),
  create: (data) => api.post('/carpool/rides', data),
  book: (id, seats) => api.post(`/carpool/rides/${id}/book`, { seats }),
  cancelBooking: (id) => api.post(`/carpool/rides/${id}/cancel`, {}),
  complete: (id) => api.post(`/carpool/rides/${id}/complete`, {}),
  cancelRide: (id) => api.post(`/carpool/rides/${id}/cancel-ride`, {}),
  rate: (id, data) => api.post(`/carpool/rides/${id}/rate`, data),
  driverReviews: (driverId) => api.get(`/carpool/drivers/${driverId}/reviews`),
  adminGetConfig: () => api.get('/carpool/admin/config'),
  adminSetConfig: (data) => api.put('/carpool/admin/config', data),
  adminRevenue: (params) => api.get('/carpool/admin/revenue', { params }),
  myRides: () => api.get('/carpool/my-rides'),
  listRequests: (params) => api.get('/carpool/requests', { params }),
  createRequest: (data) => api.post('/carpool/requests', data),
  myRequests: () => api.get('/carpool/my-requests'),
  cancelRequest: (id) => api.post(`/carpool/requests/${id}/cancel`, {}),
  listDriverRoutes: () => api.get('/carpool/driver-routes'),
  createDriverRoute: (data) => api.post('/carpool/driver-routes', data),
  toggleDriverRoute: (id) => api.post(`/carpool/driver-routes/${id}/toggle`, {}),
  deleteDriverRoute: (id) => api.delete(`/carpool/driver-routes/${id}`),
};
