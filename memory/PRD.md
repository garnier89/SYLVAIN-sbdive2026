# SuperApp MVP - Product Requirements Document

## Original Problem Statement
Build a multi-service super app like Gojek/V3Cube with:
- User Mobile App
- Driver/Provider Mobile App  
- Merchant Web Panel
- Admin Web Panel
- Dispatcher Web Panel

Core services: Ride hailing, motorbike ride, parcel delivery, food delivery

## Architecture

### Tech Stack
- **Frontend**: React 18 + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI + Python
- **Database**: MongoDB
- **Auth**: JWT + Google OAuth (Emergent-managed)
- **Payments**: Stripe (wallet top-up)
- **Maps**: Leaflet/OpenStreetMap
- **Real-time**: WebSocket

### Modular Backend Structure
- Auth module (JWT + Google OAuth + OTP)
- User management
- Driver management & document verification
- Merchant management
- Ride service
- Order/Delivery service
- Wallet & Payments (Stripe)
- Ratings & Reviews
- Support tickets

## User Personas
1. **Customer**: Book rides, order food, manage wallet
2. **Driver**: Accept rides, complete deliveries, manage earnings
3. **Merchant**: Manage store, products, orders
4. **Admin**: Platform oversight, approvals, analytics
5. **Dispatcher**: Live operations, manual dispatch

## What's Been Implemented (Phase 1 MVP) - April 5, 2026

### User App
- [x] User registration & login (JWT + Google OAuth)
- [x] Home dashboard with services grid (Ride, Moto, Food, Parcel)
- [x] Saved places (Home, Work)
- [x] Ride booking with map
- [x] Food delivery page with restaurant listing
- [x] Wallet page with Stripe top-up
- [x] Profile page
- [x] Bottom navigation

### Driver App
- [x] Driver registration flow
- [x] Vehicle & document upload
- [x] Online/offline toggle
- [x] Incoming ride requests
- [x] Ride acceptance & status updates
- [x] Earnings display

### Admin Panel
- [x] Dashboard with KPI stats
- [x] User management
- [x] Driver management & approval
- [x] Rides/Orders overview
- [x] Support tickets
- [x] Role-based access

### Dispatcher Panel
- [x] Dark theme control room UI
- [x] Live map with OpenStreetMap
- [x] Online drivers display
- [x] Pending rides section
- [x] Manual ride assignment

### Backend APIs
- [x] Full auth flow (register, login, logout, refresh, Google OAuth)
- [x] User CRUD
- [x] Driver registration & approval
- [x] Merchant registration
- [x] Ride booking & status management
- [x] Order creation
- [x] Wallet with Stripe integration
- [x] Rating system
- [x] Support tickets
- [x] Admin dashboard stats
- [x] Dispatcher live data

## Prioritized Backlog

### P0 - Critical (Next Sprint)
- [ ] Complete merchant panel with order management
- [ ] Add real-time WebSocket for ride tracking
- [ ] Implement push notifications
- [ ] Add OTP verification for ride start

### P1 - High Priority
- [ ] Food ordering cart & checkout flow
- [ ] Driver navigation integration
- [ ] Payment processing for rides/orders
- [ ] In-app chat between user & driver

### P2 - Medium Priority
- [ ] Parcel delivery specific flow
- [ ] Scheduled bookings
- [ ] Surge pricing
- [ ] Coupon/referral system

### P3 - Future Phases
- [ ] Grocery delivery
- [ ] Pharmacy delivery
- [ ] Home services
- [ ] Multi-store delivery
- [ ] Premium subscriptions
- [ ] Multi-country support

## Test Credentials
- **Admin**: admin@superapp.com / SuperAdmin123!
- **Test User**: test2@example.com / TestPass123!

## Environment Variables
- MONGO_URL: MongoDB connection
- DB_NAME: Database name
- JWT_SECRET: Token signing
- STRIPE_API_KEY: Payment processing
- EMERGENT_LLM_KEY: AI features
- FRONTEND_URL: CORS origin
