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
from pymongo import ReturnDocument

from core.config import db
from core.deps import get_current_user, calculate_distance
from core.notifications import create_notification

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
DEFAULT_COMMISSION_PCT = 0.15  # commission plateforme sur chaque intervention

# Simulated operator pool (stand-in for real partners).
_OPERATORS = [
    {"name": "Karim B.", "company": "Dépann'Express 24/7", "rating": 4.8, "plate": "DX-204-AB", "truck": "Renault Master Plateau"},
    {"name": "Sofiane M.", "company": "Auto Secours Paris", "rating": 4.7, "plate": "AS-118-PR", "truck": "Iveco Daily Dépanneuse"},
    {"name": "Lucas D.", "company": "Allo Dépanneur", "rating": 4.9, "plate": "AD-777-XY", "truck": "Mercedes Sprinter Plateau"},
    {"name": "Mehdi T.", "company": "Roadside Pro", "rating": 4.6, "plate": "RP-555-ZZ", "truck": "Peugeot Boxer Dépanneuse"},
]

SEARCH_SECONDS = 5      # temps de recherche avant assignation (simulé)
ARRIVE_SECONDS = 45     # durée simulée d'approche (compressée pour la démo)
FALLBACK_SECONDS = 18   # si aucun vrai dépanneur n'accepte → assignation simulée


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _commission_pct() -> float:
    doc = await db.towing_settings.find_one({"id": "config"}, {"_id": 0})
    if doc and doc.get("commission_pct") is not None:
        return float(doc["commission_pct"])
    return DEFAULT_COMMISSION_PCT


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
    """Compute live status + operator position.
    - real operator: trust stored status + last ping position.
    - simulated operator: interpolate position from time since accepted_at.
    """
    status = req.get("status")
    if status in ("completed", "cancelled"):
        return {"status": status, "progress": 1.0, "eta_minutes": 0, "operator_position": None}
    op = req.get("operator") or {}
    if status == "searching":
        return {"status": "searching", "progress": 0.0,
                "eta_minutes": op.get("eta_minutes", 15) if op else 15, "operator_position": None}

    # Real operator → use stored fields (updated via pings / status updates).
    if req.get("operator_kind") == "real":
        pos = req.get("operator_position") or req.get("operator_start")
        return {
            "status": status,
            "progress": 1.0 if status == "arrived" else 0.5,
            "eta_minutes": 0 if status == "arrived" else op.get("eta_minutes", 15),
            "operator_position": pos,
        }

    # Simulated operator → interpolate from accepted_at.
    try:
        base = datetime.fromisoformat(req.get("accepted_at") or req["created_at"])
    except Exception:
        base = datetime.now(timezone.utc)
    elapsed = (datetime.now(timezone.utc) - base).total_seconds()
    start = req.get("operator_start") or {}
    pickup = {"lat": req.get("pickup_lat"), "lng": req.get("pickup_lng")}
    progress = min(1.0, max(0.0, elapsed / ARRIVE_SECONDS))
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
        "operator_id": None,
        "operator": None,
        "operator_kind": None,
        "operator_start": None,
        "operator_position": None,
        "status": "searching",
        "payment_status": "pending",
        "created_at": _now(),
    }
    await db.towing_requests.insert_one(dict(req))
    # Notify online operators in real time (best-effort).
    try:
        operators = await db.tow_operators.find({"is_online": True}, {"_id": 0, "user_id": 1}).to_list(100)
        for op in operators:
            if op.get("user_id") == user["id"]:
                continue
            await create_notification(
                op["user_id"], "towing_request_new", "🚨 Nouvelle demande de dépannage",
                f"{p['label']} · {req['pickup_address'] or 'à proximité'}",
                {"request_id": req_id, "url": "/espace-depanneur"},
            )
    except Exception:
        pass
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
    # Fallback: if no real operator accepted within FALLBACK_SECONDS, assign a
    # simulated one so the experience never dead-ends (preview / no partners online).
    if req.get("status") == "searching" and not req.get("operator_id"):
        try:
            created = datetime.fromisoformat(req["created_at"])
        except Exception:
            created = datetime.now(timezone.utc)
        if (datetime.now(timezone.utc) - created).total_seconds() >= FALLBACK_SECONDS:
            operator = _assign_operator(req_id)
            operator_start = {"lat": req["pickup_lat"] + 0.012, "lng": req["pickup_lng"] + 0.016}
            req = await db.towing_requests.find_one_and_update(
                {"id": req_id, "status": "searching", "operator_id": None},
                {"$set": {"operator": operator, "operator_kind": "simulated",
                          "operator_start": operator_start, "operator_position": operator_start,
                          "status": "en_route", "accepted_at": _now()}},
                return_document=ReturnDocument.AFTER,
            ) or req
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

    # Platform commission split (computed once at completion).
    pct = await _commission_pct()
    commission = round(total * pct, 2)
    operator_earning = round(total - commission, 2)
    op_id = req.get("operator_id")

    await db.towing_requests.update_one(
        {"id": req_id},
        {"$set": {"status": "completed", "payment_status": "paid", "completed_at": _now(),
                  "commission_pct": pct, "commission": commission, "operator_earning": operator_earning}},
    )

    # Pay the real operator their NET earning (wallet credit) + record platform revenue.
    # Only for the digital (sbpay) flow where the platform collected the payment.
    if op_id and req.get("operator_kind") == "real" and operator_earning > 0 \
            and req.get("payment_method") == "sbpay" and req.get("status") != "completed":
        await db.wallets.update_one({"user_id": op_id}, {"$inc": {"balance": operator_earning}},
                                    upsert=True)
        op_wallet = await db.wallets.find_one({"user_id": op_id}, {"_id": 0})
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": op_id, "type": "Earning",
            "amount": operator_earning, "balance_after": round((op_wallet or {}).get("balance", 0), 2),
            "description": f"Dépannage · {req.get('problem_label', '')} (net après commission)",
            "status": "completed", "created_at": _now(),
        })
        await db.towing_revenue.insert_one({
            "id": f"trev_{uuid.uuid4().hex[:12]}", "request_id": req_id, "operator_id": op_id,
            "total": total, "commission": commission, "operator_earning": operator_earning,
            "commission_pct": pct, "created_at": _now(),
        })

    return {"ok": True, "total": total, "balance": new_balance,
            "commission": commission, "operator_earning": operator_earning}


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


# ── Operator space (espace dépanneur) — real partners ───────────────────────
def _operator_public(op: dict) -> dict:
    out = dict(op or {})
    out.pop("_id", None)
    return out


@router.get("/operator/me")
async def operator_me(request: Request):
    user = await get_current_user(request)
    op = await db.tow_operators.find_one({"user_id": user["id"]}, {"_id": 0})
    if not op:
        return {"registered": False}
    # Stats: completed jobs + NET earnings (after platform commission).
    jobs = await db.towing_requests.find(
        {"operator_id": user["id"]}, {"_id": 0, "status": 1, "total_price": 1, "operator_earning": 1}).to_list(500)
    completed = [j for j in jobs if j.get("status") == "completed"]
    pct = await _commission_pct()
    earnings = round(sum(
        float(j.get("operator_earning", round(float(j.get("total_price", 0) or 0) * (1 - pct), 2)) or 0)
        for j in completed), 2)
    gross = round(sum(float(j.get("total_price", 0) or 0) for j in completed), 2)
    return {"registered": True, "operator": op, "commission_pct": pct, "stats": {
        "completed": len(completed), "active": len([j for j in jobs if j.get("status") in ("en_route", "arrived")]),
        "earnings": earnings, "gross": gross,
    }}


@router.post("/operator/register")
async def operator_register(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    existing = await db.tow_operators.find_one({"user_id": user["id"]}, {"_id": 0})
    doc = {
        "user_id": user["id"],
        "name": body.get("name") or user.get("name", ""),
        "company": body.get("company", ""),
        "phone": body.get("phone", ""),
        "plate": body.get("plate", ""),
        "truck_type": body.get("truck_type", ""),
        "city": body.get("city", ""),
        "rating": (existing or {}).get("rating", 5.0),
        "is_online": (existing or {}).get("is_online", False),
        "last_lat": (existing or {}).get("last_lat"),
        "last_lng": (existing or {}).get("last_lng"),
        # KYC verification (admin must approve before going online).
        "verification_status": (existing or {}).get("verification_status", "pending"),
        "documents": (existing or {}).get("documents", {}),
        "rejection_reason": (existing or {}).get("rejection_reason"),
        "created_at": (existing or {}).get("created_at") or _now(),
        "updated_at": _now(),
    }
    await db.tow_operators.update_one({"user_id": user["id"]}, {"$set": doc}, upsert=True)
    return _operator_public(doc)


@router.post("/operator/documents")
async def operator_documents(request: Request):
    """Attach uploaded document URLs (insurance / license / id_card) → status 'pending'."""
    user = await get_current_user(request)
    op = await db.tow_operators.find_one({"user_id": user["id"]}, {"_id": 0})
    if not op:
        raise HTTPException(status_code=400, detail="Inscrivez-vous comme dépanneur d'abord")
    body = await request.json()
    documents = dict(op.get("documents") or {})
    for k in ("insurance", "license", "id_card"):
        if body.get(k):
            documents[k] = body[k]
    await db.tow_operators.update_one(
        {"user_id": user["id"]},
        {"$set": {"documents": documents, "verification_status": "pending",
                  "rejection_reason": None, "updated_at": _now()}},
    )
    return {"ok": True, "documents": documents, "verification_status": "pending"}


@router.post("/operator/online")
async def operator_online(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    op = await db.tow_operators.find_one({"user_id": user["id"]}, {"_id": 0})
    if not op:
        raise HTTPException(status_code=400, detail="Inscrivez-vous comme dépanneur d'abord")
    if bool(body.get("online", True)) and op.get("verification_status") != "approved":
        raise HTTPException(status_code=403, detail="Votre compte doit être validé par l'équipe avant de passer en ligne")
    upd = {"is_online": bool(body.get("online", True)), "updated_at": _now()}
    if body.get("lat") is not None and body.get("lng") is not None:
        upd["last_lat"], upd["last_lng"] = body["lat"], body["lng"]
    await db.tow_operators.update_one({"user_id": user["id"]}, {"$set": upd})
    return {"ok": True, "is_online": upd["is_online"]}


@router.get("/operator/feed")
async def operator_feed(request: Request):
    """Pending requests an operator can accept (searching, unassigned, recent)."""
    user = await get_current_user(request)
    op = await db.tow_operators.find_one({"user_id": user["id"]}, {"_id": 0})
    if not op:
        raise HTTPException(status_code=400, detail="Inscrivez-vous comme dépanneur d'abord")
    docs = await db.towing_requests.find(
        {"status": "searching", "operator_id": None}).sort("created_at", -1).to_list(50)
    out = []
    for d in docs:
        d.pop("_id", None)
        if op.get("last_lat") is not None and d.get("pickup_lat") is not None:
            d["distance_km"] = round(calculate_distance(op["last_lat"], op["last_lng"], d["pickup_lat"], d["pickup_lng"]), 1)
        out.append(d)
    return out


@router.get("/operator/jobs")
async def operator_jobs(request: Request):
    user = await get_current_user(request)
    docs = await db.towing_requests.find({"operator_id": user["id"]}).sort("created_at", -1).to_list(50)
    for d in docs:
        d.pop("_id", None)
    return docs


@router.post("/requests/{req_id}/accept")
async def operator_accept(req_id: str, request: Request):
    """An operator claims a pending request (atomic). Real assignment."""
    user = await get_current_user(request)
    op = await db.tow_operators.find_one({"user_id": user["id"]}, {"_id": 0})
    if not op:
        raise HTTPException(status_code=400, detail="Inscrivez-vous comme dépanneur d'abord")
    operator = {
        "name": op.get("name", ""), "company": op.get("company", ""),
        "rating": op.get("rating", 5.0), "plate": op.get("plate", ""),
        "truck": op.get("truck_type", ""), "phone": op.get("phone", ""),
        "eta_minutes": 15, "user_id": user["id"],
    }
    start = None
    if op.get("last_lat") is not None:
        start = {"lat": op["last_lat"], "lng": op["last_lng"]}
    req = await db.towing_requests.find_one_and_update(
        {"id": req_id, "status": "searching", "operator_id": None},
        {"$set": {"operator_id": user["id"], "operator": operator, "operator_kind": "real",
                  "operator_start": start, "operator_position": start,
                  "status": "en_route", "accepted_at": _now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not req:
        raise HTTPException(status_code=409, detail="Demande déjà prise ou indisponible")
    await create_notification(
        req["user_id"], "towing_accepted", "🚗 Un dépanneur arrive !",
        f"{operator['name']} ({operator['company']}) a accepté votre demande.",
        {"request_id": req_id, "url": "/towing"},
    )
    req.pop("_id", None)
    return req


@router.post("/requests/{req_id}/operator-status")
async def operator_update_status(req_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    new_status = body.get("status")
    if new_status not in ("en_route", "arrived"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    res = await db.towing_requests.find_one_and_update(
        {"id": req_id, "operator_id": user["id"], "status": {"$nin": ["completed", "cancelled"]}},
        {"$set": {"status": new_status, "updated_at": _now()}},
        return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    label = "📍 Votre dépanneur est sur place" if new_status == "arrived" else "🚗 Dépanneur en route"
    await create_notification(res["user_id"], "towing_status", label, res.get("problem_label", ""),
                              {"request_id": req_id, "url": "/towing"})
    res.pop("_id", None)
    return res


@router.post("/requests/{req_id}/operator-ping")
async def operator_ping(req_id: str, request: Request):
    """Operator shares live position; ETA recomputed from distance (~30 km/h)."""
    user = await get_current_user(request)
    body = await request.json()
    lat, lng = body.get("lat"), body.get("lng")
    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="Position requise")
    req = await db.towing_requests.find_one({"id": req_id, "operator_id": user["id"]}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Intervention introuvable")
    eta = 0
    if req.get("pickup_lat") is not None:
        dist = calculate_distance(lat, lng, req["pickup_lat"], req["pickup_lng"])
        eta = max(1, round(dist / 30 * 60))
    operator = dict(req.get("operator") or {})
    operator["eta_minutes"] = eta
    await db.towing_requests.update_one(
        {"id": req_id},
        {"$set": {"operator_position": {"lat": lat, "lng": lng}, "operator": operator}},
    )
    await db.tow_operators.update_one({"user_id": user["id"]}, {"$set": {"last_lat": lat, "last_lng": lng}})
    return {"ok": True, "eta_minutes": eta}



# ── Admin: operator verification (KYC) + commission + revenue ───────────────
from core.deps import require_role  # noqa: E402

admin_router = APIRouter(prefix="/admin/towing", tags=["admin-towing"])


@admin_router.get("/operators")
async def admin_list_operators(request: Request):
    await require_role(request, ["admin"])
    ops = await db.tow_operators.find({}).sort("created_at", -1).to_list(500)
    out = []
    for op in ops:
        op.pop("_id", None)
        jobs = await db.towing_requests.count_documents({"operator_id": op["user_id"], "status": "completed"})
        op["completed_jobs"] = jobs
        out.append(op)
    counts = {
        "pending": sum(1 for o in out if o.get("verification_status") == "pending"),
        "approved": sum(1 for o in out if o.get("verification_status") == "approved"),
        "rejected": sum(1 for o in out if o.get("verification_status") == "rejected"),
        "total": len(out),
    }
    return {"operators": out, "counts": counts}


@admin_router.post("/operators/{user_id}/verify")
async def admin_verify_operator(user_id: str, request: Request):
    admin = await require_role(request, ["admin"])
    body = await request.json()
    action = body.get("action")
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action invalide (approve/reject)")
    op = await db.tow_operators.find_one({"user_id": user_id}, {"_id": 0})
    if not op:
        raise HTTPException(status_code=404, detail="Dépanneur introuvable")
    status = "approved" if action == "approve" else "rejected"
    upd = {"verification_status": status, "verified_at": _now(),
           "verified_by": admin.get("id"), "updated_at": _now()}
    if action == "reject":
        upd["rejection_reason"] = body.get("reason", "")
        upd["is_online"] = False
    else:
        upd["rejection_reason"] = None
    await db.tow_operators.update_one({"user_id": user_id}, {"$set": upd})
    title = "✅ Compte dépanneur validé" if action == "approve" else "❌ Compte dépanneur refusé"
    msg = "Vous pouvez maintenant passer en ligne et recevoir des demandes." if action == "approve" \
        else f"Motif : {body.get('reason', 'documents non conformes')}"
    try:
        await create_notification(user_id, "towing_verification", title, msg, {"url": "/espace-depanneur"})
    except Exception:
        pass
    return {"ok": True, "verification_status": status}


@admin_router.get("/settings")
async def admin_get_settings(request: Request):
    await require_role(request, ["admin"])
    return {"commission_pct": await _commission_pct()}


@admin_router.put("/settings")
async def admin_set_settings(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    try:
        pct = float(body.get("commission_pct"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Commission invalide")
    if not (0 <= pct <= 0.9):
        raise HTTPException(status_code=400, detail="La commission doit être entre 0 et 90%")
    await db.towing_settings.update_one({"id": "config"}, {"$set": {"id": "config", "commission_pct": pct}}, upsert=True)
    return {"ok": True, "commission_pct": pct}


@admin_router.get("/revenue")
async def admin_revenue(request: Request):
    await require_role(request, ["admin"])
    rows = await db.towing_revenue.find({}, {"_id": 0}).to_list(5000)
    total_gmv = round(sum(float(r.get("total", 0) or 0) for r in rows), 2)
    total_commission = round(sum(float(r.get("commission", 0) or 0) for r in rows), 2)
    total_payout = round(sum(float(r.get("operator_earning", 0) or 0) for r in rows), 2)
    return {"count": len(rows), "gmv": total_gmv, "commission": total_commission,
            "operator_payout": total_payout, "commission_pct": await _commission_pct()}
