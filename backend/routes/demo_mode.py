"""
Global Demo Mode (admin-toggleable). When ON:
  - student verification is auto-granted (test marketplace/offers without KYC/OTP),
  - a non-charged "Crédit démo" wallet top-up button is available,
  - the app shows a MODE DÉMO banner.
Stripe payments are NOT affected and stay LIVE.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from core.config import db, DEMO_CONFIG_ID, get_demo_config, is_demo_mode
from core.deps import get_current_user

router = APIRouter(prefix="/demo-mode", tags=["demo-mode"])

MAX_DEMO_BALANCE = 5000.0


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/status")
async def status(request: Request):
    await get_current_user(request)
    cfg = await get_demo_config()
    return {"enabled": bool(cfg.get("enabled")), "wallet_credit": float(cfg.get("wallet_credit", 100.0))}


@router.get("/config")
async def get_config(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return await get_demo_config()


class DemoConfigBody(BaseModel):
    enabled: bool | None = None
    wallet_credit: float | None = None


@router.put("/config")
async def update_config(body: DemoConfigBody, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await get_demo_config()
    update = {}
    if body.enabled is not None:
        update["enabled"] = bool(body.enabled)
    if body.wallet_credit is not None:
        update["wallet_credit"] = max(1.0, min(1000.0, round(float(body.wallet_credit), 2)))
    if update:
        update["updated_at"] = _now()
        await db.app_config.update_one({"id": DEMO_CONFIG_ID}, {"$set": update}, upsert=True)
    return await get_demo_config()


@router.post("/wallet-credit")
async def wallet_credit(request: Request):
    """Add a NON-CHARGED demo credit to the current user's wallet (demo mode only)."""
    user = await get_current_user(request)
    if not await is_demo_mode():
        raise HTTPException(status_code=400, detail="Le mode démo n'est pas activé")
    cfg = await get_demo_config()
    amount = float(cfg.get("wallet_credit", 100.0))
    w = await db.wallets.find_one({"user_id": user["id"]})
    if not w:
        w = {"user_id": user["id"], "balance": 0.0, "currency": "EUR", "created_at": _now()}
        await db.wallets.insert_one(dict(w))
    if float(w.get("balance", 0)) >= MAX_DEMO_BALANCE:
        raise HTTPException(status_code=400, detail="Solde de démo déjà suffisant")
    new_bal = round(float(w.get("balance", 0)) + amount, 2)
    await db.wallets.update_one({"user_id": user["id"]}, {"$set": {"balance": new_bal}})
    await db.wallet_transactions.insert_one({
        "id": f"wtx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Crédit démo",
        "amount": round(amount, 2), "balance_after": new_bal,
        "description": "Crédit démo (non facturé)", "created_at": _now(),
    })
    return {"ok": True, "balance": new_bal, "credited": amount}
