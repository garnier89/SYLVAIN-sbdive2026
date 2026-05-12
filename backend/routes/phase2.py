"""Phase 2 Taxi features: Heat View, Destination Mode, Airport surcharge, Flat Rate, Tip, Gift Card, Waybill, Taxi Pool."""
import uuid
import math
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user, require_role

router = APIRouter(prefix="/phase2", tags=["phase2"])


def _haversine_km(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# ═══════════ HEAT VIEW (driver demand density) ═══════════

@router.get("/heatmap")
async def get_demand_heatmap(request: Request):
    """Returns pickup density from pending/active rides in the last hour, aggregated into 0.01° cells."""
    user = await get_current_user(request)
    if user.get("role") not in ("driver", "admin"):
        raise HTTPException(status_code=403, detail="Forbidden")
    from datetime import timedelta
    since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    rides = await db.rides.find(
        {"created_at": {"$gte": since}, "pickup_lat": {"$ne": None}},
        {"_id": 0, "pickup_lat": 1, "pickup_lng": 1, "pickup_address": 1, "status": 1},
    ).to_list(2000)

    cells = {}
    for r in rides:
        lat = round(r["pickup_lat"], 2)
        lng = round(r["pickup_lng"], 2)
        key = f"{lat}_{lng}"
        cells.setdefault(key, {"lat": lat, "lng": lng, "count": 0, "sample_address": r.get("pickup_address", "")})
        cells[key]["count"] += 1

    points = sorted(cells.values(), key=lambda c: -c["count"])[:50]
    return {"points": points, "total_rides": len(rides), "window_hours": 1}


# ═══════════ DESTINATION MODE ═══════════

@router.put("/driver/destination-mode")
async def set_destination_mode(request: Request):
    """Driver enables destination mode: only receive rides toward a target area."""
    user = await get_current_user(request)
    if user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Driver only")
    body = await request.json()
    active = bool(body.get("active", False))
    updates = {"destination_mode_active": active}
    if active:
        updates["destination_mode_target"] = {
            "address": body.get("address", ""),
            "lat": float(body.get("lat") or 0),
            "lng": float(body.get("lng") or 0),
            "radius_km": float(body.get("radius_km", 5)),
        }
    else:
        updates["destination_mode_target"] = None
    await db.drivers.update_one({"user_id": user["id"]}, {"$set": updates})
    return {"message": "Destination mode updated", **updates}


@router.get("/driver/destination-mode")
async def get_destination_mode(request: Request):
    user = await get_current_user(request)
    d = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if d is None:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    return {"active": bool(d.get("destination_mode_active")), "target": d.get("destination_mode_target")}


# ═══════════ AIRPORT ZONES + FLAT RATES (admin config) ═══════════

@router.get("/config/airport-zones")
async def list_airport_zones(request: Request):
    await require_role(request, ["admin"])
    items = await db.airport_zones.find({}, {"_id": 0}).to_list(50)
    return items


@router.post("/config/airport-zones")
async def create_airport_zone(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    doc = {
        "id": f"az_{uuid.uuid4().hex[:10]}",
        "name": body.get("name", "Airport"),
        "lat": float(body.get("lat", 0)),
        "lng": float(body.get("lng", 0)),
        "radius_km": float(body.get("radius_km", 3)),
        "surcharge_amount": float(body.get("surcharge_amount", 0)),
        "active": bool(body.get("active", True)),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.airport_zones.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/config/airport-zones/{zid}")
async def delete_airport_zone(zid: str, request: Request):
    await require_role(request, ["admin"])
    await db.airport_zones.delete_one({"id": zid})
    return {"message": "Deleted"}


@router.get("/config/flat-rates")
async def list_flat_rates(request: Request):
    await require_role(request, ["admin"])
    items = await db.flat_rates.find({}, {"_id": 0}).to_list(100)
    return items


@router.post("/config/flat-rates")
async def create_flat_rate(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    doc = {
        "id": f"fr_{uuid.uuid4().hex[:10]}",
        "name": body.get("name", "Flat Route"),
        "from_lat": float(body.get("from_lat", 0)),
        "from_lng": float(body.get("from_lng", 0)),
        "from_address": body.get("from_address", ""),
        "to_lat": float(body.get("to_lat", 0)),
        "to_lng": float(body.get("to_lng", 0)),
        "to_address": body.get("to_address", ""),
        "radius_km": float(body.get("radius_km", 2)),
        "fare": float(body.get("fare", 0)),
        "active": bool(body.get("active", True)),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.flat_rates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/config/flat-rates/{fid}")
async def delete_flat_rate(fid: str, request: Request):
    await require_role(request, ["admin"])
    await db.flat_rates.delete_one({"id": fid})
    return {"message": "Deleted"}


@router.post("/pricing/quote")
async def airport_flat_quote(request: Request):
    """Public helper: check if a pickup/dropoff matches a flat-rate or airport surcharge."""
    body = await request.json()
    p_lat, p_lng = float(body.get("pickup_lat", 0)), float(body.get("pickup_lng", 0))
    d_lat, d_lng = float(body.get("dropoff_lat", 0)), float(body.get("dropoff_lng", 0))

    # Flat rate
    flats = await db.flat_rates.find({"active": True}, {"_id": 0}).to_list(200)
    for f in flats:
        if _haversine_km(p_lat, p_lng, f["from_lat"], f["from_lng"]) <= f["radius_km"] and \
           _haversine_km(d_lat, d_lng, f["to_lat"], f["to_lng"]) <= f["radius_km"]:
            return {"type": "flat", "name": f["name"], "fare": f["fare"], "matched_id": f["id"]}

    # Airport surcharge
    zones = await db.airport_zones.find({"active": True}, {"_id": 0}).to_list(50)
    surcharge = 0
    matched_zone = None
    for z in zones:
        if _haversine_km(p_lat, p_lng, z["lat"], z["lng"]) <= z["radius_km"] or \
           _haversine_km(d_lat, d_lng, z["lat"], z["lng"]) <= z["radius_km"]:
            if z["surcharge_amount"] > surcharge:
                surcharge = z["surcharge_amount"]
                matched_zone = z["name"]
    if surcharge > 0:
        return {"type": "airport_surcharge", "surcharge": surcharge, "zone": matched_zone}

    return {"type": "standard"}


# ═══════════ TIPS ═══════════

@router.post("/rides/{ride_id}/tip")
async def add_tip(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your ride")
    if ride.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Ride not completed")
    body = await request.json()
    amount = float(body.get("amount", 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid tip amount")
    await db.rides.update_one({"id": ride_id}, {"$set": {"tip_amount": amount}})
    if ride.get("driver_id"):
        await db.drivers.update_one({"id": ride["driver_id"]}, {"$inc": {"earnings": amount, "total_tips": amount}})
    return {"message": "Tip added", "amount": amount}


# ═══════════ GIFT CARDS ═══════════

@router.post("/gift-cards")
async def send_gift_card(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    amount = float(body.get("amount", 0))
    recipient_email = (body.get("recipient_email") or "").strip().lower()
    if amount < 5 or amount > 500:
        raise HTTPException(status_code=400, detail="Amount must be 5-500 EUR")
    if not recipient_email:
        raise HTTPException(status_code=400, detail="Recipient email required")
    code = f"GIFT-{uuid.uuid4().hex[:8].upper()}"
    doc = {
        "id": f"gc_{uuid.uuid4().hex[:10]}",
        "code": code,
        "amount": amount,
        "sender_id": user["id"],
        "sender_name": user.get("name"),
        "recipient_email": recipient_email,
        "recipient_name": body.get("recipient_name", ""),
        "message": (body.get("message") or "").strip()[:200],
        "status": "active",
        "redeemed_by_user_id": None,
        "redeemed_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.gift_cards.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.post("/gift-cards/redeem")
async def redeem_gift_card(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    code = (body.get("code") or "").strip().upper()
    gc = await db.gift_cards.find_one({"code": code}, {"_id": 0})
    if not gc:
        raise HTTPException(status_code=404, detail="Gift card not found")
    if gc.get("status") != "active":
        raise HTTPException(status_code=400, detail="Already redeemed")
    await db.gift_cards.update_one({"code": code}, {"$set": {
        "status": "redeemed",
        "redeemed_by_user_id": user["id"],
        "redeemed_at": datetime.now(timezone.utc).isoformat(),
    }})
    # credit wallet
    await db.wallets.update_one(
        {"user_id": user["id"]},
        {"$inc": {"balance": gc["amount"]}, "$setOnInsert": {"user_id": user["id"]}},
        upsert=True,
    )
    await db.wallet_transactions.insert_one({
        "id": f"wt_{uuid.uuid4().hex[:10]}",
        "user_id": user["id"],
        "amount": gc["amount"],
        "type": "credit",
        "source": "gift_card",
        "reference": code,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"message": "Gift card redeemed", "amount": gc["amount"], "code": code}


@router.get("/gift-cards/my")
async def my_gift_cards_alias(request: Request):
    return await my_gift_cards(request)


@router.get("/gift-cards/mine")
async def my_gift_cards(request: Request):
    user = await get_current_user(request)
    sent = await db.gift_cards.find({"sender_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    received = await db.gift_cards.find({"redeemed_by_user_id": user["id"]}, {"_id": 0}).sort("redeemed_at", -1).to_list(50)
    return {"sent": sent, "received": received}


# ═══════════ WAYBILL ═══════════

@router.get("/rides/{ride_id}/waybill")
async def get_waybill(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    # Auth: passenger, driver, or admin
    is_passenger = ride["user_id"] == user["id"]
    is_admin = user.get("role") == "admin"
    is_driver = False
    if ride.get("driver_id"):
        d = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0, "user_id": 1})
        is_driver = d and d["user_id"] == user["id"]
    if not (is_passenger or is_driver or is_admin):
        raise HTTPException(status_code=403, detail="Forbidden")

    passenger = await db.users.find_one({"id": ride["user_id"]}, {"_id": 0, "name": 1, "email": 1, "phone": 1}) or {}
    driver_user = {}
    driver_doc = {}
    if ride.get("driver_id"):
        driver_doc = await db.drivers.find_one({"id": ride["driver_id"]}, {"_id": 0}) or {}
        driver_user = await db.users.find_one({"id": driver_doc.get("user_id")}, {"_id": 0, "name": 1, "phone": 1}) or {}

    return {
        "waybill_number": f"SBD-{ride['id'][-8:].upper()}",
        "issued_at": datetime.now(timezone.utc).isoformat(),
        "ride": {
            "id": ride["id"],
            "status": ride.get("status"),
            "created_at": ride.get("created_at"),
            "accepted_at": ride.get("accepted_at"),
            "started_at": ride.get("started_at"),
            "completed_at": ride.get("completed_at"),
            "pickup_address": ride.get("pickup_address"),
            "dropoff_address": ride.get("dropoff_address"),
            "distance_km": ride.get("distance_km"),
            "duration_mins": ride.get("duration_mins"),
            "vehicle_type": ride.get("vehicle_type"),
            "payment_method": ride.get("payment_method"),
            "estimated_fare": ride.get("estimated_fare"),
            "final_fare": ride.get("final_fare"),
            "tip_amount": ride.get("tip_amount", 0),
            "stopovers": ride.get("stopovers") or [],
        },
        "passenger": {
            "name": passenger.get("name"),
            "phone": passenger.get("phone"),
            "email": passenger.get("email"),
        },
        "driver": {
            "name": driver_user.get("name"),
            "phone": driver_user.get("phone"),
            "vehicle_model": driver_doc.get("vehicle_model"),
            "vehicle_number": driver_doc.get("vehicle_number"),
            "rating": driver_doc.get("rating"),
        } if driver_doc else None,
        "company": {"name": "SB Drive VTC", "website": "sbdrivevtc.com", "support_email": "support@sbdrivevtc.com"},
    }


# ═══════════ TAXI POOL (shared ride) ═══════════

@router.get("/pool/matches/{ride_id}")
async def find_pool_matches(ride_id: str, request: Request):
    """Find pending taxi-pool rides that overlap with the given ride."""
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your ride")

    candidates = await db.rides.find({
        "status": "pending",
        "pool_enabled": True,
        "id": {"$ne": ride_id},
        "vehicle_type": ride.get("vehicle_type"),
    }, {"_id": 0}).to_list(100)

    matches = []
    for c in candidates:
        pickup_dist = _haversine_km(ride["pickup_lat"], ride["pickup_lng"], c["pickup_lat"], c["pickup_lng"])
        drop_dist = _haversine_km(ride["dropoff_lat"], ride["dropoff_lng"], c["dropoff_lat"], c["dropoff_lng"])
        if pickup_dist <= 2 and drop_dist <= 3:
            matches.append({
                "ride_id": c["id"],
                "pickup_distance_km": round(pickup_dist, 2),
                "dropoff_distance_km": round(drop_dist, 2),
                "pickup_address": c.get("pickup_address"),
                "dropoff_address": c.get("dropoff_address"),
                "fare": c.get("estimated_fare"),
            })
    matches.sort(key=lambda x: x["pickup_distance_km"] + x["dropoff_distance_km"])
    return {"matches": matches[:10], "your_ride_id": ride_id}


@router.put("/pool/enable/{ride_id}")
async def enable_pool(ride_id: str, request: Request):
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your ride")
    body = await request.json()
    enabled = bool(body.get("enabled", True))
    new_fare = ride.get("estimated_fare", 0) * 0.7 if enabled else ride.get("estimated_fare", 0)
    await db.rides.update_one({"id": ride_id}, {"$set": {"pool_enabled": enabled, "estimated_fare": new_fare}})
    return {"message": "Pool updated", "enabled": enabled, "new_fare": new_fare}


# ═══════════ ALIASES for UI-expected endpoints ═══════════

@router.get("/loyalty/me")
async def my_loyalty(request: Request):
    """Return loyalty points + tier for the current user."""
    user = await get_current_user(request)
    # Count completed rides as base for loyalty
    rides = await db.rides.count_documents({"user_id": user["id"], "status": "completed"})
    orders = await db.orders.count_documents({"user_id": user["id"], "status": "delivered"})
    points = rides * 10 + orders * 5
    tiers = [
        {"name": "Bronze", "min": 0, "max": 99, "color": "#CD7F32", "perks": ["Offres exclusives"]},
        {"name": "Argent", "min": 100, "max": 299, "color": "#C0C0C0", "perks": ["-5% sur courses", "Support prioritaire"]},
        {"name": "Or", "min": 300, "max": 699, "color": "#FFD700", "perks": ["-10% sur courses", "Chauffeur favori illimité"]},
        {"name": "Platine", "min": 700, "max": 99999, "color": "#E5E4E2", "perks": ["-15% sur courses", "Accès VIP", "Annulation gratuite"]},
    ]
    current = next((t for t in tiers if t["min"] <= points <= t["max"]), tiers[0])
    next_tier = next((t for t in tiers if t["min"] > points), None)
    return {
        "user_id": user["id"],
        "points": points,
        "total_rides": rides,
        "total_orders": orders,
        "tier": current,
        "next_tier": next_tier,
        "points_to_next": (next_tier["min"] - points) if next_tier else 0,
    }


@router.get("/referral/me")
async def my_referral(request: Request):
    """Proxy to referral stats — fail-soft default."""
    user = await get_current_user(request)
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "referral_code_own": 1}) or {}
    code = u.get("referral_code_own")
    if not code:
        import secrets
        code = f"SB{secrets.token_hex(3).upper()}"
        await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code_own": code}})
    count = await db.referrals.count_documents({"referrer_id": user["id"]})
    earnings = await db.referrals.aggregate([
        {"$match": {"referrer_id": user["id"]}},
        {"$group": {"_id": None, "total": {"$sum": "$reward_amount"}}}
    ]).to_list(1)
    return {
        "code": code,
        "total_referrals": count,
        "total_earnings": (earnings[0]["total"] if earnings else 0) or 0,
        "reward_per_referral": 5,
        "share_url": f"https://sbdrivevtc.com/r/{code}",
    }


@router.get("/subscriptions/plans")
async def list_subscription_plans():
    """Static marketplace subscription plans (admin-editable via service_configs)."""
    cfg = await db.service_configs.find_one({"service_key": "subscriptions"}, {"_id": 0}) or {}
    plans = (cfg.get("settings") or {}).get("plans")
    if not plans:
        plans = [
            {"id": "sb_basic", "name": "SB Basic", "price_month": 0, "benefits": ["Tarifs standards", "Support email"]},
            {"id": "sb_plus", "name": "SB Plus", "price_month": 9.99, "benefits": ["-10% sur courses", "Annulation gratuite", "Chauffeur favori"]},
            {"id": "sb_premium", "name": "SB Premium", "price_month": 19.99, "benefits": ["-15% sur courses", "Support prioritaire 24/7", "Accès VIP aéroport", "Réservation garantie"]},
        ]
    return plans


@router.get("/safety/emergency-contacts")
async def my_emergency_contacts_alias(request: Request):
    """Alias of phase1 emergency-contacts."""
    user = await get_current_user(request)
    contacts = await db.emergency_contacts.find({"user_id": user["id"]}, {"_id": 0}).to_list(10)
    return contacts


@router.get("/favorites/drivers")
async def my_favorite_drivers_alias(request: Request):
    """Alias of phase1 favorite-drivers."""
    user = await get_current_user(request)
    favs = await db.favorite_drivers.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    return favs


# ═══════════ RUNNER / COURIER ═══════════

@router.post("/runner/book")
async def book_runner(request: Request):
    """Book a courier for simple or multi-stop delivery."""
    user = await get_current_user(request)
    body = await request.json()

    mode = body.get("mode", "simple")
    pickup = {
        "address": (body.get("pickup_address") or "").strip(),
        "lat": body.get("pickup_lat"),
        "lng": body.get("pickup_lng"),
        "note": body.get("pickup_note", ""),
    }
    if not pickup["address"] or pickup["lat"] is None:
        raise HTTPException(status_code=400, detail="pickup required")

    drops = body.get("drops") or []
    if not drops:
        raise HTTPException(status_code=400, detail="at least one drop required")

    requested_service_type = (body.get("service_type") or "runner").lower()
    if requested_service_type not in ("runner", "genie"):
        requested_service_type = "runner"

    doc = {
        "id": f"runner_{uuid.uuid4().hex[:10]}",
        "user_id": user["id"],
        "user_name": user.get("name"),
        "user_phone": user.get("phone"),
        "service_type": requested_service_type,
        "mode": mode,
        "package_type": body.get("package_type", "document"),
        "pickup": pickup,
        "drops": drops[:5],
        "estimated_fare": float(body.get("estimated_fare") or 0),
        "status": "pending",
        "driver_id": None,
        "payment_method": body.get("payment_method", "cash"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.runner_orders.insert_one(doc)
    doc.pop("_id", None)
    return {"message": "Coursier commandé", "order": doc}


@router.get("/runner/my")
async def my_runner_orders(request: Request):
    user = await get_current_user(request)
    items = await db.runner_orders.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return items


# ═══════════ PUBLIC CATALOGS (read-only) ═══════════

PUBLIC_CATALOGS = {
    "beauty_salons", "pet_providers", "car_services", "towing_partners",
    "nearby_businesses", "ondemand_services", "carpool_trips", "marketplace_listings",
}

@router.get("/catalogs/{collection}")
async def list_public_catalog(collection: str, limit: int = 100, skip: int = 0):
    if collection not in PUBLIC_CATALOGS:
        raise HTTPException(status_code=404, detail="Catalog not found")
    # Auto-expire featured listings whose featured_until is in the past
    now_iso = datetime.now(timezone.utc).isoformat()
    await db[collection].update_many(
        {"is_featured": True, "featured_until": {"$lt": now_iso}},
        {"$set": {"is_featured": False}},
    )
    cursor = db[collection].find({}, {"_id": 0}).sort([
        ("is_featured", -1),
        ("featured_priority", -1),
        ("created_at", -1),
    ]).skip(skip).limit(limit)
    return await cursor.to_list(limit)


@router.post("/admin/catalogs/{collection}/{item_id}/feature")
async def admin_feature_catalog_item(collection: str, item_id: str, request: Request):
    """Admin endpoint to mark an item as featured for N days (default 30).
    Body: { duration_days: int (optional), priority: int (optional, default 0) }
    """
    from core.deps import require_role
    await require_role(request, ["admin"])
    if collection not in PUBLIC_CATALOGS:
        raise HTTPException(status_code=404, detail="Catalog not found")
    body = await request.json() if await request.body() else {}
    duration_days = int(body.get("duration_days", 30))
    priority = int(body.get("priority", 0))
    until = (datetime.now(timezone.utc) + timedelta(days=duration_days)).isoformat()
    result = await db[collection].update_one(
        {"id": item_id},
        {"$set": {
            "is_featured": True,
            "featured_until": until,
            "featured_priority": priority,
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Featured", "featured_until": until, "priority": priority}


@router.delete("/admin/catalogs/{collection}/{item_id}/feature")
async def admin_unfeature_catalog_item(collection: str, item_id: str, request: Request):
    from core.deps import require_role
    await require_role(request, ["admin"])
    if collection not in PUBLIC_CATALOGS:
        raise HTTPException(status_code=404, detail="Catalog not found")
    result = await db[collection].update_one(
        {"id": item_id},
        {"$set": {"is_featured": False, "featured_until": None, "featured_priority": 0}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Unfeatured"}


@router.get("/admin/catalogs/{collection}/featured")
async def admin_list_featured(collection: str, request: Request):
    """Returns featured + expired items for the admin management panel."""
    from core.deps import require_role
    await require_role(request, ["admin"])
    if collection not in PUBLIC_CATALOGS:
        raise HTTPException(status_code=404, detail="Catalog not found")
    # Apply auto-expiry pass first
    now_iso = datetime.now(timezone.utc).isoformat()
    await db[collection].update_many(
        {"is_featured": True, "featured_until": {"$lt": now_iso}},
        {"$set": {"is_featured": False}},
    )
    items = await db[collection].find(
        {"is_featured": True}, {"_id": 0}
    ).to_list(200)
    return items


# ═══════════ TAXI BIDDING — LIVE INDICATORS ═══════════

@router.get("/taxi-bidding/live-stats")
async def taxi_bidding_live_stats(request: Request, lat: float = None, lng: float = None, radius_km: float = 15):
    """Returns number of online drivers nearby + average accepted fare on last 10 rides.
    Used by TaxiBiddingPage to show users realistic fare expectations.
    """
    # Count online drivers within radius (haversine proxy: simple bounding box ~0.135deg per 15km)
    deg = max(0.1, radius_km / 111.0)
    query = {"is_online": True, "status": "approved"}
    if lat is not None and lng is not None:
        query["current_lat"] = {"$gte": lat - deg, "$lte": lat + deg}
        query["current_lng"] = {"$gte": lng - deg, "$lte": lng + deg}
    online_drivers = await db.drivers.count_documents(query)

    # Average accepted fare on last 10 completed rides
    cursor = db.rides.find({"status": "completed", "final_fare": {"$gt": 0}}, {"_id": 0, "final_fare": 1}).sort("created_at", -1).limit(10)
    fares = [r["final_fare"] async for r in cursor]
    avg_fare = round(sum(fares) / len(fares), 2) if fares else None

    # Acceptance rate estimate = ratio of rides that were negotiated and completed
    negotiated = await db.rides.count_documents({"proposed_fare": {"$ne": None}})
    accepted = await db.rides.count_documents({"proposed_fare": {"$ne": None}, "status": "completed"})
    acceptance = round((accepted / negotiated) * 100) if negotiated > 0 else None

    return {
        "online_drivers_nearby": online_drivers,
        "avg_accepted_fare": avg_fare,
        "avg_fare_samples": len(fares),
        "acceptance_rate_percent": acceptance,
        "radius_km": radius_km,
    }
