"""Appels vocaux masqués via Twilio (relais anti-fraude) — feature-flaggé.

Utilisé en repli (fallback) quand l'appel in-app WebRTC échoue après plusieurs
tentatives : Twilio rappelle l'appelant puis compose le numéro du correspondant,
les DEUX parties ne voyant que le numéro Twilio (mise en relation, numéros réels
jamais dévoilés). Désactivé tant que les identifiants Twilio ne sont pas valides.
"""
import os
import asyncio

from core.config import logger
from core.sms import to_e164

ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
FROM_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "")


def voice_enabled() -> bool:
    return bool(ACCOUNT_SID and AUTH_TOKEN and FROM_NUMBER)


def _xml_escape(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _place_sync(caller: str, callee: str) -> str:
    from twilio.rest import Client
    client = Client(ACCOUNT_SID, AUTH_TOKEN)
    twiml = (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
        "<Response>"
        "<Say language=\"fr-FR\">Mise en relation SB Drive, veuillez patienter.</Say>"
        f"<Dial callerId=\"{_xml_escape(FROM_NUMBER)}\" timeout=\"30\">{_xml_escape(callee)}</Dial>"
        "</Response>"
    )
    call = client.calls.create(to=caller, from_=FROM_NUMBER, twiml=twiml)
    return call.sid


async def place_masked_call(caller_phone: str, callee_phone: str) -> dict:
    """Lance un appel masqué Twilio. Renvoie {ok, masked_number, call_sid?} ou {ok:False}."""
    if not voice_enabled():
        return {"ok": False, "reason": "voice_disabled"}
    caller = to_e164(caller_phone)
    callee = to_e164(callee_phone)
    if not caller or not callee:
        return {"ok": False, "reason": "invalid_number"}
    try:
        sid = await asyncio.to_thread(_place_sync, caller, callee)
        return {"ok": True, "masked_number": FROM_NUMBER, "call_sid": sid}
    except Exception as e:
        logger.error("Twilio masked call error: %s", e)
        return {"ok": False, "reason": "twilio_error"}
