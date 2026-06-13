"""
SB Ferry — billetterie maritime (Antilles).

Permet d'acheter un billet de bateau, qu'il soit :
  - INTER-ÎLES (ex. Fort-de-France ⇄ Pointe-à-Pitre, ⇄ Roseau, ⇄ Castries…)
  - LOCAL / intra-île (ex. Fort-de-France ⇄ Les Trois-Îlets, ⇄ Sainte-Anne…)

Le client recherche un trajet (port départ → port arrivée + date), choisit un
horaire, renseigne ses passagers, paie via SB Pay, et reçoit un billet avec
référence + QR. Une correspondance « SB Drive VTC vers le port » est proposée.

Collections :
  - ferry_ports     : {id, name, city, island, lat, lng, is_active}
  - ferry_companies : {id, name, color, is_active}
  - ferry_routes    : {id, company_id, company_name, from_port_id, from_label,
                       to_port_id, to_label, route_type, duration_min,
                       price_adult, price_child, departure_times[], is_active,
                       display_order}
  - ferry_bookings  : billet émis (réf, passagers, total, statut, qr_payload…)
"""
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, Depends

from core.config import db
from core.permissions import require_permission
from core.deps import get_current_user

public_router = APIRouter(prefix="/ferry", tags=["ferry"])
admin_router = APIRouter(prefix="/admin/ferry", tags=["admin-ferry"])


def _now():
    return datetime.now(timezone.utc).isoformat()


def _ref():
    return f"SBF-{uuid.uuid4().hex[:8].upper()}"


# ============================================================
# Seed (idempotent)
# ============================================================

_PORTS = [
    # Martinique
    ("ftdf", "Gare maritime de Fort-de-France", "Fort-de-France", "Martinique", 14.5996, -61.0733),
    ("trois", "Anse Mitan — Les Trois-Îlets", "Les Trois-Îlets", "Martinique", 14.5489, -61.0494),
    ("steanne", "Embarcadère de Sainte-Anne", "Sainte-Anne", "Martinique", 14.4361, -60.8853),
    ("marin", "Port du Marin", "Le Marin", "Martinique", 14.4694, -60.8669),
    # Guadeloupe
    ("ptp", "Gare maritime de Pointe-à-Pitre", "Pointe-à-Pitre", "Guadeloupe", 16.2376, -61.5344),
    ("saintes", "Terre-de-Haut — Les Saintes", "Les Saintes", "Guadeloupe", 15.8669, -61.5847),
    ("mgalante", "Grand-Bourg — Marie-Galante", "Marie-Galante", "Guadeloupe", 15.8853, -61.3094),
    # Dominique / Sainte-Lucie
    ("roseau", "Port de Roseau", "Roseau", "Dominique", 15.3017, -61.3881),
    ("castries", "Port de Castries", "Castries", "Sainte-Lucie", 14.0167, -60.9897),
]

_COMPANIES = [
    ("expdesiles", "L'Express des Îles", "#0EA5E9"),
    ("valferry", "Val'Ferry", "#F97316"),
    ("cmwi", "Compagnie Maritime West Indies", "#10B981"),
]

# (company_id, from_port, to_port, route_type, duration_min, price_adult, price_child, [times])
_ROUTES = [
    # Local — baie de Fort-de-France (navettes fréquentes)
    ("valferry", "ftdf", "trois", "local", 20, 7.0, 4.0, ["06:30", "07:30", "08:30", "12:00", "16:00", "18:00", "19:30"]),
    ("valferry", "ftdf", "steanne", "local", 45, 12.0, 7.0, ["07:00", "09:30", "15:00", "17:30"]),
    ("valferry", "ftdf", "marin", "local", 50, 14.0, 8.0, ["08:00", "16:30"]),
    # Inter-îles
    ("expdesiles", "ftdf", "ptp", "inter_island", 240, 79.0, 49.0, ["07:30", "14:00"]),
    ("expdesiles", "ftdf", "roseau", "inter_island", 120, 65.0, 45.0, ["08:00"]),
    ("expdesiles", "ftdf", "castries", "inter_island", 90, 59.0, 39.0, ["09:00", "16:00"]),
    ("cmwi", "ptp", "saintes", "inter_island", 45, 25.0, 15.0, ["08:00", "13:00", "17:00"]),
    ("cmwi", "ptp", "mgalante", "inter_island", 60, 28.0, 18.0, ["08:15", "12:45", "17:15"]),
]


async def seed_ferry():
    """Seed ports, companies and routes (both directions) if none exist."""
    if await db.ferry_routes.count_documents({}) > 0:
        return
    port_label = {}
    if await db.ferry_ports.count_documents({}) == 0:
        docs = []
        for key, name, city, island, lat, lng in _PORTS:
            docs.append({"id": f"fpt_{key}", "name": name, "city": city, "island": island,
                         "lat": lat, "lng": lng, "is_active": True})
        await db.ferry_ports.insert_many(docs)
    for key, name, city, island, lat, lng in _PORTS:
        port_label[f"fpt_{key}"] = f"{city} ({island})"

    company_name = {}
    if await db.ferry_companies.count_documents({}) == 0:
        docs = []
        for key, name, color in _COMPANIES:
            docs.append({"id": f"fco_{key}", "name": name, "color": color, "is_active": True})
        await db.ferry_companies.insert_many(docs)
    for key, name, color in _COMPANIES:
        company_name[f"fco_{key}"] = name

    routes = []
    order = 0
    for cid, frm, to, rtype, dur, pa, pc, times in _ROUTES:
        for a, b in ((frm, to), (to, frm)):  # both directions
            routes.append({
                "id": f"frt_{uuid.uuid4().hex[:10]}",
                "company_id": f"fco_{cid}", "company_name": company_name[f"fco_{cid}"],
                "from_port_id": f"fpt_{a}", "from_label": port_label[f"fpt_{a}"],
                "to_port_id": f"fpt_{b}", "to_label": port_label[f"fpt_{b}"],
                "route_type": rtype, "duration_min": dur,
                "price_adult": pa, "price_child": pc,
                "departure_times": times, "is_active": True, "display_order": order,
                "created_at": _now(), "updated_at": _now(),
            })
            order += 1
    if routes:
        await db.ferry_routes.insert_many(routes)


# ============================================================
# Public
# ============================================================

@public_router.get("/ports")
async def list_ports():
    ports = await db.ferry_ports.find({"is_active": True}, {"_id": 0}).sort("city", 1).to_list(200)
    return {"ports": ports}


@public_router.get("/routes")
async def search_routes(from_port: str = "", to_port: str = "", q: str = "", route_type: str = ""):
    """Search active routes. Filter by from/to port id, free-text (port/city/island), or type."""
    query = {"is_active": True}
    if from_port:
        query["from_port_id"] = from_port
    if to_port:
        query["to_port_id"] = to_port
    if route_type in ("local", "inter_island"):
        query["route_type"] = route_type
    routes = await db.ferry_routes.find(query, {"_id": 0}).sort("display_order", 1).to_list(300)
    if q:
        ql = q.strip().lower()
        routes = [r for r in routes if ql in (r.get("from_label", "") + " " + r.get("to_label", "")).lower()]
    return {"routes": routes, "count": len(routes)}


@public_router.get("/routes/{route_id}")
async def route_detail(route_id: str):
    r = await db.ferry_routes.find_one({"id": route_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    return r


@public_router.post("/bookings")
async def create_booking(request: Request):
    """Create a ferry booking, charge SB Pay wallet, issue ticket (ref + QR)."""
    user = await get_current_user(request)
    body = await request.json()

    route = await db.ferry_routes.find_one({"id": body.get("route_id")}, {"_id": 0})
    if not route or not route.get("is_active"):
        raise HTTPException(status_code=404, detail="Trajet indisponible")

    adults = max(1, int(body.get("adults", 1)))
    children = max(0, int(body.get("children", 0)))
    travel_date = (body.get("travel_date") or "").strip()
    departure_time = (body.get("departure_time") or "").strip()
    if not travel_date or not departure_time:
        raise HTTPException(status_code=400, detail="Date et horaire requis")
    if travel_date < datetime.now(timezone.utc).date().isoformat():
        raise HTTPException(status_code=400, detail="La date de voyage est déjà passée")
    if departure_time not in (route.get("departure_times") or []):
        raise HTTPException(status_code=400, detail="Horaire indisponible")

    unit_adult = float(route["price_adult"])
    unit_child = float(route["price_child"])
    total = round(adults * unit_adult + children * unit_child, 2)

    payment_method = body.get("payment_method", "sbpay")
    if payment_method == "sbpay":
        wallet = await db.wallets.find_one({"user_id": user["id"]})
        balance = (wallet or {}).get("balance", 0)
        if not wallet or balance < total:
            raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant. Rechargez votre portefeuille.")
        new_balance = round(balance - total, 2)
        await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": new_balance}})

    ref = _ref()
    qr_payload = json.dumps({"ref": ref, "from": route["from_label"], "to": route["to_label"],
                             "date": travel_date, "time": departure_time,
                             "pax": adults + children, "type": "sb_ferry"}, ensure_ascii=False)
    booking = {
        "id": f"fbk_{uuid.uuid4().hex[:12]}",
        "booking_ref": ref,
        "user_id": user["id"],
        "route_id": route["id"],
        "company_name": route["company_name"],
        "from_port_id": route["from_port_id"], "from_label": route["from_label"],
        "to_port_id": route["to_port_id"], "to_label": route["to_label"],
        "route_type": route["route_type"], "duration_min": route["duration_min"],
        "travel_date": travel_date, "departure_time": departure_time,
        "adults": adults, "children": children,
        "passengers": body.get("passengers", []),
        "unit_adult": unit_adult, "unit_child": unit_child,
        "total": total, "currency": "EUR",
        "payment_method": payment_method, "status": "confirmed",
        "qr_payload": qr_payload,
        "created_at": _now(),
    }
    await db.ferry_bookings.insert_one(dict(booking))

    if payment_method == "sbpay":
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
            "amount": -total, "balance_after": new_balance,
            "description": f"SB Ferry {route['from_label']} → {route['to_label']}",
            "status": "completed", "created_at": _now(),
        })
        try:
            from core.cashback import award_cashback
            await award_cashback(user["id"], total, "sbpay", "ferry", ref_id=booking["id"])
        except Exception:
            pass

    booking.pop("_id", None)
    return booking


@public_router.get("/bookings")
async def my_bookings(request: Request):
    user = await get_current_user(request)
    items = await db.ferry_bookings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"bookings": items}


@public_router.get("/bookings/{booking_id}")
async def booking_detail(booking_id: str, request: Request):
    user = await get_current_user(request)
    b = await db.ferry_bookings.find_one({"id": booking_id, "user_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Billet introuvable")
    # Attach departure port coordinates for the VTC connection.
    port = await db.ferry_ports.find_one({"id": b["from_port_id"]}, {"_id": 0})
    b["from_port"] = port
    return b


# ============================================================
# Admin CMS
# ============================================================

@admin_router.get("/companies")
async def admin_companies(current_user: dict = Depends(require_permission("content.manage"))):
    items = await db.ferry_companies.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    return {"companies": items}


@admin_router.post("/companies")
async def admin_create_company(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    if not (body.get("name") or "").strip():
        raise HTTPException(status_code=400, detail="Nom requis")
    doc = {"id": f"fco_{uuid.uuid4().hex[:8]}", "name": body["name"].strip(),
           "color": body.get("color", "#0EA5E9"), "is_active": bool(body.get("is_active", True))}
    await db.ferry_companies.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@admin_router.get("/ports")
async def admin_ports(current_user: dict = Depends(require_permission("content.manage"))):
    items = await db.ferry_ports.find({}, {"_id": 0}).sort("city", 1).to_list(300)
    return {"ports": items}


@admin_router.post("/ports")
async def admin_create_port(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    if not (body.get("name") or "").strip():
        raise HTTPException(status_code=400, detail="Nom requis")
    doc = {"id": f"fpt_{uuid.uuid4().hex[:8]}", "name": body["name"].strip(),
           "city": body.get("city", ""), "island": body.get("island", ""),
           "lat": body.get("lat"), "lng": body.get("lng"), "is_active": bool(body.get("is_active", True))}
    await db.ferry_ports.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


def _route_payload(body, *, creating):
    out = {}
    for k in ("company_id", "company_name", "from_port_id", "from_label", "to_port_id",
              "to_label", "route_type"):
        if creating or k in body:
            out[k] = body.get(k)
    if creating or "duration_min" in body:
        out["duration_min"] = int(body.get("duration_min", 30))
    if creating or "price_adult" in body:
        out["price_adult"] = float(body.get("price_adult", 0))
    if creating or "price_child" in body:
        out["price_child"] = float(body.get("price_child", 0))
    if creating or "departure_times" in body:
        times = body.get("departure_times", [])
        if isinstance(times, str):
            times = [t.strip() for t in times.split(",") if t.strip()]
        out["departure_times"] = times
    if creating or "is_active" in body:
        out["is_active"] = bool(body.get("is_active", True))
    if "display_order" in body and body.get("display_order") is not None:
        out["display_order"] = int(body["display_order"])
    return out


@admin_router.get("/routes")
async def admin_routes(current_user: dict = Depends(require_permission("content.manage"))):
    items = await db.ferry_routes.find({}, {"_id": 0}).sort("display_order", 1).to_list(500)
    return {"routes": items, "count": len(items)}


@admin_router.post("/routes")
async def admin_create_route(request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    data = _route_payload(body, creating=True)
    if not data.get("from_label") or not data.get("to_label"):
        raise HTTPException(status_code=400, detail="Ports de départ et d'arrivée requis")
    last = await db.ferry_routes.find_one({}, sort=[("display_order", -1)])
    doc = {"id": f"frt_{uuid.uuid4().hex[:10]}", **data,
           "display_order": data.get("display_order", (last.get("display_order", 0) + 1) if last else 0),
           "created_at": _now(), "updated_at": _now()}
    await db.ferry_routes.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@admin_router.put("/routes/{route_id}")
async def admin_update_route(route_id: str, request: Request, current_user: dict = Depends(require_permission("content.manage"))):
    body = await request.json()
    existing = await db.ferry_routes.find_one({"id": route_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    patch = _route_payload(body, creating=False)
    patch["updated_at"] = _now()
    await db.ferry_routes.update_one({"id": route_id}, {"$set": patch})
    return {**existing, **patch}


@admin_router.patch("/routes/{route_id}/toggle")
async def admin_toggle_route(route_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    existing = await db.ferry_routes.find_one({"id": route_id}, {"_id": 0, "is_active": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    new_val = not existing.get("is_active", True)
    await db.ferry_routes.update_one({"id": route_id}, {"$set": {"is_active": new_val, "updated_at": _now()}})
    return {"id": route_id, "is_active": new_val}


@admin_router.delete("/routes/{route_id}")
async def admin_delete_route(route_id: str, current_user: dict = Depends(require_permission("content.manage"))):
    res = await db.ferry_routes.delete_one({"id": route_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Trajet introuvable")
    return {"ok": True, "deleted": route_id}


@admin_router.get("/bookings")
async def admin_bookings(current_user: dict = Depends(require_permission("content.manage")), limit: int = 100):
    items = await db.ferry_bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(min(limit, 500))
    revenue = round(sum(b.get("total", 0) for b in items), 2)
    return {"bookings": items, "count": len(items), "revenue": revenue}
