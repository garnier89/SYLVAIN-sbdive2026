"""Shared driver/user notification helper: persist to db.notifications + WebSocket + Expo push.

Best-effort: every channel is wrapped so a failure never breaks the calling request.
Used to build the driver activity journal (document reviews, earnings, new rides, …).
"""
import uuid
import re
from datetime import datetime, timezone
from typing import Optional

from core.config import db
from core.push import notify_user
from core.webpush import send_web_push_to_user
from core.websocket import manager

# Anti-fraud: phone numbers must NEVER be disclosed in notifications. The contact
# stays in-app (masked). We redact phone-like digit sequences from title/body and
# drop phone fields from the data payload.
_PHONE_RE = re.compile(r"(?:\+?\d[\s.\-]?){7,}\d")
_PHONE_KEYS = {"phone", "driver_phone", "client_phone", "customer_phone",
               "user_phone", "contact_phone", "passenger_phone", "rider_phone"}


def _redact_phone(text: Optional[str]) -> Optional[str]:
    if not text:
        return text
    return _PHONE_RE.sub("•••• (via l'app)", text)


def _strip_phone_data(data: dict) -> dict:
    return {k: v for k, v in (data or {}).items() if k not in _PHONE_KEYS}


async def create_notification(
    user_id: Optional[str],
    ntype: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
    push: bool = True,
    ws_payload: Optional[dict] = None,
) -> None:
    """Persist a notification, emit a WebSocket message and (optionally) an Expo push."""
    if not user_id:
        return
    title = _redact_phone(title)
    body = _redact_phone(body)
    data = _strip_phone_data(data or {})
    try:
        await db.notifications.insert_one({
            "id": uuid.uuid4().hex, "user_id": user_id, "type": ntype,
            "title": title, "body": body, "data": data, "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass
    try:
        await manager.send_personal_message(
            ws_payload or {"type": ntype, "title": title, "body": body, **data}, user_id)
    except Exception:
        pass
    if push:
        try:
            await notify_user(user_id, title, body, {"type": ntype, **data})
        except Exception:
            pass
        # Web Push (PWA) — reaches the user even when the app is backgrounded,
        # in another tab, or the phone is locked.
        try:
            await send_web_push_to_user(user_id, {
                "title": title,
                "body": body,
                "url": data.get("url") or "/",
                "tag": ntype,
                "type": ntype,
                "data": data,
            })
        except Exception:
            pass
