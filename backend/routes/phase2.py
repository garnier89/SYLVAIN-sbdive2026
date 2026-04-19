"""Phase 2 Taxi features: Heat View, Destination Mode, Airport surcharge, Flat Rate, Tip, Gift Card, Waybill, Taxi Pool."""
import uuid
import math
from datetime import datetime, timezone
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
    d = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0, "destination_mode_active": 1, "destination_mode_target": 1})
    if not d:
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
