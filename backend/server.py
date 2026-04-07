from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect
from starlette.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
import uuid
from datetime import datetime, timezone

from core.config import db, logger, client, FRONTEND_URL
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

## Admin Account
- Email: {admin_email}
- Password: {admin_password}
- Role: admin

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
    test_email, test_password = "test2@example.com", "TestPass123!"
    if not await db.users.find_one({"email": test_email}):
        test_user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({"id": test_user_id, "email": test_email, "password_hash": hash_password(test_password), "name": "Test User", "phone": "+33123456789", "role": "user", "is_verified": True, "avatar_url": None, "created_at": datetime.now(timezone.utc).isoformat()})
        await db.wallets.insert_one({"user_id": test_user_id, "balance": 50.0, "created_at": datetime.now(timezone.utc).isoformat()})
        logger.info(f"Test user created: {test_email}")

    # Seed merchant user
    merchant_email, merchant_password = "merchant@example.com", "Merchant123!"
    if not await db.users.find_one({"email": merchant_email}):
        merchant_user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({"id": merchant_user_id, "email": merchant_email, "password_hash": hash_password(merchant_password), "name": "Demo Merchant", "phone": "+33987654321", "role": "merchant", "is_verified": True, "avatar_url": None, "created_at": datetime.now(timezone.utc).isoformat()})
        await db.wallets.insert_one({"user_id": merchant_user_id, "balance": 0.0, "created_at": datetime.now(timezone.utc).isoformat()})
        logger.info(f"Merchant user created: {merchant_email}")

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

    yield
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

app.include_router(api_router)

# WebSocket (not behind /api prefix)
@app.websocket("/ws/{client_id}")
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
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)
