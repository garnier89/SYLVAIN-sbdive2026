"""Ride bidding / counter-offer endpoints (extracted from routes/rides.py — Phase 4).

The negotiation flow: a driver proposes a fare (counter-offer) on a pending ride,
the passenger accepts or rejects it. Counter-offers expire after a TTL.

Shared gating helpers (`gamme_restricted_subs`, `driver_sub_allowed`,
`TAXI_SUB_LABELS`, `OFFER_TTL_SECONDS`) are imported from routes.rides where they
are also used by the direct-accept path.
"""
import math
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user
from core.websocket import manager
from routes.rides import (
    OFFER_TTL_SECONDS,
    TAXI_SUB_LABELS,
    gamme_restricted_subs,
    driver_sub_allowed,
)

router = APIRouter(prefix="/rides", tags=["rides"])


async def _get_driver_points_cfg():
    from routes.drivers import _get_rewards_points_config
    return await _get_rewards_points_config()


@router.post("/{ride_id}/counter-offer")
async def driver_counter_offer(ride_id: str, request: Request):
    """Driver proposes a different fare for a pending ride (negotiation)."""
    user = await get_current_user(request)
    if user["role"] != "driver":
        raise HTTPException(status_code=403, detail="Driver only")
    driver = await db.drivers.find_one({"user_id": user["id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Ride is no longer pending")

    # ── Driver sub-category gating (same rule as direct accept) ──
    vtype_doc = await db.vehicle_types.find_one(
        {"slug": ride.get("vehicle_type")}, {"_id": 0, "allowed_taxi_subs": 1}
    )
    allowed_subs = gamme_restricted_subs(vtype_doc)
    if not driver_sub_allowed(driver.get("taxi_sub"), allowed_subs):
        labels = " / ".join(TAXI_SUB_LABELS.get(s, s) for s in sorted(allowed_subs))
        raise HTTPException(
            status_code=403,
            detail=f"Cette course est réservée aux chauffeurs {labels}.",
        )

    body = await request.json()
    amount = float(body.get("amount", 0))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")

    from routes.taxi_configs import get_taxi_config
    bid_cfg = await get_taxi_config("taxi_bid")
    ttl = int(bid_cfg.get("offer_ttl_seconds", OFFER_TTL_SECONDS))

    # Flag offers that match the passenger's proposed fare exactly ("Votre tarif")
    proposed = ride.get("proposed_fare")
    at_proposed_fare = bool(proposed) and abs(amount - float(proposed)) < 0.01

    # Driver photo + distance/ETA to the pickup (so the passenger's bidding list
    # mirrors the V3Cube "Demander" screen: photo, rating, ETA, km, price).
    driver_photo = (
        user.get("avatar_url") or user.get("photo")
        or driver.get("photo_url") or driver.get("selfie_url")
    )
    distance_km = None
    eta_min = None
    d_lat, d_lng = driver.get("current_lat"), driver.get("current_lng")
    p_lat, p_lng = ride.get("pickup_lat"), ride.get("pickup_lng")
    if None not in (d_lat, d_lng, p_lat, p_lng):
        R, to_rad = 6371.0, math.radians
        dlat, dlng = to_rad(p_lat - d_lat), to_rad(p_lng - d_lng)
        h = (math.sin(dlat / 2) ** 2
             + math.cos(to_rad(d_lat)) * math.cos(to_rad(p_lat)) * math.sin(dlng / 2) ** 2)
        distance_km = round(R * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h)), 2)
        eta_min = max(1, round((distance_km / 22) * 60) + 1)

    offer = {
        "id": f"off_{uuid.uuid4().hex[:8]}",
        "driver_id": driver["id"],
        "driver_name": user.get("name", "Chauffeur"),
        "driver_rating": driver.get("rating", 5.0),
        "driver_vehicle_model": driver.get("vehicle_model"),
        "driver_vehicle_number": driver.get("vehicle_number"),
        "driver_photo": driver_photo,
        "distance_km": distance_km,
        "eta_min": eta_min,
        "amount": amount,
        "at_proposed_fare": at_proposed_fare,
        "status": "pending",  # pending | accepted | rejected
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=ttl)).isoformat(),
        "ttl_seconds": ttl,
    }

    # Prevent the same driver from spamming offers: replace previous pending
    await db.rides.update_one(
        {"id": ride_id},
        {"$pull": {"counter_offers": {"driver_id": driver["id"], "status": "pending"}}},
    )
    await db.rides.update_one(
        {"id": ride_id},
        {"$push": {"counter_offers": offer}},
    )

    # Notify the passenger via WS room
    await manager.send_to_ride_room(ride_id, {
        "type": "counter_offer",
        "ride_id": ride_id,
        "offer": offer,
    })

    return {"message": "Offer sent", "offer": offer}


@router.post("/{ride_id}/accept-offer/{offer_id}")
async def passenger_accept_offer(ride_id: str, offer_id: str, request: Request):
    """Passenger accepts a driver's counter-offer → ride starts."""
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your ride")
    if ride.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Ride is no longer pending")

    offers = ride.get("counter_offers") or []
    offer = next((o for o in offers if o["id"] == offer_id and o["status"] == "pending"), None)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")

    # Reject expired offers (driver counter-offers live for OFFER_TTL_SECONDS)
    exp = offer.get("expires_at")
    if exp:
        try:
            if datetime.fromisoformat(exp) < datetime.now(timezone.utc):
                await db.rides.update_one(
                    {"id": ride_id, "counter_offers.id": offer_id},
                    {"$set": {"counter_offers.$.status": "expired"}},
                )
                raise HTTPException(status_code=400, detail="Cette offre a expiré")
        except ValueError:
            pass

    driver = await db.drivers.find_one({"id": offer["driver_id"]}, {"_id": 0})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    driver_user = await db.users.find_one({"id": driver["user_id"]}, {"_id": 0})

    now = datetime.now(timezone.utc).isoformat()

    # Mark offer accepted, reject others, assign driver and switch ride to accepted
    await db.rides.update_one({"id": ride_id, "counter_offers.id": offer_id}, {"$set": {"counter_offers.$.status": "accepted"}})
    claimed = await db.rides.find_one_and_update(
        {"id": ride_id, "status": "pending", "driver_id": None},
        {
            "$set": {
                "driver_id": driver["id"],
                "status": "accepted",
                "accepted_at": now,
                "estimated_fare": offer["amount"],
                "driver_name": (driver_user or {}).get("name", offer.get("driver_name")),
                "driver_phone": (driver_user or {}).get("phone"),
                "driver_rating": driver.get("rating", 5.0),
                "driver_vehicle_model": driver.get("vehicle_model"),
                "driver_vehicle_number": driver.get("vehicle_number"),
            },
        },
    )
    if not claimed:
        raise HTTPException(status_code=409, detail="Cette course a déjà été attribuée")
    # Reject remaining pending offers
    await db.rides.update_one(
        {"id": ride_id},
        {"$set": {"counter_offers.$[elem].status": "rejected"}},
        array_filters=[{"elem.id": {"$ne": offer_id}, "elem.status": "pending"}],
    )

    # Award points to accepting driver (same logic as accept_ride)
    points_cfg = await _get_driver_points_cfg()
    gain = int(points_cfg.get("points_per_ride_accepted", 2))
    current_points = driver.get("points", points_cfg["initial_points"])
    new_points = min(100, current_points + gain)
    await db.drivers.update_one(
        {"id": driver["id"]},
        {"$set": {"points": new_points}, "$inc": {"offered_count": 1, "accepted_count": 1}},
    )

    # Notify driver via WS + ride room
    await manager.send_to_ride_room(ride_id, {
        "type": "offer_accepted",
        "ride_id": ride_id,
        "offer_id": offer_id,
        "driver_id": driver["id"],
    })

    return {"message": "Offer accepted", "ride_id": ride_id, "final_fare": offer["amount"]}


@router.get("/bidding/avg-fares")
async def bidding_avg_fares(request: Request):
    """Average ACCEPTED bidding fare per vehicle type over the last 30 days.
    Helps riders propose a fair price on the enchère flow (and lifts acceptance)."""
    await get_current_user(request)
    since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    pipeline = [
        {"$match": {
            "ride_type": "bidding",
            "status": {"$in": ["accepted", "arriving", "in_progress", "completed"]},
            "created_at": {"$gte": since},
        }},
        {"$group": {
            "_id": {"$toLower": "$vehicle_type"},
            "avg": {"$avg": {"$ifNull": ["$final_fare", "$estimated_fare"]}},
            "n": {"$sum": 1},
        }},
    ]
    rows = await db.rides.aggregate(pipeline).to_list(50)
    fares = {r["_id"]: round(float(r["avg"]), 2) for r in rows if r.get("_id") and r.get("avg")}
    counts = {r["_id"]: r["n"] for r in rows if r.get("_id")}
    return {"fares": fares, "counts": counts, "sample_days": 30}


@router.post("/{ride_id}/reject-offer/{offer_id}")
async def passenger_reject_offer(ride_id: str, offer_id: str, request: Request):
    """Passenger refuses a driver's bid/counter-offer. Marks it rejected (so it
    drops out of the passenger's chooser list) and notifies the driver. Other
    drivers keep competing — the ride stays pending."""
    user = await get_current_user(request)
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0, "user_id": 1, "status": 1})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your ride")
    res = await db.rides.update_one(
        {"id": ride_id, "counter_offers.id": offer_id},
        {"$set": {"counter_offers.$.status": "rejected"}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Offer not found")
    # Let the driver know their bid was declined (best-effort).
    await manager.send_to_ride_room(ride_id, {
        "type": "offer_rejected",
        "ride_id": ride_id,
        "offer_id": offer_id,
    })
    return {"message": "Offer rejected", "offer_id": offer_id}
