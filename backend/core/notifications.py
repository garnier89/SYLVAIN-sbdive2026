"""Shared driver/user notification helper: persist to db.notifications + WebSocket + Expo push.

Best-effort: every channel is wrapped so a failure never breaks the calling request.
Used to build the driver activity journal (document reviews, earnings, new rides, …).
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from core.config import db
from core.push import notify_user
from core.webpush import send_web_push_to_user
from core.websocket import manager


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
    data = data or {}
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
