import { api } from './client';

export const orderAPI = {
  create: (data) => api.post('/orders', data),
  get: (id) => api.get(`/orders/${id}`),
  updateStatus: (id, status) => api.post(`/orders/${id}/status`, { status }),
  assignDriver: (id, driverId) => api.post(`/orders/${id}/assign-driver`, { driver_id: driverId }),
  list: (params) => api.get('/orders', { params }),
  lastDelivery: () => api.get('/orders/last-delivery'),
  rate: (id, data) => api.post(`/orders/${id}/rate`, data),
  // Food delivery — driver jobs + live tracking
  availableDeliveries: () => api.get('/orders/available-deliveries'),
  driverActiveOrders: () => api.get('/orders/driver/active'),
  claim: (id) => api.post(`/orders/${id}/claim`),
  track: (id) => api.get(`/orders/${id}/track`),
  deliveryOptions: () => api.get('/orders/delivery-options'),
};

// Cart APIs

export const cartAPI = {
  get: () => api.get('/cart'),
  save: (merchantId, items) => api.put('/cart', { merchant_id: merchantId, items }),
  clear: () => api.delete('/cart'),
};

// Wallet APIs

export const walletAPI = {
  get: () => api.get('/wallet'),
  topup: (amount, paymentMethod) => api.post('/wallet/topup', { amount, payment_method: paymentMethod }),
  pay: (data) => api.post('/wallet/pay', data),
  transfer: (toUserId, amount) => api.post('/wallet/transfer', { to_user_id: toUserId, amount }),
  refund: (amount, reason) => api.post('/wallet/refund', { amount, reason }),
};

// SB PayGo / finance APIs

export const financeAPI = {
  balance: () => api.get('/finance/balance'),
  sbpaygoSsoLink: () => api.post('/finance/sbpaygo/sso-link'),
};

// Support APIs

export const marketplaceAPI = {
  createListing: (data) => api.post('/marketplace/listings', data),
  getListings: (params) => api.get('/marketplace/listings', { params }),
  getListing: (id) => api.get(`/marketplace/listings/${id}`),
  myListings: () => api.get('/marketplace/my-listings'),
  deleteListing: (id) => api.delete(`/marketplace/listings/${id}`),
  updateListing: (id, data) => api.put(`/marketplace/listings/${id}`, data),
  boostPlans: (country) => api.get('/marketplace/boost-plans', { params: country ? { country } : {} }),
  boostPay: (id, planId) => api.post(`/marketplace/listings/${id}/boost/pay`, { plan_id: planId }),
  startThread: (listingId, itemType) => api.post('/marketplace/threads', { listing_id: listingId, ...(itemType ? { item_type: itemType } : {}) }),
  myThreads: () => api.get('/marketplace/threads'),
  threadMessages: (threadId) => api.get(`/marketplace/threads/${threadId}/messages`),
  sendMessage: (threadId, text) => api.post(`/marketplace/threads/${threadId}/messages`, { text }),
  markThreadRead: (threadId) => api.post(`/marketplace/threads/${threadId}/read`),
  // Buy / pay flow
  settings: () => api.get('/marketplace/settings'),
  setPurchasable: (id, purchasable, price) => api.patch(`/marketplace/listings/${id}/purchasable`, { purchasable, price }),
  buyWithWallet: (data) => api.post('/marketplace/orders/wallet', data),
  buyWithCard: (data) => api.post('/marketplace/orders/checkout', data),
  checkoutStatus: (sessionId) => api.get(`/marketplace/checkout/status/${sessionId}`),
  myOrders: () => api.get('/marketplace/orders'),
  mySales: () => api.get('/marketplace/orders/sold'),
  updateOrderStatus: (orderId, status) => api.post(`/marketplace/orders/${orderId}/status`, { status }),
  // Admin moderation + settings
  adminListings: (params) => api.get('/marketplace/admin/listings', { params }),
  adminDeleteListing: (id) => api.delete(`/marketplace/admin/listings/${id}`),
  adminToggleListing: (id) => api.post(`/marketplace/admin/listings/${id}/toggle`),
  adminFeatureListing: (id) => api.post(`/marketplace/admin/listings/${id}/feature`),
  adminGetSettings: () => api.get('/marketplace/admin/settings'),
  adminSetSettings: (data) => api.put('/marketplace/admin/settings', data),
  // admin boost plans
  adminBoostPlans: () => api.get('/marketplace/admin/boost-plans'),
  adminCreateBoostPlan: (data) => api.post('/marketplace/admin/boost-plans', data),
  adminUpdateBoostPlan: (id, data) => api.put(`/marketplace/admin/boost-plans/${id}`, data),
  adminToggleBoostPlan: (id) => api.post(`/marketplace/admin/boost-plans/${id}/toggle`),
  adminDeleteBoostPlan: (id) => api.delete(`/marketplace/admin/boost-plans/${id}`),
};

// Favoris (Immobilier + Marketplace)

export const favoritesAPI = {
  toggle: (itemType, itemId, snapshot) => api.post('/favorites/toggle', { item_type: itemType, item_id: itemId, ...(snapshot ? { snapshot } : {}) }),
  ids: (itemType) => api.get('/favorites/ids', { params: itemType ? { item_type: itemType } : {} }),
  list: (itemType) => api.get('/favorites', { params: itemType ? { item_type: itemType } : {} }),
};

export const couponAPI = {
  validate: (code, amount, serviceType) => api.post('/coupons/validate', { code, amount, service_type: serviceType }),
  apply: (code, amount, rideId, orderId) => api.post('/coupons/apply', { code, amount, ride_id: rideId, order_id: orderId }),
  list: () => api.get('/coupons'),
  adminCreate: (data) => api.post('/coupons/admin/create', data),
  adminList: () => api.get('/coupons/admin/all'),
  adminToggle: (id) => api.put(`/coupons/admin/${id}/toggle`),
  adminDelete: (id) => api.delete(`/coupons/admin/${id}`),
  adminBulk: (action, ids) => api.post('/coupons/admin/bulk', { action, ids }),
};

// Simulation APIs

export const studentAPI = {
  me: () => api.get('/student/me'),
  config: () => api.get('/student/config'),
  checkDomain: (email) => api.get('/student/domains/check', { params: { email } }),
  requestEmailOtp: (email) => api.post('/student/verify/email/request', { email }),
  confirmEmailOtp: (email, code) => api.post('/student/verify/email/confirm', { email, code }),
  uploadDocument: (file, docType = 'student_card') => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/student/documents?doc_type=${encodeURIComponent(docType)}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  quote: (amount, kind = 'ride') => api.get('/student/discount/quote', { params: { amount, kind } }),
  // admin
  adminGetConfig: () => api.get('/student/admin/config'),
  adminUpdateConfig: (data) => api.put('/student/admin/config', data),
  adminDomains: () => api.get('/student/admin/domains'),
  adminCreateDomain: (data) => api.post('/student/admin/domains', data),
  adminUpdateDomain: (id, data) => api.put(`/student/admin/domains/${id}`, data),
  adminDeleteDomain: (id) => api.delete(`/student/admin/domains/${id}`),
  adminList: (status = '') => api.get('/student/admin/list', { params: status ? { status } : {} }),
  adminApprove: (userId) => api.post(`/student/admin/${userId}/approve`),
  adminReject: (userId, reason) => api.post(`/student/admin/${userId}/reject`, { reason }),
  adminStats: () => api.get('/student/admin/stats'),
  // Pass Campus
  campusPlans: () => api.get('/student/campus/plans'),
  campusSubscription: () => api.get('/student/campus/subscription'),
  campusSubscribe: (planId) => api.post('/student/campus/subscribe', { plan_id: planId }),
  campusCancel: () => api.post('/student/campus/subscription/cancel'),
  campusAdminPlans: () => api.get('/student/campus/admin/plans'),
  campusAdminCreatePlan: (data) => api.post('/student/campus/admin/plans', data),
  campusAdminUpdatePlan: (id, data) => api.put(`/student/campus/admin/plans/${id}`, data),
  campusAdminDeletePlan: (id) => api.delete(`/student/campus/admin/plans/${id}`),
  // Recurring bookings
  recurringList: () => api.get('/student/campus/recurring'),
  recurringCreate: (data) => api.post('/student/campus/recurring', data),
  recurringUpdate: (id, data) => api.put(`/student/campus/recurring/${id}`, data),
  recurringDelete: (id) => api.delete(`/student/campus/recurring/${id}`),
  recurringBookNext: (id) => api.get(`/student/campus/recurring/${id}/book-next`),
  // Campus zones + Campus Share
  campusZones: (lat, lng) => api.get('/student/zones/campus', { params: (lat != null && lng != null) ? { lat, lng } : {} }),
  zonesAdminList: () => api.get('/student/admin/campus-zones'),
  zonesAdminCreate: (data) => api.post('/student/admin/campus-zones', data),
  zonesAdminUpdate: (id, data) => api.put(`/student/admin/campus-zones/${id}`, data),
  zonesAdminDelete: (id) => api.delete(`/student/admin/campus-zones/${id}`),
  shareRequest: (data) => api.post('/student/campus-share/request', data),
  shareMatches: () => api.get('/student/campus-share/matches'),
  shareCancel: () => api.delete('/student/campus-share/request'),
  // Phase 4 — Safety + Safe Ride Night
  safetySettings: () => api.get('/student/safety/settings'),
  safetyUpdate: (data) => api.put('/student/safety/settings', data),
  safeRideStart: (rideId) => api.post('/student/safety/safe-ride/start', { ride_id: rideId }),
  safeRideActive: () => api.get('/student/safety/safe-ride/active'),
  recommendedDrivers: (lat, lng) => api.get('/student/safety/recommended-drivers', { params: { lat, lng } }),
  driverTrust: (driverId) => api.get(`/student/safety/driver/${driverId}/trust`),
  listContacts: () => api.get('/phase1/emergency-contacts'),
  addContact: (data) => api.post('/phase1/emergency-contacts', data),
  removeContact: (id) => api.delete(`/phase1/emergency-contacts/${id}`),
  // Phase 5 — Rewards
  rewardsMe: () => api.get('/student/rewards/me'),
  rewardsCatalog: () => api.get('/student/rewards/catalog'),
  rewardsRedeem: (rewardId) => api.post('/student/rewards/redeem', { reward_id: rewardId }),
  rewardsAdminConfig: () => api.get('/student/rewards/admin/config'),
  rewardsAdminUpdateConfig: (data) => api.put('/student/rewards/admin/config', data),
  rewardsAdminCatalog: () => api.get('/student/rewards/admin/catalog'),
  rewardsAdminCreate: (data) => api.post('/student/rewards/admin/catalog', data),
  rewardsAdminUpdate: (id, data) => api.put(`/student/rewards/admin/catalog/${id}`, data),
  rewardsAdminDelete: (id) => api.delete(`/student/rewards/admin/catalog/${id}`),
  // Phase 5 — Events
  eventsList: () => api.get('/student/events'),
  eventsMyReservations: () => api.get('/student/events/my-reservations'),
  eventReserve: (data) => api.post('/student/events/reserve', data),
  eventCancelReservation: (id) => api.delete(`/student/events/reserve/${id}`),
  eventsAdminList: () => api.get('/student/events/admin/list'),
  eventAdminCreate: (data) => api.post('/student/events/admin', data),
  eventAdminUpdate: (id, data) => api.put(`/student/events/admin/${id}`, data),
  eventAdminDelete: (id) => api.delete(`/student/events/admin/${id}`),
  // Phase 6 — Marketplace étudiante + IA
  mktCategories: () => api.get('/student/marketplace/categories'),
  mktListings: (params = {}) => api.get('/student/marketplace/listings', { params }),
  mktListing: (id) => api.get(`/student/marketplace/listings/${id}`),
  mktMyListings: () => api.get('/student/marketplace/my-listings'),
  mktCreate: (data) => api.post('/student/marketplace/listings', data),
  mktDelete: (id) => api.delete(`/student/marketplace/listings/${id}`),
  mktBuy: (id) => api.post(`/student/marketplace/listings/${id}/buy`),
  mktOrders: () => api.get('/student/marketplace/orders'),
  mktSales: () => api.get('/student/marketplace/sales'),
  mktAiSuggest: (data) => api.post('/student/marketplace/ai/suggest', data),
  mktAiSearch: (query) => api.post('/student/marketplace/ai/search', { query }),
  mktBoostPlans: () => api.get('/student/marketplace/boost/plans'),
  mktBoost: (id, planId, method) => api.post(`/student/marketplace/listings/${id}/boost`, { plan_id: planId, method }),
  mktAdminBoostConfig: () => api.get('/student/marketplace/admin/boost/config'),
  mktAdminUpdateBoostConfig: (data) => api.put('/student/marketplace/admin/boost/config', data),
  mktAdminBoostRevenue: () => api.get('/student/marketplace/admin/boost/revenue'),
  mktAlerts: () => api.get('/student/marketplace/alerts/me'),
  mktUpdateAlerts: (data) => api.put('/student/marketplace/alerts/me', data),
  mktDigestConfig: () => api.get('/student/marketplace/admin/digest/config'),
  mktUpdateDigestConfig: (data) => api.put('/student/marketplace/admin/digest/config', data),
  mktDigestSendNow: (testUserId) => api.post('/student/marketplace/admin/digest/send-now', testUserId ? { test_user_id: testUserId } : {}),
  mktDigestHistory: () => api.get('/student/marketplace/admin/digest/history'),
  mktReview: (orderId, data) => api.post(`/student/marketplace/orders/${orderId}/review`, data),
  mktGetReview: (orderId) => api.get(`/student/marketplace/orders/${orderId}/review`),
  mktSeller: (sellerId) => api.get(`/student/marketplace/sellers/${sellerId}`),
  mktAdminSellerConfig: () => api.get('/student/marketplace/admin/seller-config'),
  mktUpdateSellerConfig: (data) => api.put('/student/marketplace/admin/seller-config', data),
  mktContact: (listingId, text) => api.post(`/student/marketplace/listings/${listingId}/contact`, { text }),
  mktConversations: () => api.get('/student/marketplace/conversations'),
  mktConversationsUnread: () => api.get('/student/marketplace/conversations/unread-total'),
  mktMessages: (cid, after) => api.get(`/student/marketplace/conversations/${cid}/messages`, { params: after ? { after } : {} }),
  mktSendMessage: (cid, text) => api.post(`/student/marketplace/conversations/${cid}/messages`, { text }),
  mktSellerSettings: () => api.get('/student/marketplace/seller-settings'),
  mktUpdateSellerSettings: (data) => api.put('/student/marketplace/seller-settings', data),
  mktChatSuggestions: (payload) => api.post('/student/marketplace/chat-suggestions', payload),
  mktMakeOffer: (cid, amount) => api.post(`/student/marketplace/conversations/${cid}/offer`, { amount }),
  mktRespondOffer: (msgId, action) => api.post(`/student/marketplace/offers/${msgId}/respond`, { action }),
  mktPayOffer: (msgId) => api.post(`/student/marketplace/offers/${msgId}/pay`),
  mktUploadImage: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/uploads/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

// ── SB Drive Access (transport adapté PMR / handicap) ──
