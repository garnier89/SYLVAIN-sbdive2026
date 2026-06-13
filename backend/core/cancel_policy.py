"""Cancellation policy helpers extracted from routes/rides.py (refactor Phase 2).

Self-contained: depends only on the shared Mongo handle and stdlib datetime.
"""
from datetime import datetime

from core.config import db


async def _cancel_policy():
    """Admin-configured cancellation fee (€) and free window (minutes)."""
    doc = await db.service_configs.find_one({"service_key": "payment_methods"}, {"_id": 0})
    s = (doc or {}).get("settings") or {}
    return {
        "fee": float(s.get("cancellation_fee_eur", 5.0) or 0),
        "free_window_min": float(s.get("free_cancel_window_minutes", 5) or 0),
    }


def _compute_cancel_fee(ride: dict, policy: dict, now_dt: datetime) -> float:
    """Cancellation fee rules:
      - Still searching (pending / not accepted): FREE.
      - Instant ride: free during the first `free_window_min` after the driver
        accepted; fee applies afterwards.
      - Scheduled ride: free if cancelled more than `free_window_min` before the
        scheduled pickup; fee applies if too close.
    """
    status = ride.get("status")
    if status == "pending":
        return 0.0
    free_min = policy["free_window_min"]
    # Scheduled rides
    if ride.get("scheduled_at"):
        try:
            sched = datetime.fromisoformat(str(ride["scheduled_at"]).replace("Z", "+00:00"))
            if (sched - now_dt).total_seconds() / 60.0 > free_min:
                return 0.0
        except (ValueError, TypeError):
            pass
        return policy["fee"]
    # Instant rides — window starts at driver acceptance
    accepted_at = ride.get("accepted_at")
    if not accepted_at:
        return 0.0
    try:
        acc = datetime.fromisoformat(str(accepted_at).replace("Z", "+00:00"))
        if (now_dt - acc).total_seconds() / 60.0 <= free_min:
            return 0.0
    except (ValueError, TypeError):
        pass
    return policy["fee"]
