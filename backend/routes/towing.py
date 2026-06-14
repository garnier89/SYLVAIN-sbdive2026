"""SB Dépannage — on-demand roadside assistance & towing.

Real request lifecycle with a SIMULATED dispatch (no real operators connected in
preview): a request is created → an operator is auto-assigned → the tow truck
position is interpolated from time (no background job) → on-site → the user marks
the intervention complete, which debits the wallet (sbpay) at that moment.

Easy to wire real partners later (replace the simulated assignment/progression).
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
import hashlib
from datetime import datetime, timezone

from core.config import db
from core.deps import get_current_user, calculate_distance

router = APIRouter(prefix="/towing", tags=["towing"])

# ── Problem catalog ─────────────────────────────────────────────────────────
PROBLEM_TYPES = [
    {"id": "battery", "label": "Batterie à plat", "icon": "BatteryWarning", "base_fee": 50.0, "needs_destination": False},
    {"id": "tire", "label": "Pneu crevé", "icon": "Tire", "base_fee": 60.0, "needs_destination": False},
    {"id": "fuel", "label": "Panne de carburant", "icon": "GasPump", "base_fee": 45.0, "needs_destination": False},
    {"id": "lockout", "label": "Ouverture de porte", "icon": "Key", "base_fee": 70.0, "needs_destination": False},
    {"id": "nostart", "label": "Voiture ne démarre pas", "icon": "Engine", "base_fee": 65.0, "needs_destination": False},
    {"id": "towing", "label": "Remorquage", "icon": "Truck", "base_fee": 90.0, "needs_destination": True, "per_km": 2.5},
    {"id": "accident", "label": "Accident", "icon": "Warning", "base_fee": 120.0, "needs_destination": True, "per_km": 2.5},
]
_PROBLEM_BY_ID = {p["id"]: p for p in PROBLEM_TYPES}

NIGHT_SURCHARGE_PCT = 0.30  # +30% entre 22h et 6h

# Simulated operator pool (stand-in for real partners).
_OPERATORS = [
    {"name": "Karim B.", "company": "Dépann'Express 24/7", "rating": 4.8, "plate": "DX-204-AB", "truck": "Renault Master Plateau"},
    {"name": "Sofiane M.", "company": "Auto Secours Paris", "rating": 4.7, "plate": "AS-118-PR", "truck": "Iveco Daily Dépanneuse"},
    {"name": "Lucas D.", "company": "Allo Dépanneur", "rating": 4.9, "plate": "AD-777-XY", "truck": "Mercedes Sprinter Plateau"},
    {"name": "Mehdi T.", "company": "Roadside Pro", "rating": 4.6, "plate": "RP-555-ZZ", "truck": "Peugeot Boxer Dépanneuse"},
]

SEARCH_SECONDS = 5      # temps de recherche avant assignation
ARRIVE_SECONDS = 45     # durée simulée d'approche (compressée pour la démo)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _is_night(dt: datetime = None) -> bool:
    h = (dt or datetime.now(timezone.utc)).hour
    return h >= 22 or h < 6


def _price(problem_type: str, distance_km: float, night: bool) -> dict:
    p = _PROBLEM_BY_ID.get(problem_type)
    if not p:
        raise HTTPException(status_code=400, detail="Type de panne invalide")
    base = float(p["base_fee"])
    per_km = float(p.get("per_km", 0) or 0)
    dist = max(0.0, float(distance_km or 0)) if p.get("needs_destination") else 0.0
    distance_fee = round(per_km * dist, 2)
    subtotal = base + distance_fee
    night_surcharge = round(subtotal * NIGHT_SURCHARGE_PCT, 2) if night else 0.0
    total = round(subtotal + night_surcharge, 2)
    return {
        "problem_type": problem_type, "base_fee": round(base, 2), "per_km": per_km,
        "distance_km": round(dist, 1), "distance_fee": distance_fee,
        "is_night": night, "night_surcharge": night_surcharge, "total": total,
    }


def _assign_operator(req_id: str) -> dict:
    idx = int(hashlib.md5(req_id.encode()).hexdigest(), 16) % len(_OPERATORS)
    op = dict(_OPERATORS[idx])
    op["eta_minutes"] = 12 + (idx * 4)  # 12–24 min affiché
    return op


def _live_state(req: dict) -> dict:
    """Compute live status + operator position from elapsed time (no bg job)."""
    status = req.get("status")
    if status in ("completed", "cancelled"):
        return {"status": status, "progress": 1.0, "eta_minutes": 0, "operator_position": None}
    try:
        created = datetime.fromisoformat(req["created_at"])
    except Exception:
        created = datetime.now(timezone.utc)
    elapsed = (datetime.now(timezone.utc) - created).total_seconds()
    op = req.get("operator") or {}
    start = req.get("operator_start") or {}
    pickup = {"lat": req.get("pickup_lat"), "lng": req.get("pickup_lng")}

    if elapsed < SEARCH_SECONDS:
        return {"status": "searching", "progress": 0.0,
                "eta_minutes": op.get("eta_minutes", 15), "operator_position": None}

    progress = min(1.0, (elapsed - SEARCH_SECONDS) / ARRIVE_SECONDS)
    eta_remaining = max(0, round(op.get("eta_minutes", 15) * (1 - progress)))
    pos = None
    if start.get("lat") is not None and pickup.get("lat") is not None:
        pos = {
            "lat": start["lat"] + (pickup["lat"] - start["lat"]) * progress,
            "lng": start["lng"] + (pickup["lng"] - start["lng"]) * progress,
        }
    live_status = "arrived" if progress >= 1.0 else "en_route"
    return {"status": live_status, "progress": round(progress, 3),
            "eta_minutes": eta_remaining, "operator_position": pos}


def _public(req: dict) -> dict:
    out = dict(req)
    out.pop("_id", None)
    if req.get("status") not in ("completed", "cancelled"):
        live = _live_state(req)
        out["status"] = live["status"]
        out["live"] = live
    else:
        out["live"] = {"status": req["status"], "progress": 1.0, "eta_minutes": 0, "operator_position": None}
    return out


# ── Endpoints ───────────────────────────────────────────────────────────────
@router.get("/problem-types")
async def list_problem_types():
    return {"problem_types": PROBLEM_TYPES, "night_surcharge_pct": NIGHT_SURCHARGE_PCT, "is_night": _is_night()}


@router.post("/estimate")
async def estimate(request: Request):
    body = await request.json()
    return _price(body.get("problem_type"), body.get("distance_km", 0), _is_night())


@router.post("/requests")
async def create_request(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    problem_type = body.get("problem_type")
    p = _PROBLEM_BY_ID.get(problem_type)
    if not p:
        raise HTTPException(status_code=400, detail="Type de panne invalide")

    pickup_lat, pickup_lng = body.get("pickup_lat"), body.get("pickup_lng")
    if pickup_lat is None or pickup_lng is None:
        raise HTTPException(status_code=400, detail="Localisation du véhicule requise")

    distance_km = 0.0
    dest_lat, dest_lng = body.get("dest_lat"), body.get("dest_lng")
    if p.get("needs_destination") and dest_lat is not None and dest_lng is not None:
        distance_km = round(calculate_distance(pickup_lat, pickup_lng, dest_lat, dest_lng), 1)

    breakdown = _price(problem_type, distance_km, _is_night())
    req_id = f"tow_{uuid.uuid4().hex[:12]}"
    operator = _assign_operator(req_id)
    # Operator starts ~ offset from the breakdown location (NE direction).
    operator_start = {"lat": pickup_lat + 0.012, "lng": pickup_lng + 0.016}

    req = {
        "id": req_id,
        "user_id": user["id"],
        "user_name": user.get("name", ""),
        "problem_type": problem_type,
        "problem_label": p["label"],
        "pickup_address": body.get("pickup_address", ""),
        "pickup_lat": pickup_lat, "pickup_lng": pickup_lng,
        "dest_address": body.get("dest_address", "") if p.get("needs_destination") else "",
        "dest_lat": dest_lat if p.get("needs_destination") else None,
        "dest_lng": dest_lng if p.get("needs_destination") else None,
        "vehicle": {
            "make": body.get("vehicle_make", ""),
            "model": body.get("vehicle_model", ""),
            "plate": body.get("vehicle_plate", ""),
        },
        "notes": body.get("notes", ""),
        "payment_method": body.get("payment_method", "sbpay"),
        "distance_km": distance_km,
        "breakdown": breakdown,
        "total_price": breakdown["total"],
        "operator": operator,
        "operator_start": operator_start,
        "status": "searching",
        "payment_status": "pending",
        "created_at": _now(),
    }
    await db.towing_requests.insert_one(dict(req))
    return _public(req)


@router.get("/requests")
async def list_requests(request: Request):
    user = await get_current_user(request)
    docs = await db.towing_requests.find({"user_id": user["id"]}).sort("created_at", -1).to_list(50)
    return [_public(d) for d in docs]


@router.get("/requests/{req_id}")
async def get_request(req_id: str, request: Request):
    user = await get_current_user(request)
    req = await db.towing_requests.find_one({"id": req_id, "user_id": user["id"]})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    return _public(req)


@router.post("/requests/{req_id}/complete")
async def complete_request(req_id: str, request: Request):
    """Mark the intervention complete; debit the wallet (sbpay) at this moment."""
    user = await get_current_user(request)
    req = await db.towing_requests.find_one({"id": req_id, "user_id": user["id"]})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if req.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Demande annulée")

    total = round(float(req.get("total_price", 0) or 0), 2)
    new_balance = None
    if req.get("status") != "completed" and req.get("payment_method") == "sbpay" and total > 0 \
            and req.get("payment_status") != "paid":
        res = await db.wallets.update_one(
            {"user_id": user["id"], "balance": {"$gte": total}},
            {"$inc": {"balance": -total}},
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant. Rechargez votre portefeuille.")
        wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
        new_balance = round((wallet or {}).get("balance", 0), 2)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
            "amount": -total, "balance_after": new_balance,
            "description": f"SB Dépannage · {req.get('problem_label', '')}",
            "status": "completed", "created_at": _now(),
        })
        try:
            from core.cashback import award_cashback
            await award_cashback(user["id"], total, "sbpay", "towing", ref_id=req_id)
        except Exception:
            pass

    await db.towing_requests.update_one(
        {"id": req_id},
        {"$set": {"status": "completed", "payment_status": "paid", "completed_at": _now()}},
    )
    return {"ok": True, "total": total, "balance": new_balance}


@router.post("/requests/{req_id}/cancel")
async def cancel_request(req_id: str, request: Request):
    user = await get_current_user(request)
    res = await db.towing_requests.update_one(
        {"id": req_id, "user_id": user["id"], "status": {"$nin": ["completed", "cancelled"]}},
        {"$set": {"status": "cancelled", "cancelled_at": _now()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Demande introuvable ou déjà terminée")
    return {"ok": True}
