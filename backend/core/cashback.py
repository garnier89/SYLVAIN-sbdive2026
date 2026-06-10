"""SB Pay cashback engine.

Credits a configurable % of eligible payments back to the unified SB Pay wallet
(db.wallets). Admin-configurable: rate, minimum eligible amount, per-transaction
cap and eligible payment-method buckets. Idempotent per (service, ref_id) so a
given ride/order/parcel can only ever earn cashback once.
"""
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta

from core.config import db

logger = logging.getLogger(__name__)

CASHBACK_CFG_ID = "default"

# Defaults (user choice 2026-06-10): 2% configurable, SB Pay + card (no cash),
# all services, awarded only when the paid amount reaches a minimum.
DEFAULT_CASHBACK = {
    "id": CASHBACK_CFG_ID,
    "enabled": True,
    "rate_pct": 2.0,
    "min_amount": 5.0,        # only award when the paid amount >= this
    "max_per_tx": 0.0,        # 0 = no cap
    "methods": ["sbpay", "card"],  # eligible payment-method buckets
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_method(method: str) -> str:
    """Map the many app-wide payment-method labels into 3 buckets."""
    m = (method or "").strip().lower()
    if m in ("wallet", "sbpay", "sb_pay", "sbpaygo"):
        return "sbpay"
    if m in ("card", "stripe", "cb", "credit_card", "carte"):
        return "card"
    if m in ("cash", "especes", "espèces", "cod", "pending_cash"):
        return "cash"
    return m


async def get_cashback_config() -> dict:
    cfg = await db.cashback_config.find_one({"id": CASHBACK_CFG_ID}, {"_id": 0})
    if not cfg:
        cfg = {**DEFAULT_CASHBACK, "updated_at": _now()}
        await db.cashback_config.insert_one(dict(cfg))
    return {**DEFAULT_CASHBACK, **cfg}


async def award_cashback(user_id: str, amount, method: str, service: str,
                         ref_id=None, label: str | None = None) -> float:
    """Idempotently credit cashback for an eligible payment. Returns the credited
    amount (0.0 if not eligible / disabled / already awarded)."""
    if not user_id or amount is None:
        return 0.0
    try:
        amount = round(float(amount), 2)
    except (TypeError, ValueError):
        return 0.0
    if amount <= 0:
        return 0.0

    cfg = await get_cashback_config()
    if not cfg.get("enabled"):
        return 0.0
    if normalize_method(method) not in (cfg.get("methods") or []):
        return 0.0
    if amount < float(cfg.get("min_amount", 0) or 0):
        return 0.0
    rate = float(cfg.get("rate_pct", 0) or 0)
    if rate <= 0:
        return 0.0

    cb = round(amount * rate / 100.0, 2)
    cap = float(cfg.get("max_per_tx", 0) or 0)
    if cap > 0:
        cb = min(cb, cap)
    if cb <= 0:
        return 0.0

    # Idempotency: one cashback per (service, ref_id). When no ref is given we
    # generate a unique key so each standalone payment still earns once.
    key = f"{service}:{ref_id}" if ref_id else f"{service}:{uuid.uuid4().hex}"
    try:
        await db.cashback_ledger.insert_one({
            "id": f"cb_{uuid.uuid4().hex[:12]}",
            "key": key,
            "user_id": user_id,
            "amount": cb,
            "service": service,
            "ref_id": ref_id,
            "rate_pct": rate,
            "base_amount": amount,
            "created_at": _now(),
        })
    except Exception:
        # Duplicate key (unique index) → cashback already granted for this ref.
        return 0.0

    now = _now()
    await db.wallets.update_one(
        {"user_id": user_id},
        {"$inc": {"balance": cb},
         "$setOnInsert": {"user_id": user_id, "currency": "EUR", "created_at": now}},
        upsert=True,
    )
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "type": "Cashback",
        "amount": cb,
        "balance_after": round((w or {}).get("balance", 0), 2),
        "description": label or f"Cashback {rate:.0f}% — {service}",
        "service": service,
        "ref_id": ref_id,
        "status": "completed",
        "created_at": now,
    })
    return cb


# ───────────────────────── Monthly summary & notification ──────────────────

def _month_bounds(period: str):
    """Return ISO start/end of a 'YYYY-MM' period (end exclusive)."""
    y, m = map(int, period.split("-"))
    start = datetime(y, m, 1, tzinfo=timezone.utc)
    end = datetime(y + 1, 1, 1, tzinfo=timezone.utc) if m == 12 else datetime(y, m + 1, 1, tzinfo=timezone.utc)
    return start.isoformat(), end.isoformat()


async def _sum_cashback(match: dict) -> float:
    total = 0.0
    pipeline = [{"$match": match}, {"$group": {"_id": None, "t": {"$sum": "$amount"}}}]
    async for r in db.cashback_ledger.aggregate(pipeline):
        total = round(r.get("t", 0) or 0, 2)
    return total


async def get_cashback_summary(user_id: str) -> dict:
    """This-month and all-time cashback earned by a user."""
    now = datetime.now(timezone.utc)
    cur_start, cur_end = _month_bounds(now.strftime("%Y-%m"))
    this_month = await _sum_cashback({"user_id": user_id, "created_at": {"$gte": cur_start, "$lt": cur_end}})
    all_time = await _sum_cashback({"user_id": user_id})
    return {"this_month": this_month, "all_time": all_time, "currency": "EUR"}


_MONTH_FR = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet",
             "août", "septembre", "octobre", "novembre", "décembre"]


async def _process_monthly_cashback(period: str):
    """Idempotently notify each user of their cashback earned during `period`
    ('YYYY-MM'). Records in db.cashback_monthly so a user is notified once/period."""
    from core.notifications import create_notification
    start, end = _month_bounds(period)
    y, m = map(int, period.split("-"))
    label = f"{_MONTH_FR[m]} {y}"
    pipeline = [
        {"$match": {"created_at": {"$gte": start, "$lt": end}}},
        {"$group": {"_id": "$user_id", "total": {"$sum": "$amount"}}},
    ]
    async for row in db.cashback_ledger.aggregate(pipeline):
        uid = row["_id"]
        total = round(row.get("total", 0) or 0, 2)
        if not uid or total <= 0:
            continue
        existing = await db.cashback_monthly.find_one({"user_id": uid, "period": period})
        if existing:
            continue
        await db.cashback_monthly.insert_one({
            "user_id": uid, "period": period, "total": total, "created_at": _now(),
        })
        try:
            await create_notification(
                uid, "cashback_monthly", "Votre cashback du mois 🎁",
                f"Vous avez gagné {total:.2f} € de cashback SB Pay en {label}. Continuez à payer avec SB Pay !",
                data={"url": "/wallet", "amount": total, "period": period},
            )
        except Exception:
            pass


async def cashback_monthly_loop():
    """Hourly check; once a calendar month ends, sends each user their monthly
    cashback recap notification (idempotent)."""
    await asyncio.sleep(25)
    while True:
        try:
            now = datetime.now(timezone.utc)
            prev_month_last_day = now.replace(day=1) - timedelta(days=1)
            await _process_monthly_cashback(prev_month_last_day.strftime("%Y-%m"))
        except Exception as e:
            logger.error(f"cashback_monthly_loop error: {e}")
        await asyncio.sleep(3600)
