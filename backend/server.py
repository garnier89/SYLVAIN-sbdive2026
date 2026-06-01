from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect
from starlette.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import uuid
from datetime import datetime, timezone, timedelta

from core.config import db, logger, client, CORS_ORIGINS
from core.deps import hash_password, verify_password, init_storage
from core.websocket import manager

from routes.auth import router as auth_router, users_router
from routes.drivers import router as drivers_router
from routes.merchants import router as merchants_router
from routes.rides import router as rides_router
from routes.orders import router as orders_router
from routes.misc import router as misc_router
from routes.marketplace import router as marketplace_router
from routes.carpool import router as carpool_router
from routes.services import router as services_router
from routes.config import router as config_router
from routes.wallet import router as wallet_router
from routes.coupons import router as coupons_router
from routes.referral import router as referral_router
from routes.payments import router as payments_router
from routes.webhooks import router as webhooks_router
from routes.features import router as features_router
from routes.simulation import router as simulation_router
from routes.gojek_services import router as gojek_services_router
from routes.cart import router as cart_router
from routes.admin import router as admin_router
from routes.phase1 import router as phase1_router
from routes.phase2 import router as phase2_router
from routes.finance import router as finance_router
from routes.auto_dispatch import router as auto_dispatch_router, auto_dispatch_loop
from routes.kiosk import router as kiosk_router

from core.seed_data import (
    VEHICLE_CATEGORIES, VEHICLE_TYPES, MASTER_SERVICE_CATEGORIES,
    NEARBY_CATEGORIES, PARCEL_PACKAGE_TYPES, CANCEL_REASONS,
    TRACK_CATEGORIES, APP_CONFIGURATIONS,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.drivers.create_index("user_id", unique=True)
    await db.merchants.create_index("user_id", unique=True)
    await db.rides.create_index([("status", 1), ("created_at", -1)])
    await db.orders.create_index([("status", 1), ("created_at", -1)])
    await db.login_attempts.create_index("identifier")
    await db.referrals.create_index("referrer_id")
    await db.referrals.create_index("referred_id", unique=True, sparse=True)
    await db.users.create_index("referral_code_own", unique=True, sparse=True)

    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@superapp.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "SuperAdmin123!")
    existing_admin = await db.users.find_one({"email": admin_email})
    if not existing_admin:
        await db.users.insert_one({
            "id": f"user_{uuid.uuid4().hex[:12]}", "email": admin_email,
            "password_hash": hash_password(admin_password), "name": "Super Admin",
            "role": "admin", "is_verified": True, "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Admin user created: {admin_email}")
    elif not verify_password(admin_password, existing_admin["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    # Write test credentials
    os.makedirs("/app/memory", exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write(f"""# Test Credentials

## Super Admin Account
- Email: {admin_email}
- Password: {admin_password}
- Role: admin

## Driver Test Account (phone login)
- Phone: +33644112233
- Password: Chauffeur2026!

## Demo Drivers (Driver123!)
- jean.dupont@demo.sb / amadou.diallo@demo.sb / sophie.martin@demo.sb

## Merchant Demo
- Email: merchant@example.com / Password: Merchant123!

## SB Drive Tab — Borne TAB CLIC
- PIN unlock: 1234 (URL: /kiosk)

## Phase B — Comptes Demo Web Panels (password: PanelDemo123!)
- dispatch@superapp.com -> /dispatch (Dispatcher)
- billing@superapp.com -> /billing (Comptabilite)
- sysadmin@superapp.com -> /server (Sys Admin)
- crm-users@superapp.com -> /users-admin (CRM Clients)
- crm-drivers@superapp.com -> /drivers-admin (CRM Chauffeurs)
- crm-merchants@superapp.com -> /merchants-admin (CRM Marchands)

## Auth Endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- POST /api/auth/refresh
""")

    # Seed demo merchants
    demo_merchants = [
        {"id": "merchant_burger_palace", "user_id": "system_burger", "store_name": "Burger Palace", "store_type": "restaurant", "address": "123 Main Street, Paris", "lat": 48.8566, "lng": 2.3522, "description": "Premium gourmet burgers and sides", "rating": 4.8, "total_orders": 1250, "is_active": True, "opening_hours": "09:00-22:00", "image_url": "https://images.unsplash.com/photo-1632898657999-ae6920976661?w=400", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "merchant_pizza_heaven", "user_id": "system_pizza", "store_name": "Pizza Heaven", "store_type": "restaurant", "address": "456 Oak Avenue, Paris", "lat": 48.8606, "lng": 2.3376, "description": "Authentic Italian pizza baked in wood-fired oven", "rating": 4.5, "total_orders": 890, "is_active": True, "opening_hours": "10:00-23:00", "image_url": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "merchant_sushi_master", "user_id": "system_sushi", "store_name": "Sushi Master", "store_type": "restaurant", "address": "789 Elm Road, Paris", "lat": 48.8530, "lng": 2.3499, "description": "Fresh Japanese sushi and sashimi", "rating": 4.9, "total_orders": 2100, "is_active": True, "opening_hours": "11:00-22:00", "image_url": "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400", "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    demo_products = [
        {"id": "prod_bp_classic", "merchant_id": "merchant_burger_palace", "name": "Classic Burger", "description": "Juicy beef patty with fresh lettuce, tomato, and special sauce", "price": 12.99, "category": "Burgers", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_bp_cheese", "merchant_id": "merchant_burger_palace", "name": "Cheese Burger", "description": "Classic burger topped with melted cheddar cheese", "price": 14.99, "category": "Burgers", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_bp_bacon", "merchant_id": "merchant_burger_palace", "name": "Bacon Burger", "description": "Loaded with crispy bacon strips and BBQ sauce", "price": 16.99, "category": "Burgers", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_bp_veggie", "merchant_id": "merchant_burger_palace", "name": "Veggie Burger", "description": "Plant-based patty with avocado and sprouts", "price": 13.99, "category": "Burgers", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_bp_fries", "merchant_id": "merchant_burger_palace", "name": "French Fries", "description": "Crispy golden fries with sea salt", "price": 4.99, "category": "Sides", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_bp_rings", "merchant_id": "merchant_burger_palace", "name": "Onion Rings", "description": "Beer-battered onion rings", "price": 5.99, "category": "Sides", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_bp_cola", "merchant_id": "merchant_burger_palace", "name": "Coca Cola", "description": "Ice cold refreshment", "price": 2.99, "category": "Drinks", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_bp_shake", "merchant_id": "merchant_burger_palace", "name": "Milkshake", "description": "Creamy vanilla milkshake", "price": 5.99, "category": "Drinks", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_ph_margherita", "merchant_id": "merchant_pizza_heaven", "name": "Margherita Pizza", "description": "Classic tomato sauce with mozzarella and fresh basil", "price": 14.99, "category": "Pizzas", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_ph_pepperoni", "merchant_id": "merchant_pizza_heaven", "name": "Pepperoni Pizza", "description": "Loaded with pepperoni slices and melted cheese", "price": 16.99, "category": "Pizzas", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_ph_four_cheese", "merchant_id": "merchant_pizza_heaven", "name": "Four Cheese Pizza", "description": "Mozzarella, gorgonzola, parmesan, and fontina", "price": 18.99, "category": "Pizzas", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_ph_garlic_bread", "merchant_id": "merchant_pizza_heaven", "name": "Garlic Bread", "description": "Crispy bread with garlic butter and herbs", "price": 5.99, "category": "Sides", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_ph_tiramisu", "merchant_id": "merchant_pizza_heaven", "name": "Tiramisu", "description": "Classic Italian coffee-flavored dessert", "price": 7.99, "category": "Desserts", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_sm_salmon", "merchant_id": "merchant_sushi_master", "name": "Salmon Nigiri (6pc)", "description": "Fresh salmon on seasoned rice", "price": 12.99, "category": "Nigiri", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_sm_tuna", "merchant_id": "merchant_sushi_master", "name": "Tuna Sashimi (8pc)", "description": "Premium bluefin tuna slices", "price": 16.99, "category": "Sashimi", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_sm_california", "merchant_id": "merchant_sushi_master", "name": "California Roll (8pc)", "description": "Crab, avocado, and cucumber roll", "price": 10.99, "category": "Rolls", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_sm_dragon", "merchant_id": "merchant_sushi_master", "name": "Dragon Roll (8pc)", "description": "Shrimp tempura, avocado, eel sauce", "price": 14.99, "category": "Rolls", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_sm_miso", "merchant_id": "merchant_sushi_master", "name": "Miso Soup", "description": "Traditional Japanese miso with tofu and seaweed", "price": 3.99, "category": "Sides", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "prod_sm_edamame", "merchant_id": "merchant_sushi_master", "name": "Edamame", "description": "Steamed soybeans with sea salt", "price": 4.99, "category": "Sides", "is_available": True, "image_url": None, "created_at": datetime.now(timezone.utc).isoformat()},
    ]

    for merchant in demo_merchants:
        if not await db.merchants.find_one({"id": merchant["id"]}):
            await db.merchants.insert_one(merchant)
            logger.info(f"Seeded merchant: {merchant['store_name']}")
    for product in demo_products:
        if not await db.products.find_one({"id": product["id"]}):
            await db.products.insert_one(product)

    # Seed test user
    test_email = os.environ.get("SEED_TEST_EMAIL", "test2@example.com")
    test_password = os.environ.get("SEED_TEST_PASSWORD", "TestPass123!")
    if not await db.users.find_one({"email": test_email}):
        test_user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({"id": test_user_id, "email": test_email, "password_hash": hash_password(test_password), "name": "Test User", "phone": "+33123456789", "role": "user", "is_verified": True, "avatar_url": None, "created_at": datetime.now(timezone.utc).isoformat()})
        await db.wallets.insert_one({"user_id": test_user_id, "balance": 50.0, "created_at": datetime.now(timezone.utc).isoformat()})
        logger.info(f"Test user created: {test_email}")

    # Seed merchant user
    merchant_email = os.environ.get("SEED_MERCHANT_EMAIL", "merchant@example.com")
    merchant_password = os.environ.get("SEED_MERCHANT_PASSWORD", "Merchant123!")
    if not await db.users.find_one({"email": merchant_email}):
        merchant_user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({"id": merchant_user_id, "email": merchant_email, "password_hash": hash_password(merchant_password), "name": "Demo Merchant", "phone": "+33987654321", "role": "merchant", "is_verified": True, "avatar_url": None, "created_at": datetime.now(timezone.utc).isoformat()})
        await db.wallets.insert_one({"user_id": merchant_user_id, "balance": 0.0, "created_at": datetime.now(timezone.utc).isoformat()})
        logger.info(f"Merchant user created: {merchant_email}")

    # Seed 6 panel-specific admin demo accounts (Phase B)
    # Each has role='admin' but a `panel_preference` field so LoginPage can redirect to their home panel.
    panel_demos = [
        {"email": "dispatch@superapp.com",  "name": "Demo Dispatcher", "panel_preference": "/dispatch"},
        {"email": "billing@superapp.com",   "name": "Demo Comptable",  "panel_preference": "/billing"},
        {"email": "sysadmin@superapp.com",  "name": "Demo Sys Admin",  "panel_preference": "/server"},
        {"email": "crm-users@superapp.com", "name": "Demo CRM Clients", "panel_preference": "/users-admin"},
        {"email": "crm-drivers@superapp.com", "name": "Demo CRM Chauffeurs", "panel_preference": "/drivers-admin"},
        {"email": "crm-merchants@superapp.com", "name": "Demo CRM Marchands", "panel_preference": "/merchants-admin"},
    ]
    panel_demo_pwd = os.environ.get("SEED_PANEL_PASSWORD", "PanelDemo123!")
    for p in panel_demos:
        if not await db.users.find_one({"email": p["email"]}):
            await db.users.insert_one({
                "id": f"user_{uuid.uuid4().hex[:12]}",
                "email": p["email"],
                "password_hash": hash_password(panel_demo_pwd),
                "name": p["name"],
                "phone": None,
                "role": "admin",
                "is_verified": True,
                "panel_preference": p["panel_preference"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"Panel demo created: {p['email']} -> {p['panel_preference']}")

    init_storage()
    logger.info("SuperApp Backend Started (Modular)")

    # Seed V3Cube reference data
    for cat in VEHICLE_CATEGORIES:
        if not await db.vehicle_categories.find_one({"id": cat["id"]}):
            await db.vehicle_categories.insert_one(cat)
    await db.vehicle_categories.create_index("slug", unique=True)

    for vt in VEHICLE_TYPES:
        if not await db.vehicle_types.find_one({"id": vt["id"]}):
            await db.vehicle_types.insert_one(vt)
    await db.vehicle_types.create_index("slug")

    for mc in MASTER_SERVICE_CATEGORIES:
        if not await db.master_service_categories.find_one({"id": mc["id"]}):
            await db.master_service_categories.insert_one(mc)

    for nc in NEARBY_CATEGORIES:
        if not await db.nearby_categories.find_one({"id": nc["id"]}):
            await db.nearby_categories.insert_one(nc)

    for pt in PARCEL_PACKAGE_TYPES:
        if not await db.parcel_package_types.find_one({"id": pt["id"]}):
            await db.parcel_package_types.insert_one(pt)

    for cr in CANCEL_REASONS:
        if not await db.cancel_reasons.find_one({"id": cr["id"]}):
            await db.cancel_reasons.insert_one(cr)

    for tc in TRACK_CATEGORIES:
        if not await db.track_categories.find_one({"id": tc["id"]}):
            await db.track_categories.insert_one(tc)

    for cfg in APP_CONFIGURATIONS:
        if not await db.app_configurations.find_one({"key": cfg["key"]}):
            await db.app_configurations.insert_one(cfg)

    logger.info("V3Cube seed data loaded")

    # Seed demo coupons from production DB
    demo_coupons = [
        {"id": "coupon_bienvenue", "code": "BIENVENUE", "description": "Code de bienvenue -20%", "discount_type": "Percentage", "discount_value": 20, "max_discount": 10, "usage_limit": 0, "per_user_limit": 1, "used": 0, "service_type": "All", "status": "active", "expiry_date": "2027-12-31T23:59:59", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "coupon_sbdrive10", "code": "SBDRIVE10", "description": "Reduction 10 EUR sur votre course", "discount_type": "Flat", "discount_value": 10, "max_discount": 10, "usage_limit": 100, "per_user_limit": 1, "used": 0, "service_type": "Ride", "status": "active", "expiry_date": "2027-12-31T23:59:59", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "coupon_novembre", "code": "NOVEMBRE", "description": "Promo Novembre -15%", "discount_type": "Percentage", "discount_value": 15, "max_discount": 15, "usage_limit": 200, "per_user_limit": 2, "used": 0, "service_type": "All", "status": "active", "expiry_date": "2027-11-30T23:59:59", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "coupon_1010", "code": "1010", "description": "Code promo 10 EUR", "discount_type": "Flat", "discount_value": 10, "max_discount": 10, "usage_limit": 50, "per_user_limit": 1, "used": 0, "service_type": "Ride", "status": "active", "expiry_date": "2027-12-31T23:59:59", "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    for coupon in demo_coupons:
        if not await db.coupons.find_one({"code": coupon["code"]}):
            await db.coupons.insert_one(coupon)
    await db.coupons.create_index("code", unique=True)
    logger.info("Demo coupons seeded")

    # Seed demo admin data (only if empty — makes admin pages show realistic content)
    demo_admin_seed = {
        "admin_banners": [
            {"id": "ban_welcome", "title": "-20% sur votre première course", "subtitle": "Code SB20 — valable jusqu'au 31/12", "image_url": "", "position": "home_top", "active": True},
            {"id": "ban_free_delivery", "title": "Livraison gratuite", "subtitle": "Ce week-end seulement sur SB Eats", "image_url": "", "position": "food_top", "active": True},
            {"id": "ban_referral", "title": "Parrainez vos amis", "subtitle": "Gagnez 5€ par parrainage", "image_url": "", "position": "home_bottom", "active": True},
        ],
        "admin_payouts": [
            {"id": "pay_001", "driver_name": "Jean Dupont", "amount": 347.50, "rides": 28, "status": "paid", "period": "Sem 15 - Avril 2026", "paid_at": "2026-04-14"},
            {"id": "pay_002", "driver_name": "Amadou Diallo", "amount": 523.00, "rides": 41, "status": "paid", "period": "Sem 15 - Avril 2026", "paid_at": "2026-04-14"},
            {"id": "pay_003", "driver_name": "Sophie Martin", "amount": 189.75, "rides": 15, "status": "pending", "period": "Sem 16 - Avril 2026", "paid_at": None},
            {"id": "pay_004", "driver_name": "Mohamed Ben Ali", "amount": 412.25, "rides": 33, "status": "pending", "period": "Sem 16 - Avril 2026", "paid_at": None},
        ],
        "admin_settlements": [
            {"id": "stl_001", "driver_name": "Jean Dupont", "period": "Sem 15", "rides": 28, "gross": 523.00, "commission": 78.45, "net": 444.55, "status": "settled", "settled_at": "2026-04-14"},
            {"id": "stl_002", "driver_name": "Amadou Diallo", "period": "Sem 15", "rides": 41, "gross": 812.50, "commission": 121.88, "net": 690.63, "status": "settled", "settled_at": "2026-04-14"},
            {"id": "stl_003", "driver_name": "Sophie Martin", "period": "Sem 16", "rides": 15, "gross": 278.00, "commission": 41.70, "net": 236.30, "status": "pending", "settled_at": None},
        ],
        "admin_disputes": [
            {"id": "dis_001", "ride_id": "ride_4521", "user_name": "Marie L.", "driver_name": "Jean D.", "reason": "Tarif incorrect - montant supérieur à l'estimation", "status": "open", "amount": 8.50},
            {"id": "dis_002", "ride_id": "ride_4498", "user_name": "Paul M.", "driver_name": "Amadou D.", "reason": "Chauffeur a fait un détour inutile", "status": "investigating", "amount": 12.00},
            {"id": "dis_003", "ride_id": "ride_4475", "user_name": "Sophie K.", "driver_name": "Claire P.", "reason": "Course annulée mais facturée", "status": "resolved", "amount": 15.00},
        ],
        "admin_wallet_requests": [
            {"id": "wr_001", "user_name": "Jean Dupont", "type": "withdrawal", "amount": 150.00, "status": "pending", "method": "Virement bancaire"},
            {"id": "wr_002", "user_name": "Amadou Diallo", "type": "withdrawal", "amount": 347.50, "status": "pending", "method": "Virement bancaire"},
            {"id": "wr_003", "user_name": "Sophie Martin", "type": "withdrawal", "amount": 89.00, "status": "approved", "method": "PayPal"},
        ],
        "admin_contact_requests": [
            {"id": "con_001", "name": "Julie Moreau", "email": "julie@example.com", "phone": "+33612345678", "subject": "Question sur la facturation", "message": "Bonjour, j'ai une question concernant ma dernière facture...", "status": "new"},
            {"id": "con_002", "name": "Thomas Bernard", "email": "thomas@example.com", "phone": "+33687654321", "subject": "Problème de connexion", "message": "Je n'arrive pas à me connecter à mon compte.", "status": "answered"},
        ],
        "admin_sos_requests": [
            {"id": "sos_demo_001", "user_name": "Demo User", "user_role": "user", "ride_id": "ride_demo", "address": "Paris, France", "lat": 48.8566, "lng": 2.3522, "message": "Test alerte SOS", "status": "resolved"},
        ],
        "admin_documents": [
            {"id": "doc_001", "driver_name": "Jean Dupont", "driver_id": "drv_001", "doc_type": "Carte VTC", "status": "pending", "uploaded_at": "2026-04-17", "expires_at": "2027-04-17"},
            {"id": "doc_002", "driver_name": "Amadou Diallo", "driver_id": "drv_002", "doc_type": "Permis de conduire", "status": "approved", "uploaded_at": "2026-03-10", "expires_at": "2031-03-10"},
            {"id": "doc_003", "driver_name": "Sophie Martin", "driver_id": "drv_003", "doc_type": "Assurance véhicule", "status": "pending", "uploaded_at": "2026-04-15", "expires_at": "2027-04-15"},
        ],
    }
    for col_name, items in demo_admin_seed.items():
        if await db[col_name].count_documents({}) == 0:
            now_iso = datetime.now(timezone.utc).isoformat()
            for it in items:
                it.setdefault("created_at", now_iso)
            await db[col_name].insert_many(items)
            logger.info(f"Seeded {len(items)} items into {col_name}")

    # ===== Seed Category-specific demo data (Beauty, Pet, CarCare, Towing, etc.) =====
    category_seeds = {
        "beauty_salons": [
            {"id": "bs_01", "name": "L'Atelier Coiffure", "category": "Coiffure", "address": "12 Rue Saint-Honoré, Paris 75001", "phone": "+33145678901", "rating": 4.8, "price_range": "€€", "services": ["Coupe", "Couleur", "Brushing"], "image": "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400", "open_hours": "9h-19h", "is_featured": True, "featured_until": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(), "featured_priority": 10},
            {"id": "bs_02", "name": "Beauty Spa Marais", "category": "Spa & Massage", "address": "8 Rue de Bretagne, Paris 75003", "phone": "+33142345678", "rating": 4.9, "price_range": "€€€", "services": ["Massage", "Soins visage", "Manucure"], "image": "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=400", "open_hours": "10h-21h"},
            {"id": "bs_03", "name": "Glamour Maquillage", "category": "Maquillage", "address": "25 Bd Saint-Germain, Paris 75005", "phone": "+33143987654", "rating": 4.7, "price_range": "€€", "services": ["Maquillage soirée", "Mariée", "Cours"], "image": "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=400", "open_hours": "11h-20h"},
            {"id": "bs_04", "name": "Barber Shop Pigalle", "category": "Soins Hommes", "address": "3 Rue Frochot, Paris 75009", "phone": "+33148765432", "rating": 4.6, "price_range": "€€", "services": ["Coupe homme", "Taille barbe", "Rasage"], "image": "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400", "open_hours": "10h-20h"},
            {"id": "bs_05", "name": "Nail Studio Opéra", "category": "Manucure", "address": "17 Rue Auber, Paris 75009", "phone": "+33147892345", "rating": 4.5, "price_range": "€", "services": ["Manucure", "Pédicure", "Vernis semi-permanent"], "image": "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400", "open_hours": "10h-19h"},
        ],
        "pet_providers": [
            {"id": "pp_01", "name": "Toilettage Canin du Marais", "category": "Toilettage", "address": "5 Rue Vieille du Temple, Paris 75004", "phone": "+33142111213", "rating": 4.9, "price_range": "€€", "services": ["Bain", "Tonte", "Coupe griffes"], "image": "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=400", "pet_types": ["Chien", "Chat"]},
            {"id": "pp_02", "name": "Dog Walker Paris", "category": "Promenade", "address": "Paris 75011 (mobile)", "phone": "+33645678901", "rating": 4.8, "price_range": "€", "services": ["Promenade 30min", "Promenade 1h", "Garde journée"], "image": "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=400", "pet_types": ["Chien"]},
            {"id": "pp_03", "name": "Pension Féline Bastille", "category": "Pension", "address": "22 Rue de Lyon, Paris 75012", "phone": "+33143222324", "rating": 4.7, "price_range": "€€", "services": ["Pension journalière", "Long séjour"], "image": "https://images.unsplash.com/photo-1574144611937-0df059b5ef3e?w=400", "pet_types": ["Chat"]},
            {"id": "pp_04", "name": "Vétérinaire Express", "category": "Vétérinaire", "address": "10 Av. de la République, Paris 75011", "phone": "+33148334455", "rating": 4.9, "price_range": "€€", "services": ["Consultation", "Vaccins", "Urgences"], "image": "https://images.unsplash.com/photo-1576201836106-db1758fd1c97?w=400", "pet_types": ["Chien", "Chat", "NAC"]},
            {"id": "pp_05", "name": "Pet Shop Premium", "category": "Boutique", "address": "33 Bd Voltaire, Paris 75011", "phone": "+33143556677", "rating": 4.6, "price_range": "€€", "services": ["Croquettes", "Accessoires", "Jouets"], "image": "https://images.unsplash.com/photo-1601758174039-7c5b8b3e7d75?w=400", "pet_types": ["Chien", "Chat", "Oiseau"]},
        ],
        "car_services": [
            {"id": "cs_01", "name": "Lavage Auto Express", "category": "Lavage", "address": "5 Rue de la Roquette, Paris 75011", "phone": "+33142112233", "rating": 4.7, "price_from": 15.0, "services": ["Lavage extérieur", "Intérieur", "Polish"], "image": "https://images.unsplash.com/photo-1605164599901-db7f68c4b7a4?w=400", "duration_mins": 30},
            {"id": "cs_02", "name": "Garage Mécanique Bastille", "category": "Mécanique", "address": "15 Av. Ledru-Rollin, Paris 75012", "phone": "+33143112233", "rating": 4.8, "price_from": 50.0, "services": ["Vidange", "Freins", "Diagnostic"], "image": "https://images.unsplash.com/photo-1486754735734-325b5831c3ad?w=400", "duration_mins": 60, "is_featured": True, "featured_until": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(), "featured_priority": 10},
            {"id": "cs_03", "name": "Pneus 24/7", "category": "Pneumatiques", "address": "8 Bd Diderot, Paris 75012", "phone": "+33144112233", "rating": 4.6, "price_from": 80.0, "services": ["Montage", "Équilibrage", "Géométrie"], "image": "https://images.unsplash.com/photo-1632823469850-2f77dd9c7f93?w=400", "duration_mins": 45},
            {"id": "cs_04", "name": "Auto Battery Service", "category": "Batterie", "address": "Service à domicile Paris", "phone": "+33645223344", "rating": 4.9, "price_from": 120.0, "services": ["Test batterie", "Remplacement", "Dépannage"], "image": "https://images.unsplash.com/photo-1597077962467-be16edbab6e1?w=400", "duration_mins": 30},
            {"id": "cs_05", "name": "Carburant Mobile", "category": "Carburant", "address": "Service à domicile Paris", "phone": "+33646334455", "rating": 4.7, "price_from": 25.0, "services": ["SP95", "SP98", "Diesel"], "image": "https://images.unsplash.com/photo-1545262810-77515befe149?w=400", "duration_mins": 20},
            {"id": "cs_06", "name": "Pièces Auto Pro", "category": "Boutique", "address": "44 Rue de Charenton, Paris 75012", "phone": "+33145443322", "rating": 4.5, "price_from": 10.0, "services": ["Pièces neuves", "Pièces occasion", "Accessoires"], "image": "https://images.unsplash.com/photo-1486326658981-ed68abe5868e?w=400", "duration_mins": 0},
        ],
        "towing_partners": [
            {"id": "tw_01", "name": "Dépann'Express 24/7", "address": "Île-de-France", "phone": "+33800111222", "rating": 4.8, "response_time_mins": 30, "services": ["Remorquage", "Démarrage", "Pneu crevé"], "available_24h": True, "price_from": 80.0, "is_featured": True, "featured_until": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(), "featured_priority": 10},
            {"id": "tw_02", "name": "Auto Secours Paris", "address": "Paris intra-muros", "phone": "+33800333444", "rating": 4.7, "response_time_mins": 25, "services": ["Remorquage moto/auto", "Panne sèche"], "available_24h": True, "price_from": 70.0},
            {"id": "tw_03", "name": "Roadside Pro", "address": "Banlieue Est & Sud", "phone": "+33800555666", "rating": 4.6, "response_time_mins": 40, "services": ["Remorquage longue distance", "Convoyage"], "available_24h": False, "price_from": 100.0},
            {"id": "tw_04", "name": "Allo Dépanneur", "address": "Banlieue Ouest & Nord", "phone": "+33800777888", "rating": 4.9, "response_time_mins": 20, "services": ["Démarrage", "Ouverture portière", "Carburant"], "available_24h": True, "price_from": 60.0},
        ],
        "nearby_businesses": [
            {"id": "nb_01", "name": "Café de Flore", "category": "Café", "address": "172 Bd Saint-Germain, Paris 75006", "rating": 4.5, "distance_km": 0.8, "image": "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400", "open_now": True},
            {"id": "nb_02", "name": "Bar Le Mary Celeste", "category": "Bar", "address": "1 Rue Commines, Paris 75003", "rating": 4.7, "distance_km": 1.2, "image": "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400", "open_now": True},
            {"id": "nb_03", "name": "Salon Pure Beauty", "category": "Salon", "address": "10 Rue de Rivoli, Paris 75004", "rating": 4.6, "distance_km": 0.5, "image": "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=400", "open_now": True},
            {"id": "nb_04", "name": "Boulangerie du Coin", "category": "Boulangerie", "address": "5 Rue de Turenne, Paris 75004", "rating": 4.8, "distance_km": 0.3, "image": "https://images.unsplash.com/photo-1568254183919-78a4f43a2877?w=400", "open_now": True},
            {"id": "nb_05", "name": "Pharmacie Centrale", "category": "Pharmacie", "address": "21 Rue Saint-Antoine, Paris 75004", "rating": 4.4, "distance_km": 0.7, "image": "https://images.unsplash.com/photo-1631549916768-4119b4123a21?w=400", "open_now": True},
            {"id": "nb_06", "name": "Le Petit Bistrot", "category": "Restaurant", "address": "33 Rue des Archives, Paris 75004", "rating": 4.6, "distance_km": 1.0, "image": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400", "open_now": False},
        ],
        "ondemand_services": [
            {"id": "od_01", "name": "Bricoleur Express", "category": "Bricolage", "rating": 4.8, "price_from": 35.0, "price_unit": "/h", "image": "https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400", "services": ["Montage meuble", "Petite réparation", "Étagère"]},
            {"id": "od_02", "name": "Massage à Domicile", "category": "Bien-être", "rating": 4.9, "price_from": 60.0, "price_unit": "/séance", "image": "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400", "services": ["Relaxant", "Sportif", "Thaïlandais"]},
            {"id": "od_03", "name": "Mécano à Domicile", "category": "Auto", "rating": 4.7, "price_from": 50.0, "price_unit": "/h", "image": "https://images.unsplash.com/photo-1486754735734-325b5831c3ad?w=400", "services": ["Diagnostic", "Petite réparation", "Vidange"]},
            {"id": "od_04", "name": "Ménage à la Demande", "category": "Ménage", "rating": 4.8, "price_from": 25.0, "price_unit": "/h", "image": "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400", "services": ["Ménage régulier", "Grand nettoyage", "Vitres"]},
            {"id": "od_05", "name": "Cours de Yoga", "category": "Sport", "rating": 4.9, "price_from": 40.0, "price_unit": "/cours", "image": "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=400", "services": ["Hatha", "Vinyasa", "Méditation"]},
            {"id": "od_06", "name": "Coach Sportif", "category": "Sport", "rating": 4.8, "price_from": 50.0, "price_unit": "/séance", "image": "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400", "services": ["Musculation", "Cardio", "Perte de poids"]},
        ],
        "carpool_trips": [
            {"id": "cp_01", "driver_name": "Marc D.", "driver_rating": 4.9, "from_city": "Paris", "to_city": "Lyon", "departure_at": "2026-04-25T08:00:00Z", "seats_available": 3, "price_per_seat": 35.0, "vehicle": "Peugeot 508", "duration_h": 4.5},
            {"id": "cp_02", "driver_name": "Sophie L.", "driver_rating": 4.8, "from_city": "Paris", "to_city": "Bordeaux", "departure_at": "2026-04-26T07:30:00Z", "seats_available": 2, "price_per_seat": 45.0, "vehicle": "Renault Talisman", "duration_h": 5.5},
            {"id": "cp_03", "driver_name": "Karim B.", "driver_rating": 4.7, "from_city": "Paris", "to_city": "Marseille", "departure_at": "2026-04-27T06:00:00Z", "seats_available": 4, "price_per_seat": 50.0, "vehicle": "VW Passat", "duration_h": 7.5},
            {"id": "cp_04", "driver_name": "Émilie R.", "driver_rating": 5.0, "from_city": "Lyon", "to_city": "Paris", "departure_at": "2026-04-25T15:00:00Z", "seats_available": 2, "price_per_seat": 30.0, "vehicle": "Tesla Model 3", "duration_h": 4.5},
            {"id": "cp_05", "driver_name": "Antoine F.", "driver_rating": 4.6, "from_city": "Nantes", "to_city": "Paris", "departure_at": "2026-04-26T09:00:00Z", "seats_available": 3, "price_per_seat": 40.0, "vehicle": "Citroën C5", "duration_h": 4.0},
        ],
        "marketplace_listings": [
            {"id": "ml_01", "title": "Appartement 3 pièces à louer", "category": "real-estate", "type": "Location", "price": 1450, "currency": "EUR/mois", "location": "Paris 11ème", "image": "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400", "description": "65m², balcon, métro Voltaire"},
            {"id": "ml_02", "title": "Studio meublé", "category": "real-estate", "type": "Location", "price": 850, "currency": "EUR/mois", "location": "Paris 9ème", "image": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400", "description": "25m², proche Opéra"},
            {"id": "ml_03", "title": "Maison à vendre", "category": "real-estate", "type": "Vente", "price": 285000, "currency": "EUR", "location": "Saint-Mandé", "image": "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400", "description": "Maison 4 ch., jardin 200m²"},
            {"id": "ml_04", "title": "Peugeot 308 - 2020", "category": "cars", "type": "Vente", "price": 14500, "currency": "EUR", "location": "Paris", "image": "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400", "description": "45 000 km, essence, première main"},
            {"id": "ml_05", "title": "Tesla Model Y - 2022", "category": "cars", "type": "Vente", "price": 39900, "currency": "EUR", "location": "Boulogne", "image": "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=400", "description": "12 000 km, autonomie 480 km"},
            {"id": "ml_06", "title": "iPhone 14 Pro - 256 Go", "category": "items", "type": "Vente", "price": 850, "currency": "EUR", "location": "Paris", "image": "https://images.unsplash.com/photo-1663499482523-1c0c1bae4ce1?w=400", "description": "Comme neuf, sous garantie"},
            {"id": "ml_07", "title": "Canapé d'angle cuir", "category": "items", "type": "Vente", "price": 480, "currency": "EUR", "location": "Paris", "image": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400", "description": "Très bon état, livraison possible"},
        ],
    }
    for col_name, items in category_seeds.items():
        if await db[col_name].count_documents({}) == 0:
            now_iso = datetime.now(timezone.utc).isoformat()
            for it in items:
                it.setdefault("created_at", now_iso)
            await db[col_name].insert_many(items)
            logger.info(f"Seeded {len(items)} items into {col_name}")

    # Seed demo drivers with users so ranking/priority pages show data
    demo_drivers_seed = [
        {"email": "jean.dupont@demo.sb", "name": "Jean Dupont", "phone": "+33611111111", "vehicle_type": "Car", "vehicle_model": "Peugeot 508", "vehicle_number": "AB-123-CD", "points": 85, "total_trips": 420, "rating": 4.8, "earnings": 3200.50},
        {"email": "amadou.diallo@demo.sb", "name": "Amadou Diallo", "phone": "+33622222222", "vehicle_type": "Car", "vehicle_model": "Renault Talisman", "vehicle_number": "EF-456-GH", "points": 72, "total_trips": 310, "rating": 4.9, "earnings": 2800.00},
        {"email": "sophie.martin@demo.sb", "name": "Sophie Martin", "phone": "+33633333333", "vehicle_type": "Moto", "vehicle_model": "Yamaha MT-07", "vehicle_number": "IJ-789-KL", "points": 55, "total_trips": 180, "rating": 4.7, "earnings": 1500.00},
    ]
    for dd in demo_drivers_seed:
        if not await db.users.find_one({"email": dd["email"]}):
            uid = f"user_{uuid.uuid4().hex[:12]}"
            await db.users.insert_one({
                "id": uid, "email": dd["email"], "password_hash": hash_password("Driver123!"),
                "name": dd["name"], "phone": dd["phone"], "role": "driver",
                "is_verified": True, "created_at": datetime.now(timezone.utc).isoformat(),
            })
            await db.drivers.insert_one({
                "id": f"driver_{uuid.uuid4().hex[:12]}", "user_id": uid,
                "vehicle_type": dd["vehicle_type"], "vehicle_model": dd["vehicle_model"],
                "vehicle_number": dd["vehicle_number"], "license_number": f"LIC-{uuid.uuid4().hex[:6].upper()}",
                "status": "approved", "is_online": False,
                "current_lat": None, "current_lng": None,
                "rating": dd["rating"], "total_trips": dd["total_trips"],
                "earnings": dd["earnings"], "points": dd["points"],
                "acceptance_rate": 90, "cancellation_rate": 5,
                "documents": [], "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"Seeded demo driver: {dd['name']}")

    # Start auto-dispatch background loop
    import asyncio as _asyncio
    dispatch_task = _asyncio.create_task(auto_dispatch_loop())

    yield
    if dispatch_task:
        dispatch_task.cancel()
    client.close()


app = FastAPI(title="SuperApp API", lifespan=lifespan)
api_router = APIRouter(prefix="/api")

# Include all routers
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(drivers_router)
api_router.include_router(merchants_router)
api_router.include_router(rides_router)
api_router.include_router(orders_router)
api_router.include_router(misc_router)
api_router.include_router(marketplace_router)
api_router.include_router(carpool_router)
api_router.include_router(services_router)
api_router.include_router(config_router)
api_router.include_router(wallet_router)
api_router.include_router(coupons_router)
api_router.include_router(referral_router)
api_router.include_router(payments_router)
api_router.include_router(webhooks_router)
api_router.include_router(features_router)
api_router.include_router(simulation_router)
api_router.include_router(gojek_services_router)
api_router.include_router(cart_router)
api_router.include_router(admin_router)
api_router.include_router(phase1_router)
api_router.include_router(phase2_router)
api_router.include_router(finance_router)
api_router.include_router(auto_dispatch_router)
api_router.include_router(kiosk_router)

app.include_router(api_router)

# WebSocket — mounted under /api so it passes through the ingress
@app.websocket("/api/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "location_update":
                manager.update_driver_location(client_id, data["lat"], data["lng"])
                await db.drivers.update_one(
                    {"user_id": client_id},
                    {"$set": {"current_lat": data["lat"], "current_lng": data["lng"]}}
                )
                # Forward location to passenger if driver has active ride
                ride = await db.rides.find_one(
                    {"driver_id": client_id, "status": {"$in": ["accepted", "arriving", "in_progress"]}},
                    {"_id": 0, "id": 1, "user_id": 1}
                )
                if ride:
                    await manager.send_to_ride_room(ride["id"], {
                        "type": "driver_location",
                        "lat": data["lat"],
                        "lng": data["lng"],
                        "ride_id": ride["id"],
                    }, exclude=client_id)
                    await manager.send_personal_message({
                        "type": "driver_location",
                        "lat": data["lat"],
                        "lng": data["lng"],
                        "ride_id": ride["id"],
                    }, ride["user_id"])

            elif msg_type == "join_ride":
                ride_id = data.get("ride_id")
                if ride_id:
                    manager.join_ride_room(ride_id, client_id)
                    await websocket.send_json({"type": "joined_ride", "ride_id": ride_id})

            elif msg_type == "leave_ride":
                ride_id = data.get("ride_id")
                if ride_id:
                    manager.leave_ride_room(ride_id, client_id)

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect(client_id)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS.split(",") if CORS_ORIGINS != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
