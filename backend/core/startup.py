"""
Application startup: lifespan orchestration + DB seeding.

The lifespan was extracted from server.py and split into focused, readable
helpers. The execution ORDER is preserved exactly as before — some seeds
depend on prior ones (e.g. ACL maps the panel demo accounts; the corporate
account references the seeded test user; migrations run after their seeds).
"""
import os
import uuid
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI

from core.config import db, logger, client
from core.deps import hash_password, verify_password, init_storage
from core.seed_data import (
    VEHICLE_CATEGORIES, VEHICLE_TYPES, MASTER_SERVICE_CATEGORIES,
    NEARBY_CATEGORIES, PARCEL_PACKAGE_TYPES, CANCEL_REASONS,
    TRACK_CATEGORIES, APP_CONFIGURATIONS,
)
from core.demo_seed import (
    test_credentials_md, DEMO_MERCHANTS, DEMO_PRODUCTS, PANEL_DEMOS,
    DEMO_COUPONS, DEMO_ADMIN_SEED, CATEGORY_SEEDS, DEMO_DRIVERS_SEED,
)

# Seed functions / background loops owned by their route modules
from routes.drivers import seed_driver_categories
from routes.orders import order_auto_progress_loop
from routes.auto_dispatch import auto_dispatch_loop
from routes.acl import seed_acl
from routes.subscriptions import seed_subscription_plans
from routes.geo import seed_countries
from routes.i18n import seed_i18n
from routes.home_categories import seed_home_categories, seed_home_sections
from routes.promo_banners import seed_promo_banners
from routes.service_categories import seed_service_categories
from routes.store_categories import seed_store_categories
from routes.news import seed_news
from routes.taxi_extra import seed_taxi_extra
from routes.real_estate import seed_real_estate_boost_plans
from routes.pharmacy import seed_pharmacy
from routes.weekly_reports import weekly_report_loop


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _create_indexes():
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


async def _seed_admin_and_credentials():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@superapp.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "SuperAdmin123!")
    existing_admin = await db.users.find_one({"email": admin_email})
    if not existing_admin:
        await db.users.insert_one({
            "id": f"user_{uuid.uuid4().hex[:12]}", "email": admin_email,
            "password_hash": hash_password(admin_password), "name": "Super Admin",
            "role": "admin", "is_verified": True, "created_at": _now()
        })
        logger.info(f"Admin user created: {admin_email}")
    elif not verify_password(admin_password, existing_admin["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    os.makedirs("/app/memory", exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write(test_credentials_md(admin_email, admin_password))


async def _seed_demo_merchants_products():
    for merchant in DEMO_MERCHANTS:
        existing = await db.merchants.find_one({"id": merchant["id"]})
        if not existing:
            await db.merchants.insert_one(merchant)
            logger.info(f"Seeded merchant: {merchant['store_name']}")
        else:
            # Keep demo merchant descriptions in sync (FR)
            await db.merchants.update_one(
                {"id": merchant["id"]},
                {"$set": {"description": merchant["description"]}},
            )
    for product in DEMO_PRODUCTS:
        existing = await db.products.find_one({"id": product["id"]})
        if not existing:
            await db.products.insert_one(product)
        else:
            # Keep demo product name/description/category in sync (FR) without touching price/availability
            await db.products.update_one(
                {"id": product["id"]},
                {"$set": {
                    "name": product["name"],
                    "description": product["description"],
                    "category": product["category"],
                }},
            )


async def _seed_test_and_merchant_users():
    test_email = os.environ.get("SEED_TEST_EMAIL", "test2@example.com")
    test_password = os.environ.get("SEED_TEST_PASSWORD", "TestPass123!")
    if not await db.users.find_one({"email": test_email}):
        test_user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({"id": test_user_id, "email": test_email, "password_hash": hash_password(test_password), "name": "Test User", "phone": "+33123456789", "role": "user", "is_verified": True, "avatar_url": None, "created_at": _now()})
        await db.wallets.insert_one({"user_id": test_user_id, "balance": 50.0, "created_at": _now()})
        logger.info(f"Test user created: {test_email}")

    merchant_email = os.environ.get("SEED_MERCHANT_EMAIL", "merchant@example.com")
    merchant_password = os.environ.get("SEED_MERCHANT_PASSWORD", "Merchant123!")
    if not await db.users.find_one({"email": merchant_email}):
        merchant_user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({"id": merchant_user_id, "email": merchant_email, "password_hash": hash_password(merchant_password), "name": "Demo Merchant", "phone": "+33987654321", "role": "merchant", "is_verified": True, "avatar_url": None, "created_at": _now()})
        await db.wallets.insert_one({"user_id": merchant_user_id, "balance": 0.0, "created_at": _now()})
        logger.info(f"Merchant user created: {merchant_email}")


async def _seed_panel_demos():
    panel_demo_pwd = os.environ.get("SEED_PANEL_PASSWORD", "PanelDemo123!")
    for p in PANEL_DEMOS:
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
                "created_at": _now(),
            })
            logger.info(f"Panel demo created: {p['email']} -> {p['panel_preference']}")


async def _seed_external_referentials():
    try:
        await seed_acl()
        logger.info("ACL seeded (roles + permissions + demo accounts mapped)")
    except Exception as e:
        logger.error(f"ACL seed failed: {e}")
    try:
        await seed_subscription_plans()
        logger.info("Driver subscription plans seeded")
    except Exception as e:
        logger.error(f"Subscription seed failed: {e}")
    try:
        await seed_countries()
        logger.info("Countries seeded from V3Cube SQL")
    except Exception as e:
        logger.error(f"Countries seed failed: {e}")
    try:
        await seed_i18n()
        logger.info("i18n languages + base labels seeded")
    except Exception as e:
        logger.error(f"i18n seed failed: {e}")
    try:
        from routes.newsletter import seed_newsletter
        await seed_newsletter()
        logger.info("Newsletter demo subscribers seeded")
    except Exception as e:
        logger.error(f"Newsletter seed failed: {e}")


async def _seed_v3cube_reference():
    for cat in VEHICLE_CATEGORIES:
        if not await db.vehicle_categories.find_one({"id": cat["id"]}):
            await db.vehicle_categories.insert_one(cat)
    await db.vehicle_categories.create_index("slug", unique=True)

    for vt in VEHICLE_TYPES:
        if not await db.vehicle_types.find_one({"id": vt["id"]}):
            await db.vehicle_types.insert_one(vt)
    await db.vehicle_types.create_index("slug")
    # Backfill: existing gammes default to "open to all driver sub-categories"
    await db.vehicle_types.update_many(
        {"allowed_taxi_subs": {"$exists": False}},
        {"$set": {"allowed_taxi_subs": ["particulier", "vtc", "taxi"]}},
    )

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


async def _seed_demo_coupons():
    for coupon in DEMO_COUPONS:
        if not await db.coupons.find_one({"code": coupon["code"]}):
            await db.coupons.insert_one(coupon)
    await db.coupons.create_index("code", unique=True)
    logger.info("Demo coupons seeded")


async def _seed_collections_if_empty(seed_map: dict):
    """Insert each list into its collection only when the collection is empty."""
    for col_name, items in seed_map.items():
        if await db[col_name].count_documents({}) == 0:
            now_iso = _now()
            for it in items:
                it.setdefault("created_at", now_iso)
            await db[col_name].insert_many(items)
            logger.info(f"Seeded {len(items)} items into {col_name}")


async def _seed_demo_drivers():
    for dd in DEMO_DRIVERS_SEED:
        if not await db.users.find_one({"email": dd["email"]}):
            uid = f"user_{uuid.uuid4().hex[:12]}"
            await db.users.insert_one({
                "id": uid, "email": dd["email"], "password_hash": hash_password("Driver123!"),
                "name": dd["name"], "phone": dd["phone"], "role": "driver",
                "is_verified": True, "created_at": _now(),
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
                "documents": [], "created_at": _now(),
            })
            logger.info(f"Seeded demo driver: {dd['name']}")

    # Migration: normalize legacy driver docs where 'status' was corrupted to 'online'
    norm = await db.drivers.update_many(
        {"status": "online"}, {"$set": {"status": "approved", "is_online": True}}
    )
    if norm.modified_count:
        logger.info(f"Normalized {norm.modified_count} driver(s) status 'online' -> 'approved'")


async def _seed_corporate():
    if not await db.corporate_accounts.find_one({"join_code": "ACME-2026"}):
        corp_id = f"corp_{uuid.uuid4().hex[:10]}"
        await db.corporate_accounts.insert_one({
            "id": corp_id, "name": "ACME Corporation", "join_code": "ACME-2026",
            "billing_email": "finance@acme.example", "contact_phone": "+33140000000",
            "address": "1 Rue de la Paix, Paris 75002", "discount_pct": 10.0,
            "monthly_credit_limit": 5000.0, "credit_used": 0.0,
            "total_rides": 0, "total_revenue": 0.0, "is_active": True,
            "notes": "Compte démo Pack C", "created_at": _now(),
        })
        test_u = await db.users.find_one({"email": os.environ.get("SEED_TEST_EMAIL", "test2@example.com")}, {"_id": 0, "id": 1, "name": 1, "email": 1})
        if test_u:
            await db.corporate_members.insert_one({
                "id": f"cmb_{uuid.uuid4().hex[:10]}", "corporate_id": corp_id,
                "user_id": test_u["id"], "user_email": test_u.get("email"),
                "user_name": test_u.get("name"), "member_role": "manager",
                "status": "active", "created_at": _now(),
            })
        logger.info("Seeded demo corporate account ACME-2026")


async def _run_route_migrations():
    # Migration: route "Courses"/grocery to the dedicated grocery store list (idempotent)
    await db.home_categories.update_many(
        {"key": "grocery-delivery", "target_route": "/food"},
        {"$set": {"target_route": "/food?type=grocery"}},
    )
    await db.promo_banners.update_many(
        {"target_route": "/food"},
        {"$set": {"target_route": "/food?type=grocery"}},
    )
    # Migration: existing drivers without a service type default to all 3
    await db.drivers.update_many(
        {"service_types": {"$exists": False}},
        {"$set": {"service_types": ["taxi", "delivery", "courier"]}},
    )
    await db.drivers.update_many(
        {"service_types": {"$in": [None, []]}},
        {"$set": {"service_types": ["taxi", "delivery", "courier"]}},
    )
    # Migration: legacy "delivery" drivers also cover "courier"
    await db.drivers.update_many(
        {"service_types": "delivery"},
        {"$addToSet": {"service_types": "courier"}},
    )


async def _seed_nearby_businesses_and_routes():
    """Idempotent: ensure ALL demo nearby_businesses exist (upsert by id, so new
    categories are added even when the collection isn't empty), and wire each Home
    'À proximité' tile to its category filter (/nearby?category=<Catégorie>)."""
    # 1) Upsert every demo business by id (adds new categories, keeps existing).
    now_iso = _now()
    for biz in CATEGORY_SEEDS.get("nearby_businesses", []):
        await db.nearby_businesses.update_one(
            {"id": biz["id"]},
            {"$set": {**biz}, "$setOnInsert": {"created_at": now_iso}},
            upsert=True,
        )
    # Backfill is_active on any legacy doc missing the flag.
    await db.nearby_businesses.update_many(
        {"is_active": {"$exists": False}}, {"$set": {"is_active": True}}
    )

    # 2) Ensure each Home 'À proximité' tile exists and points to its category
    #    filter (/nearby?category=<Catégorie>). Idempotent upsert by (section,key)
    #    so this is correct on both existing and freshly-seeded databases.
    from urllib.parse import quote
    # key, label, icon, bg, color, category
    nearby_tiles = [
        ("cafes", "Cafés", "Coffee", "bg-amber-50", "text-amber-600", "Café"),
        ("salons", "Salons", "Scissors", "bg-pink-50", "text-pink-500", "Salon"),
        ("bars", "Bars", "Wine", "bg-purple-50", "text-purple-500", "Bar"),
        ("musees", "Musées", "Bank", "bg-purple-50", "text-purple-500", "Musée"),
        ("attractions", "Attractions", "Confetti", "bg-pink-50", "text-pink-500", "Attraction"),
        ("bibliotheques", "Bibliothèques", "BookOpen", "bg-blue-50", "text-blue-500", "Bibliothèque"),
        ("vie-nocturne", "Vie\nNocturne", "MusicNotes", "bg-fuchsia-50", "text-fuchsia-500", "Vie Nocturne"),
        ("hotels", "Hôtels", "Bed", "bg-rose-50", "text-rose-500", "Hôtel"),
        ("parking", "Parking", "MapPin", "bg-sky-50", "text-sky-500", "Parking"),
        ("garage", "Garage", "Wrench", "bg-slate-50", "text-slate-600", "Garage"),
    ]
    for order, (key, label, icon, bg, color, cat) in enumerate(nearby_tiles):
        route = f"/nearby?category={quote(cat)}"
        await db.home_categories.update_one(
            {"section": "nearby", "key": key},
            {
                "$set": {"target_route": route},
                "$setOnInsert": {
                    "id": f"hcat_{uuid.uuid4().hex[:10]}", "section": "nearby", "key": key,
                    "label_fr": label, "label_en": label, "subtitle_fr": "",
                    "icon_name": icon, "image_url": None, "bg_class": bg,
                    "icon_color_class": color, "display_order": order,
                    "visible_home": True, "status": "active", "created_at": now_iso,
                },
            },
            upsert=True,
        )


async def run_all_seeds():
    """Run the full startup seeding sequence (order matters)."""
    await _create_indexes()
    await _seed_admin_and_credentials()
    await _seed_demo_merchants_products()
    await _seed_test_and_merchant_users()
    await _seed_panel_demos()
    await _seed_external_referentials()

    init_storage()
    logger.info("SuperApp Backend Started (Modular)")

    await _seed_v3cube_reference()
    await _seed_demo_coupons()
    await _seed_collections_if_empty(DEMO_ADMIN_SEED)
    await _seed_collections_if_empty(CATEGORY_SEEDS)
    await _seed_demo_drivers()
    await _seed_corporate()

    await seed_home_categories()        # home categories CMS
    try:
        from routes.home_categories import seed_home_categories_extra
        await seed_home_categories_extra()  # parcel + marketplace editable tiles
    except Exception as e:
        logger.error(f"home_categories extra seed failed: {e}")
    await seed_home_sections()          # home section layout (order + visibility)
    await seed_promo_banners()          # promo banners CMS
    await _seed_nearby_businesses_and_routes()  # nearby commerces + tile category routes
    try:
        await seed_driver_categories()
        logger.info("Driver categories seeded")
    except Exception as e:
        logger.error(f"Driver categories seed failed: {e}")

    await _run_route_migrations()

    await seed_service_categories()     # taxi service categories
    await seed_store_categories()       # store delivery categories
    await seed_news()                   # news/actualités feed
    await seed_taxi_extra()             # ride profiles + business trip reasons
    await seed_real_estate_boost_plans()
    await seed_pharmacy()               # pharmacy partners & OTC catalog
    try:
        from routes.zones import seed_zones
        await seed_zones()              # admin-managed zones + programmed shortcuts
        logger.info("Zones seeded")
    except Exception as e:
        logger.error(f"Zones seed failed: {e}")
    try:
        from routes.transport import seed_transport
        await seed_transport()          # public-transport networks (MOCK data)
        logger.info("Transport (public transit) seeded")
    except Exception as e:
        logger.error(f"Transport seed failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_all_seeds()

    # Background loops
    dispatch_task = asyncio.create_task(auto_dispatch_loop())
    weekly_task = asyncio.create_task(weekly_report_loop())
    order_task = asyncio.create_task(order_auto_progress_loop())

    yield

    for task in (dispatch_task, weekly_task, order_task):
        if task:
            task.cancel()
    client.close()
