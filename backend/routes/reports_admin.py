"""Admin « Rapports » center — mirrors the production menu:
  - results            (Rapport sur les résultats)
  - payments           (Rapport de paiement)
  - exceptional        (Rapport exceptionnel)
  - refused-cancelled  (Alertes refusées/annulées)
  - other              (Autres rapports)

Every endpoint accepts ?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD and returns a
uniform shape { kpis:[{label,value,color?}], columns:[{key,label}], rows:[...] }
so the frontend renders + exports (CSV/PDF) generically.
"""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Request
from typing import Optional

from core.config import db
from core.deps import require_role

router = APIRouter(prefix="/admin/reports", tags=["admin-reports"])

COMMISSION_RATE = 0.15


def _range(date_from, date_to):
    """Return (start_iso, end_iso) for the created_at filter; default = last 30 days."""
    if date_to:
        end = f"{date_to}T23:59:59"
    else:
        end = datetime.now(timezone.utc).isoformat()
    if date_from:
        start = f"{date_from}T00:00:00"
    else:
        start = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    return start, end


def _fare(r):
    return r.get("final_fare") or r.get("estimated_fare") or 0


def _day(iso):
    return (iso or "")[:10]


async def _names(user_ids):
    ids = [u for u in set(user_ids) if u]
    if not ids:
        return {}
    docs = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(8000)
    return {d["id"]: d.get("name") for d in docs}


# ───────────────────── RESULTS ─────────────────────
@router.get("/results")
async def report_results(request: Request, date_from: Optional[str] = None, date_to: Optional[str] = None):
    await require_role(request, ["admin", "dispatcher"])
    start, end = _range(date_from, date_to)
    flt = {"created_at": {"$gte": start, "$lte": end}}
    rides = await db.rides.find(flt, {"_id": 0, "status": 1, "created_at": 1, "final_fare": 1, "estimated_fare": 1}).to_list(20000)
    orders = await db.orders.find(flt, {"_id": 0, "status": 1, "created_at": 1, "total": 1}).to_list(20000)

    completed = [r for r in rides if r.get("status") == "completed"]
    cancelled = [r for r in rides if r.get("status") == "cancelled"]
    revenue = round(sum(_fare(r) for r in completed), 2)
    commission = round(revenue * COMMISSION_RATE, 2)
    avg_fare = round(revenue / len(completed), 2) if completed else 0
    delivered = [o for o in orders if o.get("status") == "delivered"]
    order_rev = round(sum(o.get("total") or 0 for o in delivered), 2)

    daily = {}
    for r in rides:
        d = daily.setdefault(_day(r.get("created_at")), {"date": _day(r.get("created_at")), "courses": 0, "completed": 0, "cancelled": 0, "revenue": 0.0})
        d["courses"] += 1
        if r.get("status") == "completed":
            d["completed"] += 1
            d["revenue"] = round(d["revenue"] + _fare(r), 2)
        elif r.get("status") == "cancelled":
            d["cancelled"] += 1
    rows = sorted(daily.values(), key=lambda x: x["date"], reverse=True)

    return {
        "kpis": [
            {"label": "Courses totales", "value": len(rides), "color": "#2563EB"},
            {"label": "Terminées", "value": len(completed), "color": "#059669"},
            {"label": "Annulées", "value": len(cancelled), "color": "#DC2626"},
            {"label": "CA courses", "value": f"{revenue} €", "color": "#0891B2"},
            {"label": "Commission (15%)", "value": f"{commission} €", "color": "#7C3AED"},
            {"label": "Panier moyen", "value": f"{avg_fare} €", "color": "#EA580C"},
            {"label": "Commandes livrées", "value": len(delivered), "color": "#059669"},
            {"label": "CA commandes", "value": f"{order_rev} €", "color": "#0891B2"},
        ],
        "columns": [
            {"key": "date", "label": "Date"}, {"key": "courses", "label": "Courses"},
            {"key": "completed", "label": "Terminées"}, {"key": "cancelled", "label": "Annulées"},
            {"key": "revenue", "label": "CA (€)"},
        ],
        "rows": rows,
    }


# ───────────────────── PAYMENTS ─────────────────────
@router.get("/payments")
async def report_payments(request: Request, date_from: Optional[str] = None, date_to: Optional[str] = None):
    await require_role(request, ["admin", "dispatcher"])
    start, end = _range(date_from, date_to)
    flt = {"created_at": {"$gte": start, "$lte": end}, "status": "completed"}
    rides = await db.rides.find(flt, {"_id": 0, "payment_method": 1, "final_fare": 1, "estimated_fare": 1, "created_at": 1}).to_list(20000)
    oflt = {"created_at": {"$gte": start, "$lte": end}, "status": "delivered"}
    orders = await db.orders.find(oflt, {"_id": 0, "payment_method": 1, "total": 1, "created_at": 1}).to_list(20000)

    methods = {}
    def _add(method, amount):
        m = methods.setdefault(method or "cash", {"method": method or "cash", "count": 0, "total": 0.0})
        m["count"] += 1
        m["total"] = round(m["total"] + amount, 2)
    for r in rides:
        _add(r.get("payment_method"), _fare(r))
    for o in orders:
        _add(o.get("payment_method"), o.get("total") or 0)

    LABELS = {"cash": "Espèces", "card": "Carte", "wallet": "SB Pay", "online": "En ligne"}
    rows = []
    for m in methods.values():
        rows.append({"method": LABELS.get(m["method"], m["method"]), "count": m["count"], "total": round(m["total"], 2)})
    rows.sort(key=lambda x: -x["total"])

    cash_total = round(sum(m["total"] for k, m in methods.items() if k == "cash"), 2)
    grand_total = round(sum(m["total"] for m in methods.values()), 2)
    digital_total = round(grand_total - cash_total, 2)
    commission = round(grand_total * COMMISSION_RATE, 2)

    return {
        "kpis": [
            {"label": "Encaissements totaux", "value": f"{grand_total} €", "color": "#0891B2"},
            {"label": "Espèces", "value": f"{cash_total} €", "color": "#EA580C"},
            {"label": "Digital (carte+SB Pay)", "value": f"{digital_total} €", "color": "#2563EB"},
            {"label": "Commission (15%)", "value": f"{commission} €", "color": "#7C3AED"},
            {"label": "Net chauffeurs/marchands", "value": f"{round(grand_total - commission, 2)} €", "color": "#059669"},
        ],
        "columns": [
            {"key": "method", "label": "Moyen de paiement"}, {"key": "count", "label": "Transactions"},
            {"key": "total", "label": "Montant (€)"},
        ],
        "rows": rows,
    }


# ───────────────────── EXCEPTIONAL ─────────────────────
@router.get("/exceptional")
async def report_exceptional(request: Request, date_from: Optional[str] = None, date_to: Optional[str] = None):
    await require_role(request, ["admin", "dispatcher"])
    start, end = _range(date_from, date_to)
    flt = {"created_at": {"$gte": start, "$lte": end}}
    total = await db.rides.count_documents(flt)
    no_driver = await db.rides.count_documents({**flt, "no_driver_outcome": {"$in": ["bidding", "scheduled"]}})
    cancelled = await db.rides.count_documents({**flt, "status": "cancelled"})
    switched_cash = await db.rides.count_documents({**flt, "payment_switched_to_cash": True})

    # Rides with a notable fare gap (proposed vs final) or flagged anomalies.
    anomalies = await db.rides.find({
        **flt, "$or": [
            {"no_driver_outcome": {"$in": ["bidding", "scheduled"]}},
            {"payment_switched_to_cash": True},
            {"fraud_flagged": True},
        ],
    }, {"_id": 0, "id": 1, "booking_no": 1, "status": 1, "no_driver_outcome": 1,
        "payment_switched_to_cash": 1, "fraud_flagged": 1, "created_at": 1, "pickup_address": 1}).sort("created_at", -1).limit(500).to_list(500)
    rows = []
    for a in anomalies:
        kinds = []
        if a.get("no_driver_outcome"):
            kinds.append(f"Sans chauffeur → {a['no_driver_outcome']}")
        if a.get("payment_switched_to_cash"):
            kinds.append("Bascule espèces")
        if a.get("fraud_flagged"):
            kinds.append("Fraude suspectée")
        rows.append({"booking_no": a.get("booking_no") or a.get("id", "")[-6:], "type": ", ".join(kinds) or "—",
                     "status": a.get("status"), "pickup": a.get("pickup_address"), "date": _day(a.get("created_at"))})

    return {
        "kpis": [
            {"label": "Courses (période)", "value": total, "color": "#2563EB"},
            {"label": "Sans chauffeur", "value": no_driver, "color": "#EA580C"},
            {"label": "Annulées", "value": cancelled, "color": "#DC2626"},
            {"label": "Basculées espèces", "value": switched_cash, "color": "#7C3AED"},
            {"label": "Taux d'annulation", "value": f"{round(cancelled / total * 100, 1) if total else 0}%", "color": "#DC2626"},
        ],
        "columns": [
            {"key": "booking_no", "label": "N°"}, {"key": "type", "label": "Anomalie"},
            {"key": "status", "label": "Statut"}, {"key": "pickup", "label": "Départ"}, {"key": "date", "label": "Date"},
        ],
        "rows": rows,
    }


# ───────────────────── REFUSED / CANCELLED ─────────────────────
@router.get("/refused-cancelled")
async def report_refused_cancelled(request: Request, date_from: Optional[str] = None, date_to: Optional[str] = None):
    await require_role(request, ["admin", "dispatcher"])
    start, end = _range(date_from, date_to)
    flt = {"created_at": {"$gte": start, "$lte": end}, "status": "cancelled"}
    rides = await db.rides.find(flt, {"_id": 0, "id": 1, "booking_no": 1, "user_id": 1, "driver_name": 1,
                                      "cancel_reason": 1, "cancelled_by": 1, "created_at": 1,
                                      "final_fare": 1, "estimated_fare": 1, "pickup_address": 1}).sort("created_at", -1).limit(1000).to_list(1000)
    names = await _names([r.get("user_id") for r in rides])
    by_actor = {}
    rows = []
    for r in rides:
        actor = r.get("cancelled_by") or "inconnu"
        by_actor[actor] = by_actor.get(actor, 0) + 1
        rows.append({
            "booking_no": r.get("booking_no") or r.get("id", "")[-6:],
            "customer": names.get(r.get("user_id")) or "—",
            "driver": r.get("driver_name") or "—",
            "by": actor, "reason": r.get("cancel_reason") or "—",
            "fare": round(_fare(r), 2), "date": _day(r.get("created_at")),
        })
    ocancelled = await db.orders.count_documents({"created_at": {"$gte": start, "$lte": end}, "status": "cancelled"})

    ACTOR = {"user": "Client", "driver": "Chauffeur", "admin": "Admin", "system": "Système", "inconnu": "Inconnu"}
    return {
        "kpis": [
            {"label": "Courses annulées", "value": len(rides), "color": "#DC2626"},
            {"label": "Par le client", "value": by_actor.get("user", 0), "color": "#EA580C"},
            {"label": "Par le chauffeur", "value": by_actor.get("driver", 0), "color": "#7C3AED"},
            {"label": "Par l'admin", "value": by_actor.get("admin", 0), "color": "#2563EB"},
            {"label": "Commandes annulées", "value": ocancelled, "color": "#DC2626"},
        ],
        "columns": [
            {"key": "booking_no", "label": "N°"}, {"key": "customer", "label": "Client"},
            {"key": "driver", "label": "Chauffeur"}, {"key": "by", "label": "Annulé par"},
            {"key": "reason", "label": "Motif"}, {"key": "fare", "label": "Tarif (€)"}, {"key": "date", "label": "Date"},
        ],
        "rows": [{**r, "by": ACTOR.get(r["by"], r["by"])} for r in rows],
    }


# ───────────────────── OTHER ─────────────────────
@router.get("/other")
async def report_other(request: Request, date_from: Optional[str] = None, date_to: Optional[str] = None):
    await require_role(request, ["admin", "dispatcher"])
    start, end = _range(date_from, date_to)
    flt = {"created_at": {"$gte": start, "$lte": end}}
    new_users = await db.users.count_documents({**flt, "role": "user"})
    new_drivers = await db.drivers.count_documents(flt)
    new_merchants = await db.merchants.count_documents(flt)

    top_drivers = await db.drivers.find({}, {"_id": 0, "id": 1, "user_id": 1, "total_trips": 1, "rating": 1, "earnings": 1}).sort("total_trips", -1).limit(15).to_list(15)
    names = await _names([d.get("user_id") for d in top_drivers])
    rows = [{
        "driver": names.get(d.get("user_id")) or "—",
        "trips": d.get("total_trips") or 0,
        "rating": round(d.get("rating") or 5.0, 1),
        "earnings": round(d.get("earnings") or 0, 2),
    } for d in top_drivers]

    return {
        "kpis": [
            {"label": "Nouveaux clients", "value": new_users, "color": "#2563EB"},
            {"label": "Nouveaux chauffeurs", "value": new_drivers, "color": "#059669"},
            {"label": "Nouveaux marchands", "value": new_merchants, "color": "#7C3AED"},
        ],
        "columns": [
            {"key": "driver", "label": "Chauffeur"}, {"key": "trips", "label": "Courses"},
            {"key": "rating", "label": "Note"}, {"key": "earnings", "label": "Gains (€)"},
        ],
        "rows": rows,
    }
