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
    """Persist a fraud/abuse signal into `fraud_events` (severity: low|medium|high|critical).
    Les événements CRITIQUES déclenchent une alerte temps réel (notif admin + e-mail Resend)."""
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
    if severity == "critical":
        try:
            await notify_critical_fraud(doc)
        except Exception:
            pass
    return doc


async def notify_critical_fraud(event: dict):
    """Alerte temps réel pour un événement critique : notification in-app à tous les
    admins + e-mail Resend. Best-effort (ne bloque jamais l'opération principale)."""
    title = "Événement de fraude CRITIQUE"
    amount = event.get("amount")
    desc = event.get("description") or event.get("event_type")
    # Nom de l'utilisateur concerné
    uname = None
    if event.get("user_id"):
        u = await db.users.find_one({"id": event["user_id"]}, {"_id": 0, "name": 1, "email": 1})
        uname = (u or {}).get("name") or (u or {}).get("email")
    body = f"{desc}" + (f" · {amount} EUR" if amount is not None else "") + (f" · {uname}" if uname else "")
    # 1) Notification in-app à tous les admins
    try:
        from core.airport import notify_admins
        await notify_admins("fraud_alert", "🚨 Fraude critique détectée", body,
                            data={"event_id": event.get("id"), "event_type": event.get("event_type")})
    except Exception:
        pass
    # 2) E-mail Resend à chaque admin
    try:
        from core.email import send_fraud_alert_email, fire
        admins = await db.users.find({"role": "admin"}, {"_id": 0, "email": 1}).to_list(50)
        lines = [
            f"<b>Type :</b> {event.get('event_type')}",
            f"<b>Gravité :</b> {event.get('severity')}",
            f"<b>Description :</b> {desc}",
        ]
        if amount is not None:
            lines.append(f"<b>Montant :</b> {amount} EUR")
        if uname:
            lines.append(f"<b>Utilisateur :</b> {uname}")
        for a in admins:
            if a.get("email"):
                fire(send_fraud_alert_email(a["email"], title, lines))
    except Exception:
        pass


async def process_chargeback(*, user_id: str, amount: float, reference: str = "", source: str = "manual",
                             actor_id: str = None):
    """Traite un chargeback/litige Stripe : débite le portefeuille (peut devenir négatif =
    dette), trace l'événement, compte les récidives et bloque automatiquement au 2e chargeback."""
    now = datetime.now(timezone.utc).isoformat()
    wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    prev_balance = wallet["balance"] if wallet else 0.0
    new_balance = round(prev_balance - float(amount), 2)
    await db.wallets.update_one({"user_id": user_id}, {"$inc": {"balance": -float(amount)}}, upsert=True)
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "type": "Chargeback",
        "amount": -float(amount),
        "balance_after": new_balance,
        "description": f"Chargeback Stripe — {reference}" if reference else "Chargeback Stripe",
        "status": "completed",
        "source": source,
        "created_at": now,
    })
    # Compteur de récidive
    res = await db.users.find_one_and_update(
        {"id": user_id}, {"$inc": {"chargeback_count": 1}},
        projection={"_id": 0, "chargeback_count": 1, "name": 1, "role": 1}, return_document=True,
    ) or {}
    count = res.get("chargeback_count", 1)
    auto_blocked = False
    # Récidiviste → blocage automatique (sauf admin)
    if count >= 2 and res.get("role") != "admin":
        await db.users.update_one({"id": user_id}, {"$set": {
            "is_blocked": True, "blocked_reason": f"Récidive chargeback ({count})", "blocked_at": now,
        }})
        auto_blocked = True
    await record_fraud_event(
        event_type="wallet.chargeback", severity="critical", user_id=user_id, actor_id=actor_id,
        amount=amount,
        description=(f"Chargeback Stripe #{count} ({source}). Solde: {prev_balance}→{new_balance} EUR."
                     + (" Compte bloqué automatiquement (récidive)." if auto_blocked else "")),
        metadata={"reference": reference, "source": source, "chargeback_count": count, "auto_blocked": auto_blocked,
                  "new_balance": new_balance},
    )
    return {"user_id": user_id, "amount": amount, "new_balance": new_balance,
            "chargeback_count": count, "auto_blocked": auto_blocked}


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
