"""Voice booking endpoint — parses a natural-language transcript into a structured taxi booking request.

The frontend captures audio via the Web Speech API (no STT cost) and POSTs the transcript here.
We use Emergent Universal LLM Key + Claude Sonnet 4.5 to extract pickup, dropoff, vehicle type, etc.
"""
import json
import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from core.config import db
from core.deps import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voice", tags=["voice"])


SYSTEM_PROMPT = """Tu es un assistant qui extrait une intention de réservation de taxi à partir d'une phrase en français parlée par un utilisateur.

Tu DOIS répondre UNIQUEMENT par un objet JSON valide (sans backticks, sans markdown, sans texte autour) avec exactement ces champs:
{
  "intent": "book_taxi" | "book_delivery" | "book_runner" | "unknown",
  "pickup": "adresse complète ou null",
  "dropoff": "adresse complète ou null",
  "vehicle_type": "vtc-taxi" | "moto-taxi" | "premium" | "van" | null,
  "when": "now" | "ISO8601 datetime" | null,
  "passengers": 1,
  "notes": "instructions ou null",
  "confidence": 0.0 à 1.0
}

Règles:
- Si l'utilisateur dit "ma position", "ici", "actuelle" pour le départ → pickup = "current_location"
- Si le type de véhicule n'est pas précisé → vehicle_type = "vtc-taxi"
- "moto", "scooter" → "moto-taxi". "premium", "berline", "haut de gamme" → "premium". "van", "minibus" → "van".
- Si l'intention n'est pas une réservation de taxi/livraison/coursier → intent = "unknown" et confidence = 0
- Adresses: garde le texte exact mentionné, ne devine pas de code postal
"""


@router.post("/parse-booking")
async def parse_booking(request: Request):
    """Parse a voice transcript into a structured booking intent."""
    user = await get_current_user(request)
    body = await request.json()
    transcript = (body.get("transcript") or "").strip()
    if not transcript:
        raise HTTPException(400, "Transcript vide")
    if len(transcript) > 800:
        raise HTTPException(400, "Transcript trop long (max 800 caractères)")

    # Try LLM extraction via Emergent integrations
    parsed = await _llm_extract(transcript)

    # Log for analytics/debugging
    await db.voice_bookings.insert_one({
        "user_id": user["id"],
        "transcript": transcript,
        "parsed": parsed,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "transcript": transcript,
        "parsed": parsed,
    }


async def _llm_extract(transcript: str) -> dict:
    """Call Claude Sonnet via Emergent Universal LLM Key and return parsed JSON."""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        logger.warning("EMERGENT_LLM_KEY missing — falling back to rule-based parser")
        return _fallback_extract(transcript)

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = (
            LlmChat(
                api_key=api_key,
                session_id=f"voice_booking_{datetime.now().timestamp()}",
                system_message=SYSTEM_PROMPT,
            )
            .with_model("anthropic", "claude-sonnet-4-6")
        )
        raw = await chat.send_message(UserMessage(text=transcript))
        # Extract JSON from response
        text = (raw or "").strip()
        # Strip code fences if present
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.lower().startswith("json"):
                text = text[4:].strip()
        return _normalize(json.loads(text))
    except Exception as e:
        logger.warning("Voice LLM extraction failed: %s — using fallback", e)
        return _fallback_extract(transcript)


def _normalize(parsed: dict) -> dict:
    """Ensure all expected fields are present with valid types."""
    return {
        "intent": parsed.get("intent") or "unknown",
        "pickup": parsed.get("pickup") or None,
        "dropoff": parsed.get("dropoff") or None,
        "vehicle_type": parsed.get("vehicle_type") or ("vtc-taxi" if (parsed.get("intent") == "book_taxi") else None),
        "when": parsed.get("when") or "now",
        "passengers": int(parsed.get("passengers") or 1),
        "notes": parsed.get("notes") or None,
        "confidence": float(parsed.get("confidence") or 0.6),
    }


def _fallback_extract(transcript: str) -> dict:
    """Heuristic fallback when LLM is unavailable."""
    low = transcript.lower()
    intent = "unknown"
    if any(w in low for w in ("taxi", "vtc", "voiture", "course", "déposer", "ramener")):
        intent = "book_taxi"
    elif any(w in low for w in ("colis", "livrer", "livraison")):
        intent = "book_delivery"
    elif any(w in low for w in ("coursier", "runner", "récupère")):
        intent = "book_runner"

    pickup = dropoff = None
    # Pattern: "de X à Y" / "du X au Y"
    import re
    m = re.search(r"\b(?:de|du)\s+([^,]+?)\s+(?:à|au|jusqu['e]à?)\s+(.+)$", low)
    if m:
        pickup = m.group(1).strip()
        dropoff = m.group(2).strip()
    elif any(w in low for w in ("ici", "ma position", "position actuelle", "actuelle")):
        pickup = "current_location"

    vehicle = "vtc-taxi" if intent == "book_taxi" else None
    if "moto" in low or "scooter" in low:
        vehicle = "moto-taxi"
    elif "premium" in low or "berline" in low:
        vehicle = "premium"
    elif "van" in low or "minibus" in low:
        vehicle = "van"

    return _normalize({
        "intent": intent,
        "pickup": pickup,
        "dropoff": dropoff,
        "vehicle_type": vehicle,
        "when": "now",
        "passengers": 1,
        "notes": None,
        "confidence": 0.4 if intent != "unknown" else 0.0,
    })
