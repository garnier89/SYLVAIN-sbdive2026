"""
Web Push (VAPID) delivery helper.

Sends background push notifications to a user's registered browser
subscriptions (PWA) so drivers/clients are alerted even when the app is
backgrounded, in another tab, or the phone is locked.

`webpush()` from pywebpush is blocking, so we offload each send to a worker
thread. Expired subscriptions (404/410) are pruned automatically.
"""
import json
import asyncio
from typing import Optional

from pywebpush import webpush, WebPushException

from core.config import db, logger, VAPID_PRIVATE_KEY, VAPID_SUBJECT


def _send_one(subscription_info: dict, data_str: str) -> None:
    webpush(
        subscription_info=subscription_info,
        data=data_str,
        vapid_private_key=VAPID_PRIVATE_KEY,
        vapid_claims={"sub": VAPID_SUBJECT},
        ttl=60 * 60,  # keep urgent ride alerts deliverable for up to 1h
    )


async def send_web_push_to_user(user_id: Optional[str], payload: dict) -> None:
    """Fire-and-forget web push to every subscription of a user. Never raises."""
    if not user_id or not VAPID_PRIVATE_KEY:
        return
    try:
        subs = await db.push_subscriptions.find({"user_id": user_id}).to_list(50)
    except Exception:
        return
    if not subs:
        return
    data_str = json.dumps(payload)
    for sub in subs:
        keys = sub.get("keys") or {}
        if not sub.get("endpoint") or not keys.get("p256dh") or not keys.get("auth"):
            continue
        info = {"endpoint": sub["endpoint"], "keys": {"p256dh": keys["p256dh"], "auth": keys["auth"]}}
        try:
            await asyncio.to_thread(_send_one, info, data_str)
        except WebPushException as exc:
            code = getattr(getattr(exc, "response", None), "status_code", None)
            if code in (404, 410):
                try:
                    await db.push_subscriptions.delete_one({"_id": sub["_id"]})
                except Exception:
                    pass
            else:
                logger.warning(f"web push failed ({code}): {exc}")
        except Exception as e:  # noqa: BLE001
            logger.warning(f"web push error: {e}")
