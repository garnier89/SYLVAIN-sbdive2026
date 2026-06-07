"""
Expo Push Notifications helper.
Sends remote push to drivers' Expo push tokens via the Expo Push API
(no credentials required for Expo-managed delivery). Used to alert drivers
of high-value/urgent missions even when the app is closed.
"""
from typing import Optional

import httpx
from core.config import db

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _is_expo_token(token: str) -> bool:
    return isinstance(token, str) and token.startswith(("ExponentPushToken[", "ExpoPushToken["))


async def send_expo_push(tokens: list[str], title: str, body: str, data: Optional[dict] = None) -> None:
    """Fire-and-forget Expo push to a list of tokens. Best-effort, never raises."""
    messages = [
        {
            "to": tok,
            "title": title,
            "body": body,
            "sound": "default",
            "priority": "high",
            "channelId": "missions",
            "data": data or {},
        }
        for tok in tokens
        if _is_expo_token(tok)
    ]
    if not messages:
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Expo accepts batched arrays; chunk to be safe (<=100 per request)
            for i in range(0, len(messages), 100):
                await client.post(EXPO_PUSH_URL, json=messages[i:i + 100],
                                  headers={"Content-Type": "application/json", "Accept": "application/json"})
    except Exception:
        pass


async def notify_drivers(title: str, body: str, data: Optional[dict] = None, online_only: bool = False) -> None:
    """Send a push to all drivers that registered an Expo push token."""
    query: dict = {"push_token": {"$exists": True, "$ne": None}}
    if online_only:
        query["is_online"] = True
    drivers = await db.drivers.find(query, {"_id": 0, "push_token": 1}).to_list(2000)
    tokens = [d["push_token"] for d in drivers if d.get("push_token")]
    await send_expo_push(tokens, title, body, data)


async def notify_user(user_id: str, title: str, body: str, data: Optional[dict] = None) -> None:
    """Send a push to a single user via their registered Expo push token."""
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "push_token": 1})
    token = (u or {}).get("push_token")
    if token:
        await send_expo_push([token], title, body, data)
