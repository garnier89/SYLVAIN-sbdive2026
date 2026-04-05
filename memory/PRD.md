# SuperApp MVP - Product Requirements Document

## Original Problem Statement
Build a multi-service super app like Gojek/V3Cube with:
- User Mobile App (Ride, Food, Parcel)
- Driver Mobile App
- Merchant Web Panel
- Admin Web Panel
- Dispatcher Web Panel

## Architecture

### Tech Stack
- **Frontend**: React 18 + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI + Python
- **Database**: MongoDB
- **Auth**: JWT + Google OAuth (Emergent-managed)
- **Payments**: Stripe (wallet top-up)
- **Maps**: Leaflet/OpenStreetMap
- **Real-time**: WebSocket

### Backend Modules
- Auth (JWT + Google OAuth + role-based)
- Users, Drivers, Merchants management
- Rides & Orders services
- Wallet & Payments (Stripe)
- Ratings, Support, Notifications
- Admin dashboard & Dispatcher live data

## What's Been Implemented - April 5, 2026

### User App ✅
- [x] JWT + Google OAuth authentication
- [x] Home dashboard with services grid (Ride, Moto, Food, Parcel)
- [x] Ride booking with interactive Leaflet map
- [x] Food ordering: Restaurant list → Menu → Cart → Checkout
- [x] Order tracking with status timeline
- [x] Wallet with Stripe payment integration
- [x] Activity history (Rides + Orders tabs)
- [x] Support page with FAQs and ticket form
- [x] Profile management

### Driver App ✅
- [x] Driver registration with vehicle/document upload
- [x] Online/offline toggle
- [x] Incoming ride request popup
- [x] Ride acceptance & status flow
- [x] Earnings dashboard

### Merchant Panel ✅
- [x] Dashboard with KPI stats (orders, revenue, rating)
- [x] Orders management with tabs (Pending, Active, Completed)
- [x] Products catalog with CRUD operations
- [x] Order status updates (Accept, Prepare, Ready)

### Admin Panel ✅
- [x] Dashboard with platform-wide KPIs
- [x] User/Driver/Merchant management
- [x] Driver approval workflow
- [x] Rides & Orders overview

### Dispatcher Panel ✅
- [x] Dark theme control room UI
- [x] Live map (CartoDB dark tiles)
- [x] Online drivers list
- [x] Pending rides/orders
- [x] Manual ride assignment

## Test Credentials
- **Admin**: admin@superapp.com / SuperAdmin123!
- **User**: test2@example.com / TestPass123!
- **Merchant**: merchant@example.com / Merchant123!

## Remaining Backlog

### P0 - Critical
- [ ] WebSocket real-time driver location updates
- [ ] Push notifications
- [ ] Complete payment processing

### P1 - High Priority
- [ ] Driver navigation
- [ ] In-app chat
- [ ] Surge pricing engine

### P2 - Medium Priority
- [ ] Scheduled bookings
- [ ] Coupon/referral system
- [ ] Multi-language support

### P3 - Future Phases
- [ ] Grocery/Pharmacy delivery
- [ ] Home services
- [ ] Premium subscriptions
