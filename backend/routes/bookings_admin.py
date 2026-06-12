"""Admin « Réservations & Commandes » hub.

Unifies, for the admin/dispatcher, everything XJEKPLUS scatters across pages:
  - Overview KPIs (live rides, upcoming reservations, today's orders, revenue…)
  - Live rides (ongoing), Scheduled reservations (Ride/Job Later)
  - Trips/Jobs history (enriched: user, driver, fare, type) + filters
  - Orders list (enriched: merchant, customer)
  - Manual ride booking + manual order creation (delivery/courier OR merchant)
  - Ride actions: cancel / reschedule / reassign driver
All endpoints are mounted under /api/admin/bookings.
"""
import uuid
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import require_role, calculate_distance, calculate_fare
from core.websocket import manager

router = APIRouter(prefix="/admin/bookings", tags=["admin-bookings"])

LIVE_STATUSES = ["pending", "accepted", "arriving", "in_progress"]
DONE_STATUSES = ["completed", "cancelled"]


def _now():
    return datetime.now(timezone.utc)


def _parse_dt(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


async def _user_map(user_ids):
    ids = [u for u in set(user_ids) if u]
    if not ids:
        return {}
    docs = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1}).to_list(5000)
    return {d["id"]: d for d in docs}


async def _enrich_rides(rides):
    umap = await _user_map([r.get("user_id") for r in rides] + [r.get("driver_user_id") for r in rides])
    drv_ids = [r.get("driver_id") for r in rides if r.get("driver_id")]
    dmap = {}
    if drv_ids:
        for d in await db.drivers.find({"id": {"$in": list(set(drv_ids))}}, {"_id": 0, "id": 1, "user_id": 1, "company_name": 1}).to_list(5000):
            dmap[d["id"]] = d
    dumap = await _user_map([d.get("user_id") for d in dmap.values()])
    for r in rides:
        u = umap.get(r.get("user_id"), {})
        r["customer_name"] = r.get("book_for_name") or u.get("name") or "—"
        r["customer_phone"] = r.get("book_for_phone") or u.get("phone")
        if r.get("driver_id") and not r.get("driver_name"):
            dd = dmap.get(r["driver_id"], {})
            du = dumap.get(dd.get("user_id"), {})
            r["driver_name"] = du.get("name") or r.get("driver_name")
        r["fare"] = r.get("final_fare") or r.get("estimated_fare") or 0
    return rides


# ───────────────────────── OVERVIEW ─────────────────────────
@router.get("/overview")
async def bookings_overview(request: Request):
    await require_role(request, ["admin", "dispatcher"])
    now = _now()
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_iso = start_today.isoformat()

    live_count = await db.rides.count_documents({"status": {"$in": LIVE_STATUSES}})
    upcoming = await db.rides.count_documents({"scheduled_at": {"$gte": now.isoformat()}, "status": "pending"})
    rides_today = await db.rides.count_documents({"created_at": {"$gte": today_iso}})
    orders_today = await db.orders.count_documents({"created_at": {"$gte": today_iso}})
    completed_today = await db.rides.count_documents({"status": "completed", "completed_at": {"$gte": today_iso}})
    cancelled_today = await db.rides.count_documents({"status": "cancelled", "created_at": {"$gte": today_iso}})

    # Revenue today (completed rides + delivered orders)
    rev_rides = await db.rides.aggregate([
        {"$match": {"status": "completed", "completed_at": {"$gte": today_iso}}},
        {"$group": {"_id": None, "sum": {"$sum": {"$ifNull": ["$final_fare", "$estimated_fare"]}}}},
    ]).to_list(1)
    rev_orders = await db.orders.aggregate([
        {"$match": {"status": "delivered", "created_at": {"$gte": today_iso}}},
        {"$group": {"_id": None, "sum": {"$sum": "$total"}}},
    ]).to_list(1)
    revenue_today = round((rev_rides[0]["sum"] if rev_rides else 0) + (rev_orders[0]["sum"] if rev_orders else 0), 2)

    total_today = rides_today or 1
    cancel_rate = round(cancelled_today / total_today * 100, 1)

    # live status breakdown
    breakdown = {s: await db.rides.count_documents({"status": s}) for s in LIVE_STATUSES}

    return {
        "live_rides": live_count,
        "upcoming_reservations": upcoming,
        "rides_today": rides_today,
        "orders_today": orders_today,
        "completed_today": completed_today,
        "cancelled_today": cancelled_today,
        "revenue_today": revenue_today,
        "cancellation_rate": cancel_rate,
        "live_breakdown": breakdown,
        "currency": "EUR",
    }


# ───────────────────────── LIVE RIDES ─────────────────────────
@router.get("/live")
async def bookings_live(request: Request):
    await require_role(request, ["admin", "dispatcher"])
    rides = await db.rides.find({"status": {"$in": LIVE_STATUSES}}, {"_id": 0}).sort("created_at", -1).limit(150).to_list(150)
    await _enrich_rides(rides)
    for r in rides:
        if r.get("driver_id"):
            loc = manager.get_driver_location(r["driver_id"])
            if loc:
                r["driver_lat"], r["driver_lng"] = loc.get("lat"), loc.get("lng")
    counts = {s: sum(1 for r in rides if r.get("status") == s) for s in LIVE_STATUSES}
    return {"rides": rides, "counts": counts, "total": len(rides)}


# ───────────────────────── SCHEDULED (Ride/Job Later) ─────────────────────────
@router.get("/scheduled")
async def bookings_scheduled(request: Request, status: Optional[str] = None, service_type: Optional[str] = None,
                             search: Optional[str] = None, limit: int = 200):
    await require_role(request, ["admin", "dispatcher"])
    query = {"scheduled_at": {"$ne": None}}
    rides = await db.rides.find(query, {"_id": 0}).sort("scheduled_at", 1).limit(min(limit, 500)).to_list(min(limit, 500))
    now = _now()
    # Derive a presentation status: expired if past schedule and still pending.
    out = []
    for r in rides:
        sched = _parse_dt(r.get("scheduled_at"))
        disp = r.get("status")
        if r.get("status") == "pending" and sched and sched < now:
            disp = "expired"
        r["display_status"] = disp
        if status and disp != status:
            continue
        if service_type and (r.get("vehicle_type") or r.get("ride_type")) != service_type:
            continue
        out.append(r)
    await _enrich_rides(out)
    if search:
        s = search.lower()
        out = [r for r in out if s in (r.get("booking_no") or "").lower() or s in (r.get("customer_name") or "").lower()
               or s in (r.get("pickup_address") or "").lower() or s in (r.get("dropoff_address") or "").lower()]
    return {"rides": out, "total": len(out)}


# ───────────────────────── TRIPS / JOBS (history) ─────────────────────────
@router.get("/rides")
async def bookings_rides(request: Request, status: Optional[str] = None, service_type: Optional[str] = None,
                         search: Optional[str] = None, date_from: Optional[str] = None,
                         date_to: Optional[str] = None, limit: int = 300):
    await require_role(request, ["admin", "dispatcher"])
    query = {}
    if status:
        query["status"] = status
    if date_from or date_to:
        rng = {}
        if date_from:
            rng["$gte"] = date_from
        if date_to:
            rng["$lte"] = date_to + "T23:59:59"
        query["created_at"] = rng
    total = await db.rides.count_documents(query)
    rides = await db.rides.find(query, {"_id": 0}).sort("created_at", -1).limit(min(limit, 1000)).to_list(min(limit, 1000))
    await _enrich_rides(rides)
    if service_type:
        rides = [r for r in rides if (r.get("vehicle_type") or r.get("ride_type")) == service_type]
    if search:
        s = search.lower()
        rides = [r for r in rides if s in (r.get("booking_no") or "").lower() or s in (r.get("customer_name") or "").lower()
                 or s in (r.get("pickup_address") or "").lower()]
    return {"rides": rides, "total": total}


# ───────────────────────── ORDERS ─────────────────────────
@router.get("/orders")
async def bookings_orders(request: Request, status: Optional[str] = None, search: Optional[str] = None, limit: int = 300):
    await require_role(request, ["admin", "dispatcher"])
    query = {}
    if status:
        query["status"] = status
    total = await db.orders.count_documents(query)
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).limit(min(limit, 1000)).to_list(min(limit, 1000))
    umap = await _user_map([o.get("user_id") for o in orders])
    mids = [o.get("merchant_id") for o in orders if o.get("merchant_id")]
    mmap = {}
    if mids:
        for m in await db.merchants.find({"id": {"$in": list(set(mids))}}, {"_id": 0, "id": 1, "store_name": 1}).to_list(5000):
            mmap[m["id"]] = m
    for o in orders:
        o["customer_name"] = umap.get(o.get("user_id"), {}).get("name") or "—"
        o["merchant_name"] = mmap.get(o.get("merchant_id"), {}).get("store_name") or ("Livraison directe" if not o.get("merchant_id") else "—")
    if search:
        s = search.lower()
        orders = [o for o in orders if s in (o.get("id") or "").lower() or s in (o.get("delivery_address") or "").lower()
                  or s in (o.get("customer_name") or "").lower()]
    return {"orders": orders, "total": total}


# ───────────────────────── helpers: resolve customer ─────────────────────────
async def _resolve_customer(body):
    """Find an existing customer by user_id / phone / email, or create a lightweight
    guest user when a name + phone are supplied. Returns (user_id, name, phone)."""
    uid = (body.get("user_id") or "").strip()
    if uid:
        u = await db.users.find_one({"id": uid}, {"_id": 0, "id": 1, "name": 1, "phone": 1})
        if not u:
            raise HTTPException(404, "Client introuvable")
        return u["id"], u.get("name"), u.get("phone")
    phone = (body.get("customer_phone") or body.get("phone") or "").strip()
    email = (body.get("customer_email") or body.get("email") or "").strip().lower()
    q = None
    if email:
        q = {"email": email}
    elif phone:
        q = {"phone": phone}
    if q:
        u = await db.users.find_one(q, {"_id": 0, "id": 1, "name": 1, "phone": 1})
        if u:
            return u["id"], u.get("name"), u.get("phone")
    # Create a guest customer (admin booked on their behalf).
    name = (body.get("customer_name") or "Client").strip()
    if not phone and not email:
        raise HTTPException(400, "Renseignez un client existant ou son téléphone/email")
    guest_id = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one({
        "id": guest_id, "name": name, "phone": phone or None, "email": email or None,
        "role": "user", "is_verified": False, "is_guest": True,
        "created_by": "admin", "created_at": _now().isoformat(),
    })
    return guest_id, name, phone


# ───────────────────────── MANUAL RIDE ─────────────────────────
@router.post("/manual-ride")
async def create_manual_ride(request: Request):
    await require_role(request, ["admin", "dispatcher"])
    body = await request.json()
    for f in ("pickup_address", "dropoff_address"):
        if not (body.get(f) or "").strip():
            raise HTTPException(400, "Adresses de départ et d'arrivée requises")
    p_lat = float(body.get("pickup_lat") or 0)
    p_lng = float(body.get("pickup_lng") or 0)
    d_lat = float(body.get("dropoff_lat") or 0)
    d_lng = float(body.get("dropoff_lng") or 0)
    vehicle_type = (body.get("vehicle_type") or "sb").strip()
    payment_method = (body.get("payment_method") or "cash").strip()
    scheduled_at = body.get("scheduled_at") or None
    if scheduled_at:
        sched = _parse_dt(scheduled_at)
        if not sched:
            raise HTTPException(400, "Date de planification invalide")
        scheduled_at = sched.isoformat()

    user_id, cust_name, cust_phone = await _resolve_customer(body)

    distance = calculate_distance(p_lat, p_lng, d_lat, d_lng) if (p_lat and d_lat) else float(body.get("distance_km") or 0)
    duration = int(distance * 3)
    vtype_doc = await db.vehicle_types.find_one({"slug": vehicle_type, "status": "active"}, {"_id": 0})
    manual_fare = body.get("estimated_fare")
    fare = float(manual_fare) if manual_fare not in (None, "") else round(calculate_fare(distance, vehicle_type, duration, vtype_doc), 2)
    otp = str(secrets.randbelow(10000)).zfill(4)
    now_iso = _now().isoformat()
    ride = {
        "id": f"ride_{uuid.uuid4().hex[:12]}",
        "booking_no": str(secrets.randbelow(90000000) + 10000000),
        "user_id": user_id, "driver_id": None,
        "pickup_lat": p_lat, "pickup_lng": p_lng, "pickup_address": body.get("pickup_address"),
        "dropoff_lat": d_lat, "dropoff_lng": d_lng, "dropoff_address": body.get("dropoff_address"),
        "vehicle_type": vehicle_type, "status": "pending",
        "estimated_fare": fare, "final_fare": None,
        "distance_km": round(distance, 2), "duration_mins": duration,
        "payment_method": payment_method, "payment_status": "pending",
        "otp": otp, "start_otp": otp, "currency": "EUR",
        "scheduled_at": scheduled_at,
        "mode": "scheduled" if scheduled_at else "instant",
        "ride_type": "scheduled" if scheduled_at else "instant",
        "book_for_name": cust_name, "book_for_phone": cust_phone,
        "auto_assign": True, "created_by": "admin", "created_via": "manual_booking",
        "notes": body.get("notes"),
        "driver_name": None, "accepted_at": None, "completed_at": None, "cancelled_at": None,
        "created_at": now_iso,
    }
    await db.rides.insert_one(ride)
    ride.pop("_id", None)
    # Broadcast immediately when not scheduled (mirrors the standard booking flow).
    if not scheduled_at:
        try:
            await manager.broadcast_to_drivers({
                "type": "new_ride_request", "ride_id": ride["id"],
                "pickup_lat": p_lat, "pickup_lng": p_lng,
                "pickup_address": ride["pickup_address"], "dropoff_address": ride["dropoff_address"],
                "vehicle_type": vehicle_type, "estimated_fare": fare,
                "proposed_fare": fare, "distance_km": ride["distance_km"],
                "duration_mins": duration, "mode": ride["mode"], "ride_type": ride["ride_type"],
            })
        except Exception:
            pass
    try:
        await manager.broadcast_to_admins({"type": "new_ride_request", "ride_id": ride["id"],
                                           "booking_no": ride["booking_no"], "pickup_address": ride["pickup_address"]})
    except Exception:
        pass
    return {"ride": ride}


# ───────────────────────── MANUAL ORDER ─────────────────────────
@router.post("/manual-order")
async def create_manual_order(request: Request):
    await require_role(request, ["admin", "dispatcher"])
    body = await request.json()
    kind = (body.get("kind") or "delivery").strip().lower()  # 'merchant' | 'delivery' | 'courier'
    if not (body.get("delivery_address") or "").strip():
        raise HTTPException(400, "Adresse de livraison requise")
    user_id, cust_name, _ = await _resolve_customer(body)
    now_iso = _now().isoformat()
    order_id = f"order_{uuid.uuid4().hex[:12]}"

    if kind == "merchant":
        merchant_id = (body.get("merchant_id") or "").strip()
        merchant = await db.merchants.find_one({"id": merchant_id}, {"_id": 0}) if merchant_id else None
        if not merchant:
            raise HTTPException(404, "Marchand introuvable")
        items_in = body.get("items") or []
        if not items_in:
            raise HTTPException(400, "Ajoutez au moins un produit")
        items, subtotal = [], 0.0
        for it in items_in:
            product = await db.products.find_one({"id": it.get("product_id")}, {"_id": 0})
            if not product:
                raise HTTPException(404, f"Produit {it.get('product_id')} introuvable")
            qty = max(1, int(it.get("quantity") or 1))
            line = round(product["price"] * qty, 2)
            subtotal += line
            items.append({"product_id": product["id"], "name": product["name"], "price": product["price"], "quantity": qty, "total": line})
        delivery_fee = float(body.get("delivery_fee") or merchant.get("delivery_fee") or 2.5)
        total = round(subtotal + delivery_fee, 2)
        order = {
            "id": order_id, "user_id": user_id, "merchant_id": merchant_id, "driver_id": None,
            "items": items, "subtotal": round(subtotal, 2), "delivery_fee": delivery_fee,
            "total": total, "order_type": body.get("order_type") or "food", "status": "pending",
            "delivery_address": body.get("delivery_address"),
            "delivery_lat": float(body.get("delivery_lat") or 0), "delivery_lng": float(body.get("delivery_lng") or 0),
            "payment_method": body.get("payment_method") or "cash", "payment_status": "pending",
            "special_instructions": body.get("special_instructions"),
            "created_by": "admin", "created_via": "manual_order", "created_at": now_iso,
        }
    else:
        # Direct delivery / courier (no merchant) — admin sets the amount.
        amount = float(body.get("amount") or body.get("total") or 0)
        order = {
            "id": order_id, "user_id": user_id, "merchant_id": None, "driver_id": None,
            "items": body.get("items") or [], "subtotal": amount, "delivery_fee": 0.0,
            "total": round(amount, 2), "order_type": kind, "status": "pending",
            "pickup_address": body.get("pickup_address"),
            "delivery_address": body.get("delivery_address"),
            "delivery_lat": float(body.get("delivery_lat") or 0), "delivery_lng": float(body.get("delivery_lng") or 0),
            "payment_method": body.get("payment_method") or "cash", "payment_status": "pending",
            "package_description": body.get("package_description") or body.get("special_instructions"),
            "created_by": "admin", "created_via": "manual_order", "created_at": now_iso,
        }
    await db.orders.insert_one(order)
    order.pop("_id", None)
    return {"order": order}


# ───────────────────────── RIDE ACTIONS ─────────────────────────
@router.post("/ride/{ride_id}/cancel")
async def admin_cancel_ride(ride_id: str, request: Request):
    await require_role(request, ["admin", "dispatcher"])
    body = await request.json()
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0, "status": 1, "user_id": 1, "driver_id": 1})
    if not ride:
        raise HTTPException(404, "Course introuvable")
    if ride.get("status") in DONE_STATUSES:
        raise HTTPException(400, "Course déjà terminée/annulée")
    now_iso = _now().isoformat()
    await db.rides.update_one({"id": ride_id}, {"$set": {
        "status": "cancelled", "cancelled_by": "admin",
        "cancel_reason": body.get("reason") or "Annulée par l'administrateur",
        "cancelled_at": now_iso,
    }})
    for uid in (ride.get("user_id"),):
        if uid:
            try:
                await manager.send_personal_message({"type": "ride_cancelled", "ride_id": ride_id, "by": "admin"}, uid)
            except Exception:
                pass
    return {"cancelled": True, "ride_id": ride_id}


@router.post("/ride/{ride_id}/reschedule")
async def admin_reschedule_ride(ride_id: str, request: Request):
    await require_role(request, ["admin", "dispatcher"])
    body = await request.json()
    sched = _parse_dt(body.get("scheduled_at"))
    if not sched:
        raise HTTPException(400, "Date invalide")
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0, "status": 1})
    if not ride:
        raise HTTPException(404, "Course introuvable")
    if ride.get("status") in DONE_STATUSES:
        raise HTTPException(400, "Course terminée — non replanifiable")
    await db.rides.update_one({"id": ride_id}, {"$set": {
        "scheduled_at": sched.isoformat(), "mode": "scheduled", "ride_type": "scheduled", "status": "pending",
    }})
    return {"rescheduled": True, "ride_id": ride_id, "scheduled_at": sched.isoformat()}


@router.post("/ride/{ride_id}/reassign")
async def admin_reassign_ride(ride_id: str, request: Request):
    await require_role(request, ["admin", "dispatcher"])
    body = await request.json()
    driver_id = (body.get("driver_id") or "").strip()
    driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "id": 1, "user_id": 1}) if driver_id else None
    if not driver:
        raise HTTPException(404, "Chauffeur introuvable")
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0, "status": 1, "user_id": 1})
    if not ride:
        raise HTTPException(404, "Course introuvable")
    if ride.get("status") in DONE_STATUSES:
        raise HTTPException(400, "Course terminée — réaffectation impossible")
    du = await db.users.find_one({"id": driver.get("user_id")}, {"_id": 0, "name": 1, "phone": 1})
    await db.rides.update_one({"id": ride_id}, {"$set": {
        "driver_id": driver_id, "driver_name": (du or {}).get("name"),
        "driver_phone": (du or {}).get("phone"),
        "status": "accepted", "accepted_at": _now().isoformat(), "assigned_by": "admin",
    }})
    try:
        if driver.get("user_id"):
            await manager.send_personal_message({"type": "ride_assigned", "ride_id": ride_id}, driver["user_id"])
        if ride.get("user_id"):
            await manager.send_personal_message({"type": "driver_assigned", "ride_id": ride_id}, ride["user_id"])
    except Exception:
        pass
    return {"reassigned": True, "ride_id": ride_id, "driver_id": driver_id}
