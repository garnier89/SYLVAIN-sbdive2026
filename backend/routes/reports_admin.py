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
import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

import resend
from fastapi import APIRouter, Request, HTTPException
from typing import Optional

from core.config import db
from core.deps import require_role

logger = logging.getLogger(__name__)
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
    return await _compute_results(*_range(date_from, date_to))


async def _compute_results(start, end):
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
    chart_data = sorted(daily.values(), key=lambda x: x["date"])

    return {
        "chart": {
            "type": "line", "x": "date", "title": "Tendance CA & courses",
            "series": [
                {"key": "revenue", "label": "CA (€)", "color": "#0891B2"},
                {"key": "courses", "label": "Courses", "color": "#2563EB"},
            ],
            "data": chart_data,
        },
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
    return await _compute_payments(*_range(date_from, date_to))


async def _compute_payments(start, end):
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
        "chart": {
            "type": "bar", "x": "method", "title": "Encaissements par moyen de paiement",
            "series": [{"key": "total", "label": "Montant (€)", "color": "#0891B2"}],
            "data": rows,
        },
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
    return await _compute_exceptional(*_range(date_from, date_to))


async def _compute_exceptional(start, end):
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
        "chart": {
            "type": "bar", "x": "label", "title": "Répartition des anomalies",
            "series": [{"key": "value", "label": "Nombre", "color": "#EA580C"}],
            "data": [
                {"label": "Sans chauffeur", "value": no_driver},
                {"label": "Annulées", "value": cancelled},
                {"label": "Basculées espèces", "value": switched_cash},
            ],
        },
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
    return await _compute_refused_cancelled(*_range(date_from, date_to))


async def _compute_refused_cancelled(start, end):
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
        "chart": {
            "type": "bar", "x": "label", "title": "Annulations par responsable",
            "series": [{"key": "value", "label": "Annulations", "color": "#DC2626"}],
            "data": [
                {"label": "Client", "value": by_actor.get("user", 0)},
                {"label": "Chauffeur", "value": by_actor.get("driver", 0)},
                {"label": "Admin", "value": by_actor.get("admin", 0)},
                {"label": "Système", "value": by_actor.get("system", 0)},
            ],
        },
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
    return await _compute_other(*_range(date_from, date_to))


async def _compute_other(start, end):
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
        "chart": {
            "type": "bar", "x": "driver", "title": "Top chauffeurs (courses)",
            "series": [{"key": "trips", "label": "Courses", "color": "#059669"}],
            "data": rows[:10],
        },
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


# ───────────────────── REFERRAL / MLM ─────────────────────
@router.get("/referral")
async def report_referral(request: Request, date_from: Optional[str] = None, date_to: Optional[str] = None):
    await require_role(request, ["admin", "dispatcher"])
    return await _compute_referral(*_range(date_from, date_to))


async def _compute_referral(start, end):
    flt = {"created_at": {"$gte": start, "$lte": end}}
    refs = await db.referrals.find(flt, {"_id": 0, "referrer_id": 1, "referred_id": 1, "referred_name": 1,
                                         "amount_earned": 1, "status": 1, "created_at": 1}).to_list(20000)
    total = len(refs)
    rewarded = [r for r in refs if r.get("status") in ("completed", "rewarded", "credited")]
    total_paid = round(sum(float(r.get("amount_earned") or 0) for r in refs), 2)

    by_ref = {}
    for r in refs:
        rid = r.get("referrer_id")
        if not rid:
            continue
        b = by_ref.setdefault(rid, {"referrer_id": rid, "count": 0, "earned": 0.0, "last": ""})
        b["count"] += 1
        b["earned"] = round(b["earned"] + float(r.get("amount_earned") or 0), 2)
        b["last"] = max(b["last"], _day(r.get("created_at")))
    names = await _names(list(by_ref.keys()))
    rows = [{"referrer": names.get(k) or "—", "count": v["count"], "earned": v["earned"], "last": v["last"]}
            for k, v in by_ref.items()]
    rows.sort(key=lambda x: -x["count"])

    return {
        "chart": {
            "type": "bar", "x": "referrer", "title": "Top parrains (filleuls)",
            "series": [{"key": "count", "label": "Filleuls", "color": "#7C3AED"}],
            "data": rows[:10],
        },
        "kpis": [
            {"label": "Parrainages totaux", "value": total, "color": "#7C3AED"},
            {"label": "Validés / récompensés", "value": len(rewarded), "color": "#059669"},
            {"label": "Récompenses versées", "value": f"{total_paid} €", "color": "#0891B2"},
            {"label": "Parrains actifs", "value": len(by_ref), "color": "#2563EB"},
        ],
        "columns": [
            {"key": "referrer", "label": "Parrain"}, {"key": "count", "label": "Filleuls"},
            {"key": "earned", "label": "Gains (€)"}, {"key": "last", "label": "Dernier"},
        ],
        "rows": rows,
    }


# ───────────────────── WALLET ─────────────────────
@router.get("/wallet")
async def report_wallet(request: Request, date_from: Optional[str] = None, date_to: Optional[str] = None):
    await require_role(request, ["admin", "dispatcher"])
    return await _compute_wallet(*_range(date_from, date_to))


async def _compute_wallet(start, end):
    # Snapshot of current balances across all wallets.
    wallets = await db.wallets.find({}, {"_id": 0, "balance": 1, "reserve": 1, "non_withdrawable": 1, "pending": 1}).to_list(50000)
    total_balance = round(sum(float(w.get("balance") or 0) for w in wallets), 2)
    total_reserve = round(sum(float(w.get("reserve") or 0) for w in wallets), 2)
    total_non_wd = round(sum(float(w.get("non_withdrawable") or 0) for w in wallets), 2)
    active = sum(1 for w in wallets if float(w.get("balance") or 0) > 0)

    # Transactions over the period, grouped by type.
    flt = {"created_at": {"$gte": start, "$lte": end}}
    txs = await db.wallet_transactions.find(flt, {"_id": 0, "type": 1, "amount": 1}).to_list(50000)
    by_type = {}
    for t in txs:
        ty = t.get("type") or "Autre"
        b = by_type.setdefault(ty, {"type": ty, "count": 0, "total": 0.0})
        b["count"] += 1
        b["total"] = round(b["total"] + float(t.get("amount") or 0), 2)
    rows = sorted(by_type.values(), key=lambda x: -abs(x["total"]))

    return {
        "chart": {
            "type": "bar", "x": "type", "title": "Mouvements du portefeuille par type",
            "series": [{"key": "total", "label": "Montant (€)", "color": "#0891B2"}],
            "data": rows,
        },
        "kpis": [
            {"label": "Solde total (SB Pay)", "value": f"{total_balance} €", "color": "#0891B2"},
            {"label": "Réserves bloquées", "value": f"{total_reserve} €", "color": "#EA580C"},
            {"label": "Non retirable", "value": f"{total_non_wd} €", "color": "#7C3AED"},
            {"label": "Portefeuilles actifs", "value": active, "color": "#059669"},
            {"label": "Transactions (période)", "value": len(txs), "color": "#2563EB"},
        ],
        "columns": [
            {"key": "type", "label": "Type de mouvement"}, {"key": "count", "label": "Transactions"},
            {"key": "total", "label": "Montant (€)"},
        ],
        "rows": rows,
    }


# ───────────────────── USER REWARDS ─────────────────────
@router.get("/rewards")
async def report_rewards(request: Request, date_from: Optional[str] = None, date_to: Optional[str] = None):
    await require_role(request, ["admin", "dispatcher"])
    return await _compute_rewards(*_range(date_from, date_to))


async def _compute_rewards(start, end):
    flt = {"created_at": {"$gte": start, "$lte": end}}
    # Cashback paid over the period.
    cashbacks = await db.cashback_ledger.find(flt, {"_id": 0, "amount": 1}).to_list(50000)
    cashback_total = round(sum(float(c.get("amount") or 0) for c in cashbacks), 2)
    # Loyalty redemptions over the period.
    redemptions = await db.loyalty_redemptions.find(flt, {"_id": 0, "user_id": 1, "reward_name": 1, "cost_points": 1, "created_at": 1}).sort("created_at", -1).to_list(20000)
    points_spent = sum(int(r.get("cost_points") or 0) for r in redemptions)
    # Gift cards issued over the period.
    gift_cards = await db.gift_cards.find(flt, {"_id": 0, "amount": 1, "redeemed": 1}).to_list(20000)
    gc_value = round(sum(float(g.get("amount") or 0) for g in gift_cards), 2)
    gc_redeemed = sum(1 for g in gift_cards if g.get("redeemed"))
    # Outstanding loyalty points (snapshot).
    loyalty = await db.loyalty.find({}, {"_id": 0, "points": 1}).to_list(50000)
    points_outstanding = sum(int(l.get("points") or 0) for l in loyalty)

    names = await _names([r.get("user_id") for r in redemptions])
    rows = [{
        "user": names.get(r.get("user_id")) or "—",
        "reward": r.get("reward_name") or "—",
        "points": int(r.get("cost_points") or 0),
        "date": _day(r.get("created_at")),
    } for r in redemptions[:500]]

    return {
        "chart": {
            "type": "bar", "x": "label", "title": "Récompenses distribuées (période)",
            "series": [{"key": "value", "label": "Volume", "color": "#059669"}],
            "data": [
                {"label": "Cashback (€)", "value": cashback_total},
                {"label": "Échanges fidélité", "value": len(redemptions)},
                {"label": "Cartes cadeaux", "value": len(gift_cards)},
            ],
        },
        "kpis": [
            {"label": "Cashback versé", "value": f"{cashback_total} €", "color": "#0891B2"},
            {"label": "Échanges fidélité", "value": len(redemptions), "color": "#7C3AED"},
            {"label": "Points dépensés", "value": points_spent, "color": "#EA580C"},
            {"label": "Cartes cadeaux émises", "value": len(gift_cards), "color": "#2563EB"},
            {"label": "Valeur cartes cadeaux", "value": f"{gc_value} €", "color": "#0891B2"},
            {"label": "Cartes utilisées", "value": gc_redeemed, "color": "#059669"},
            {"label": "Points en circulation", "value": points_outstanding, "color": "#DC2626"},
        ],
        "columns": [
            {"key": "user", "label": "Utilisateur"}, {"key": "reward", "label": "Récompense"},
            {"key": "points", "label": "Points"}, {"key": "date", "label": "Date"},
        ],
        "rows": rows,
    }


# ───────────────────── INSURANCE (driver coverage) ─────────────────────
INSURANCE_DOC_TYPES = {"assurance", "assurance_rc", "insurance"}


@router.get("/insurance")
async def report_insurance(request: Request, date_from: Optional[str] = None, date_to: Optional[str] = None):
    await require_role(request, ["admin", "dispatcher"])
    return await _compute_insurance(*_range(date_from, date_to))


async def _compute_insurance(start, end):
    """Driver insurance-document coverage (real data from embedded driver docs)."""
    drivers = await db.drivers.find({}, {"_id": 0, "id": 1, "user_id": 1, "documents": 1, "status": 1}).to_list(50000)
    names = await _names([d.get("user_id") for d in drivers])

    approved = pending = missing = 0
    rows = []
    for d in drivers:
        ins = None
        for doc in (d.get("documents") or []):
            if str(doc.get("type", "")).lower() in INSURANCE_DOC_TYPES:
                ins = doc
                break
        if not ins:
            status = "Manquante"
            missing += 1
            uploaded = ""
        elif ins.get("status") == "approved":
            status = "Valide"
            approved += 1
            uploaded = _day(ins.get("uploaded_at"))
        else:
            status = "En attente"
            pending += 1
            uploaded = _day(ins.get("uploaded_at"))
        rows.append({"driver": names.get(d.get("user_id")) or "—", "status": status,
                     "driver_status": d.get("status") or "—", "uploaded": uploaded or "—"})
    rows.sort(key=lambda x: {"Manquante": 0, "En attente": 1, "Valide": 2}.get(x["status"], 3))
    total = len(drivers)
    coverage = round(approved / total * 100, 1) if total else 0

    return {
        "chart": {
            "type": "bar", "x": "label", "title": "Couverture assurance des chauffeurs",
            "series": [{"key": "value", "label": "Chauffeurs", "color": "#2563EB"}],
            "data": [
                {"label": "Valide", "value": approved},
                {"label": "En attente", "value": pending},
                {"label": "Manquante", "value": missing},
            ],
        },
        "kpis": [
            {"label": "Chauffeurs", "value": total, "color": "#2563EB"},
            {"label": "Assurance valide", "value": approved, "color": "#059669"},
            {"label": "En attente", "value": pending, "color": "#EA580C"},
            {"label": "Manquante", "value": missing, "color": "#DC2626"},
            {"label": "Taux de couverture", "value": f"{coverage}%", "color": "#0891B2"},
        ],
        "columns": [
            {"key": "driver", "label": "Chauffeur"}, {"key": "status", "label": "Assurance"},
            {"key": "driver_status", "label": "Statut chauffeur"}, {"key": "uploaded", "label": "Déposée le"},
        ],
        "rows": rows,
    }



# ════════════════════════════════════════════════════════════════════════
#  SCHEDULED EMAIL REPORTS — auto-send the reports above on a cadence
# ════════════════════════════════════════════════════════════════════════

# Registry: report key -> (label, compute fn)
REPORT_FUNCS = {
    "results": ("Rapport sur les résultats", _compute_results),
    "payments": ("Rapport de paiement", _compute_payments),
    "exceptional": ("Rapport exceptionnel", _compute_exceptional),
    "refused-cancelled": ("Alertes refusées / annulées", _compute_refused_cancelled),
    "other": ("Autres rapports", _compute_other),
    "referral": ("Rapport de parrainage MLM", _compute_referral),
    "wallet": ("Rapport sur le portefeuille", _compute_wallet),
    "rewards": ("Récompenses des utilisateurs", _compute_rewards),
    "insurance": ("Rapport d'assurance", _compute_insurance),
}

WINDOW_LABELS = {
    "yesterday": "Hier",
    "last_7d": "7 derniers jours",
    "last_30d": "30 derniers jours",
    "last_month": "Mois précédent",
}

FREQ_LABELS = {"daily": "Quotidien", "weekly": "Hebdomadaire", "monthly": "Mensuel"}


def _window_range(window: str, ref: datetime = None):
    """Return (date_from, date_to) YYYY-MM-DD strings for the report window."""
    now = (ref or datetime.now(timezone.utc)).date()
    if window == "yesterday":
        d = now - timedelta(days=1)
        return d.isoformat(), d.isoformat()
    if window == "last_7d":
        return (now - timedelta(days=7)).isoformat(), now.isoformat()
    if window == "last_month":
        first_this = now.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        first_prev = last_prev.replace(day=1)
        return first_prev.isoformat(), last_prev.isoformat()
    # default last_30d
    return (now - timedelta(days=30)).isoformat(), now.isoformat()


async def build_report(kind: str, date_from: str, date_to: str):
    fn = REPORT_FUNCS.get(kind)
    if not fn:
        raise HTTPException(status_code=404, detail="Rapport inconnu")
    return await fn[1](*_range(date_from, date_to))


def _report_html_block(label: str, payload: dict) -> str:
    """Render one report (KPIs + table) as an HTML block for the email."""
    kpis = "".join(
        f'<td style="padding:10px 12px;border:1px solid #eef0f3;border-radius:8px;">'
        f'<div style="font-size:11px;color:#64748b">{k["label"]}</div>'
        f'<div style="font-size:17px;font-weight:bold;color:{k.get("color") or "#111827"}">{k["value"]}</div></td>'
        for k in payload.get("kpis", [])
    )
    cols = payload.get("columns", [])
    head = "".join(f'<th style="text-align:left;padding:7px 9px;background:#f8fafc;font-size:11px;color:#64748b;text-transform:uppercase">{c["label"]}</th>' for c in cols)
    body_rows = ""
    for r in payload.get("rows", [])[:30]:
        cells = "".join(f'<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155">{r.get(c["key"]) if r.get(c["key"]) is not None else "—"}</td>' for c in cols)
        body_rows += f"<tr>{cells}</tr>"
    if not body_rows:
        body_rows = f'<tr><td colspan="{len(cols)}" style="padding:14px;color:#94a3b8;font-size:13px">Aucune donnée sur cette période.</td></tr>'
    return f"""
    <h2 style="font-size:16px;color:#0f172a;margin:26px 0 10px">{label}</h2>
    <table cellpadding="0" cellspacing="6" style="width:100%;border-collapse:separate"><tr>{kpis}</tr></table>
    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:10px">
      <thead><tr>{head}</tr></thead><tbody>{body_rows}</tbody>
    </table>
    """


def _email_html(schedule: dict, blocks: str, window_label: str, range_label: str) -> str:
    return f"""
<div style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;color:#0f172a">
  <div style="background:#0f172a;color:#fff;padding:22px 24px;border-radius:10px 10px 0 0">
    <h1 style="margin:0;font-size:20px">📊 {schedule.get('name') or 'Rapport automatique'}</h1>
    <p style="margin:6px 0 0;opacity:.8;font-size:13px">{FREQ_LABELS.get(schedule.get('frequency'), '')} · {window_label} · {range_label}</p>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:18px 24px;border-radius:0 0 10px 10px">
    {blocks}
    <p style="margin-top:28px;font-size:11px;color:#94a3b8">Rapport généré automatiquement par SB Marketplace. Pour modifier la planification, rendez-vous dans Admin → Rapports → Planification.</p>
  </div>
</div>
"""


async def _run_schedule(schedule: dict, *, test_email: str = None):
    """Compute the configured reports and email them. Returns a result dict."""
    date_from, date_to = _window_range(schedule.get("window", "last_7d"))
    kinds = schedule.get("kinds") or ["results"]
    blocks = ""
    for k in kinds:
        fn = REPORT_FUNCS.get(k)
        if not fn:
            continue
        payload = await fn[1](*_range(date_from, date_to))
        blocks += _report_html_block(fn[0], payload)

    window_label = WINDOW_LABELS.get(schedule.get("window", "last_7d"), "")
    range_label = f"{date_from} → {date_to}"
    html = _email_html(schedule, blocks, window_label, range_label)
    recipients = [test_email] if test_email else [e for e in (schedule.get("recipients") or []) if e]
    if not recipients:
        return {"sent": 0, "failed": 0, "error": "Aucun destinataire"}

    api_key = os.environ.get("RESEND_API_KEY", "")
    sender = f"SB Marketplace <{os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')}>"
    subject = f"{schedule.get('name') or 'Rapport automatique'} — {range_label}"
    status, email_id, err = "sent", None, None
    if not api_key:
        status, err = "failed", "Clé API Resend manquante (RESEND_API_KEY)"
    else:
        try:
            resend.api_key = api_key
            res = await asyncio.to_thread(
                resend.Emails.send,
                {"from": sender, "to": recipients, "subject": subject, "html": html},
            )
            email_id = (res or {}).get("id")
        except Exception as e:
            status, err = "failed", str(e)
            logger.warning("Scheduled report send failed: %s", e)

    await db.report_schedule_runs.insert_one({
        "id": f"srun_{uuid.uuid4().hex[:12]}",
        "schedule_id": schedule.get("id"),
        "name": schedule.get("name"),
        "recipients": recipients,
        "kinds": kinds,
        "range": range_label,
        "subject": subject,
        "status": status,
        "email_id": email_id,
        "error": err,
        "is_test": bool(test_email),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"sent": 1 if status == "sent" else 0, "failed": 0 if status == "sent" else 1,
            "status": status, "email_id": email_id, "error": err, "range": range_label}


# ---------------- Schedule CRUD ----------------
def _clean_schedule(body: dict) -> dict:
    kinds = [k for k in (body.get("kinds") or []) if k in REPORT_FUNCS] or ["results"]
    recipients = [str(e).strip() for e in (body.get("recipients") or []) if str(e).strip()]
    freq = body.get("frequency") if body.get("frequency") in FREQ_LABELS else "weekly"
    window = body.get("window") if body.get("window") in WINDOW_LABELS else "last_7d"
    return {
        "name": (body.get("name") or "Rapport automatique").strip(),
        "kinds": kinds,
        "recipients": recipients,
        "frequency": freq,
        "window": window,
        "send_hour": max(0, min(23, int(body.get("send_hour", 8)))),
        "send_day": int(body.get("send_day", 0)),       # weekly: 0=Mon..6=Sun ; monthly: 1..28
        "timezone": body.get("timezone") or "America/Martinique",
        "enabled": bool(body.get("enabled", True)),
    }


@router.get("/schedules")
async def list_schedules(request: Request):
    await require_role(request, ["admin"])
    docs = await db.report_schedules.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs


@router.post("/schedules")
async def create_schedule(request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    doc = _clean_schedule(body)
    doc["id"] = f"sch_{uuid.uuid4().hex[:12]}"
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["last_run_marker"] = None
    await db.report_schedules.insert_one({**doc})
    return doc


@router.put("/schedules/{sid}")
async def update_schedule(sid: str, request: Request):
    await require_role(request, ["admin"])
    body = await request.json()
    if not await db.report_schedules.find_one({"id": sid}):
        raise HTTPException(status_code=404, detail="Planification introuvable")
    upd = _clean_schedule(body)
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.report_schedules.update_one({"id": sid}, {"$set": upd})
    return await db.report_schedules.find_one({"id": sid}, {"_id": 0})


@router.delete("/schedules/{sid}")
async def delete_schedule(sid: str, request: Request):
    await require_role(request, ["admin"])
    await db.report_schedules.delete_one({"id": sid})
    return {"ok": True}


@router.post("/schedules/{sid}/send-now")
async def send_schedule_now(sid: str, request: Request):
    await require_role(request, ["admin"])
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    sch = await db.report_schedules.find_one({"id": sid}, {"_id": 0})
    if not sch:
        raise HTTPException(status_code=404, detail="Planification introuvable")
    return await _run_schedule(sch, test_email=body.get("test_email"))


@router.get("/schedule-runs")
async def list_schedule_runs(request: Request, limit: int = 50):
    await require_role(request, ["admin"])
    docs = await db.report_schedule_runs.find({}, {"_id": 0}).sort("created_at", -1).limit(int(limit)).to_list(int(limit))
    return docs


# ---------------- Scheduler loop ----------------
def _is_due(sch: dict, now_local: datetime) -> bool:
    if now_local.hour != int(sch.get("send_hour", 8)):
        return False
    freq = sch.get("frequency", "weekly")
    if freq == "daily":
        marker = now_local.strftime("%Y-%m-%d")
    elif freq == "weekly":
        if now_local.weekday() != int(sch.get("send_day", 0)):
            return False
        monday = now_local - timedelta(days=now_local.weekday())
        marker = monday.strftime("%Y-W%U")
    else:  # monthly
        if now_local.day != max(1, min(28, int(sch.get("send_day", 1) or 1))):
            return False
        marker = now_local.strftime("%Y-%m")
    return sch.get("last_run_marker") != marker, marker


async def report_schedule_loop():
    """Every 30 min, fire any due schedule (idempotent via last_run_marker)."""
    await asyncio.sleep(45)
    while True:
        try:
            async for sch in db.report_schedules.find({"enabled": True}):
                tz = sch.get("timezone", "America/Martinique")
                try:
                    now_local = datetime.now(ZoneInfo(tz))
                except Exception:
                    now_local = datetime.now(timezone.utc)
                due = _is_due(sch, now_local)
                if isinstance(due, tuple) and due[0]:
                    marker = due[1]
                    logger.info("Report schedule '%s' firing (marker %s)", sch.get("name"), marker)
                    await _run_schedule(sch)
                    await db.report_schedules.update_one({"id": sch["id"]}, {"$set": {"last_run_marker": marker}})
        except Exception as e:
            logger.error("report_schedule_loop error: %s", e)
        await asyncio.sleep(1800)
