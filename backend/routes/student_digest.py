"""
SB Drive Student — Phase 6d: weekly 'Top affaires de ton campus' digest.

Every week (Monday ~9h local, admin-configurable) each engaged student (one who
has a marketplace alert doc, enabled, with digest not opted-out) receives a
digest of the best recent listings near their followed campus(es)/category(ies):
  - email (Resend) + in-app notification.
Selection: active listings from the last 7 days, sorted boosted → most viewed →
most recent, max 6. Empty digests are skipped. Defensive: never raises in the loop.

Endpoints under /api/student/marketplace/admin/digest (admin only).
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from core.config import db
from core.deps import get_current_user
from core.notifications import create_notification
from routes.student_marketplace import CATEGORY_SLUGS, CATEGORY_LABELS, _is_boosted, _public_listing

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/student/marketplace/admin/digest", tags=["student-digest"])

CONFIG_ID = "student_digest_config"
DEFAULT_CONFIG = {
    "id": CONFIG_ID, "enabled": True, "timezone": "America/Martinique",
    "send_day": 0, "send_hour": 9, "max_items": 6, "last_sent_week": None,
}
FRONTEND_PATH = "/sb-student/marketplace"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def get_digest_config() -> dict:
    doc = await db.student_digest_config.find_one({"id": CONFIG_ID}, {"_id": 0})
    if not doc:
        await db.student_digest_config.insert_one({**DEFAULT_CONFIG})
        return {**DEFAULT_CONFIG}
    return {**DEFAULT_CONFIG, **doc}


def _week_label(tz_name: str) -> str:
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")
    now_local = datetime.now(tz)
    monday = (now_local - timedelta(days=now_local.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    return monday.strftime("%d/%m/%Y")


async def _all_enabled_zone_ids() -> list:
    zones = await db.campus_zones.find({"enabled": True}, {"_id": 0, "id": 1}).to_list(1000)
    return [z["id"] for z in zones if z.get("id")]


async def build_digest_for(prefs: dict, max_items: int = 6) -> list:
    """Top recent listings for a student given their alert prefs. NEVER raises."""
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        q = {"status": "active", "created_at": {"$gte": cutoff}, "user_id": {"$ne": prefs["user_id"]}}
        # zone scope: followed zones, else all campus zones (only campus-tagged listings)
        zone_ids = prefs.get("zone_ids") or await _all_enabled_zone_ids()
        if not zone_ids:
            return []
        q["zone_id"] = {"$in": zone_ids}
        cats = [c for c in (prefs.get("categories") or []) if c in CATEGORY_SLUGS]
        if cats:
            q["category"] = {"$in": cats}
        rows = await db.student_listings.find(q, {"_id": 0}).limit(60).to_list(60)
        cards = [_public_listing(r) for r in rows]
        cards.sort(key=lambda c: (c["boosted"], c.get("views", 0) or 0, c.get("created_at") or ""), reverse=True)
        return cards[:max_items]
    except Exception:
        return []


async def run_digest_send(test_user_id: str = None) -> dict:
    """Send the weekly digest to all eligible students (or a single test user)."""
    cfg = await get_digest_config()
    max_items = int(cfg.get("max_items", 6) or 6)
    week_label = _week_label(cfg.get("timezone", "UTC"))

    if test_user_id:
        alert_docs = await db.student_market_alerts.find({"user_id": test_user_id}, {"_id": 0}).to_list(1)
        if not alert_docs:
            alert_docs = [{"user_id": test_user_id, "enabled": True, "categories": [], "zone_ids": []}]
    else:
        alert_docs = await db.student_market_alerts.find(
            {"enabled": {"$ne": False}, "digest_enabled": {"$ne": False}}, {"_id": 0}
        ).limit(5000).to_list(5000)

    sent, skipped = 0, 0
    from core.email import send_campus_digest, fire
    import os
    base = (os.environ.get("FRONTEND_URL", "") or "").rstrip("/")
    url = f"{base}{FRONTEND_PATH}" if base else ""

    for prefs in alert_docs:
        uid = prefs.get("user_id")
        if not uid:
            continue
        items = await build_digest_for(prefs, max_items)
        if not items:
            skipped += 1
            continue
        user = await db.users.find_one({"id": uid}, {"_id": 0, "email": 1, "name": 1})
        name = (user or {}).get("name", "")
        # in-app notification
        try:
            top = items[0]
            await create_notification(
                uid, "student_digest", "Top affaires de ton campus 🎓",
                f"{len(items)} bonnes affaires cette semaine — à partir de {min(float(i['price']) for i in items):.2f} €",
                data={"url": FRONTEND_PATH, "count": len(items)})
        except Exception:
            pass
        # email (skip placeholder addresses)
        email = (user or {}).get("email") or ""
        if email and not email.endswith("@sbdrive.local"):
            fire(send_campus_digest(email, name, week_label, items, url))
        sent += 1

    await db.student_digest_sends.insert_one({
        "id": f"dg_{uuid.uuid4().hex[:10]}", "week": week_label, "sent": sent,
        "skipped": skipped, "is_test": bool(test_user_id), "created_at": _now(),
    })
    return {"week": week_label, "sent": sent, "skipped": skipped}


# ==================== ADMIN ====================
async def _require_admin(request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


@router.get("/config")
async def admin_get_config(request: Request):
    await _require_admin(request)
    return await get_digest_config()


class DigestConfig(BaseModel):
    enabled: bool | None = None
    timezone: str | None = None
    send_day: int | None = None
    send_hour: int | None = None
    max_items: int | None = None


@router.put("/config")
async def admin_update_config(body: DigestConfig, request: Request):
    await _require_admin(request)
    await get_digest_config()
    update = {k: v for k, v in body.dict().items() if v is not None}
    if "send_day" in update:
        update["send_day"] = max(0, min(int(update["send_day"]), 6))
    if "send_hour" in update:
        update["send_hour"] = max(0, min(int(update["send_hour"]), 23))
    if "max_items" in update:
        update["max_items"] = max(1, min(int(update["max_items"]), 12))
    if update:
        update["updated_at"] = _now()
        await db.student_digest_config.update_one({"id": CONFIG_ID}, {"$set": update}, upsert=True)
    return await get_digest_config()


class SendNowBody(BaseModel):
    test_user_id: str | None = None


@router.post("/send-now")
async def admin_send_now(body: SendNowBody, request: Request):
    await _require_admin(request)
    return await run_digest_send(test_user_id=body.test_user_id)


@router.get("/history")
async def admin_history(request: Request, limit: int = 30):
    await _require_admin(request)
    docs = await db.student_digest_sends.find({}, {"_id": 0}).sort("created_at", -1).limit(int(limit)).to_list(int(limit))
    return {"sends": docs}


# ==================== SCHEDULER ====================
async def student_digest_loop():
    """Every 30 min: send the weekly digest on the configured day/hour, once per week."""
    await asyncio.sleep(45)
    while True:
        try:
            cfg = await get_digest_config()
            if cfg.get("enabled"):
                try:
                    now_local = datetime.now(ZoneInfo(cfg.get("timezone", "UTC")))
                except Exception:
                    now_local = datetime.now(timezone.utc)
                this_monday = (now_local - timedelta(days=now_local.weekday())).strftime("%Y-%m-%d")
                if (now_local.weekday() == int(cfg.get("send_day", 0))
                        and now_local.hour == int(cfg.get("send_hour", 9))
                        and cfg.get("last_sent_week") != this_monday):
                    logger.info("Student digest: sending for week %s", this_monday)
                    await run_digest_send()
                    await db.student_digest_config.update_one({"id": CONFIG_ID}, {"$set": {"last_sent_week": this_monday}})
        except Exception as e:
            logger.error("student_digest_loop error: %s", e)
        await asyncio.sleep(1800)
