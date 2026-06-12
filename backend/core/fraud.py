"""Anti-fraud engine — event recording, account blocking, wallet velocity checks.

All helpers are defensive: recording a fraud event must NEVER break the main
operation, and velocity checks return flags (they don't raise) so callers decide.
"""
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException

from core.config import db


async def record_fraud_event(*, event_type: str, severity: str = "medium", user_id: str = None,
                             actor_id: str = None, amount=None, description: str = "", metadata: dict = None):
    """Persist a fraud/abuse signal into `fraud_events` (severity: low|medium|high|critical)."""
    doc = {
        "id": f"fraud_{uuid.uuid4().hex[:14]}",
        "event_type": event_type,
        "severity": severity,
        "user_id": user_id,
        "actor_id": actor_id or user_id,
        "amount": amount,
        "description": description,
        "metadata": metadata or {},
        "resolved": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.fraud_events.insert_one(doc)
    except Exception:
        pass
    return doc


async def ensure_not_blocked(user: dict):
    """Block sensitive financial operations for suspended accounts."""
    if user and user.get("is_blocked"):
        raise HTTPException(status_code=403, detail="Compte suspendu pour activité suspecte. Contactez le support.")


async def check_wallet_velocity(user_id: str, kind: str, amount: float):
    """Return a list of (severity, message) flags for a wallet op over the last 24h.
    Does NOT raise — the caller decides whether to record/alert. kind: transfer|topup|refund."""
    flags = []
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    txs = await db.wallet_transactions.find(
        {"user_id": user_id, "created_at": {"$gte": since}}, {"_id": 0, "type": 1, "amount": 1},
    ).to_list(2000)
    out_total = sum(abs(t.get("amount", 0)) for t in txs if t.get("type") == "Transfer" and t.get("amount", 0) < 0)
    transfer_count = sum(1 for t in txs if t.get("type") == "Transfer" and t.get("amount", 0) < 0)
    if kind == "transfer":
        if out_total + amount > 1000:
            flags.append(("high", f"Transferts sortants 24h élevés: {out_total + amount:.0f} EUR"))
        if transfer_count + 1 > 15:
            flags.append(("medium", f"Nombre de transferts 24h élevé: {transfer_count + 1}"))
    return flags
