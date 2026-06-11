"""Envoi de SMS via Twilio — feature-flaggé.

Si les variables d'environnement Twilio sont absentes, toutes les fonctions sont
des no-op : les flux applicatifs (ex. SOS) continuent de fonctionner sans erreur.
L'envoi réel s'active automatiquement dès que TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN
/ TWILIO_PHONE_NUMBER sont renseignés.

L'appel `client.messages.create` du SDK Twilio est bloquant ; il est exécuté dans un
thread (`asyncio.to_thread`) pour rester compatible avec FastAPI async.
"""
import os
import re
import asyncio

from core.config import logger

ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
FROM_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "")


def sms_enabled() -> bool:
    return bool(ACCOUNT_SID and AUTH_TOKEN and FROM_NUMBER)


def to_e164(phone: str, default_country_code: str = "33") -> str:
    """Normalise un numéro au format E.164 (best-effort).
    - Conserve un '+' déjà présent.
    - '00xx...' -> '+xx...'.
    - Un numéro national commençant par 0 (ex. FR '0612...') -> +33612...
    Renvoie '' si le numéro est inexploitable.
    """
    if not phone:
        return ""
    p = str(phone).strip()
    if p.startswith("+"):
        digits = "+" + re.sub(r"\D", "", p[1:])
        return digits if len(digits) >= 8 else ""
    digits = re.sub(r"\D", "", p)
    if not digits:
        return ""
    if digits.startswith("00"):
        return "+" + digits[2:]
    if digits.startswith("0"):
        return "+" + default_country_code + digits[1:]
    # déjà un code pays sans '+'
    return "+" + digits


def _send_sync(to: str, body: str) -> bool:
    from twilio.rest import Client
    client = Client(ACCOUNT_SID, AUTH_TOKEN)
    client.messages.create(to=to, from_=FROM_NUMBER, body=body)
    return True


async def send_sms(to: str, body: str) -> bool:
    """Envoie un SMS unique. Renvoie False (sans lever d'exception) en cas d'échec
    ou si le service est désactivé."""
    if not sms_enabled():
        return False
    num = to_e164(to)
    if not num:
        logger.warning("SMS skipped: invalid phone %r", to)
        return False
    try:
        await asyncio.to_thread(_send_sync, num, body[:1500])
        return True
    except Exception as e:
        logger.error("Twilio SMS error to %s: %s", num, e)
        return False


async def send_sms_to_many(phones: list, body: str) -> int:
    """Envoie le même SMS à plusieurs numéros. Renvoie le nombre d'envois réussis."""
    if not sms_enabled() or not phones:
        return 0
    results = await asyncio.gather(*[send_sms(p, body) for p in phones], return_exceptions=True)
    return sum(1 for r in results if r is True)
