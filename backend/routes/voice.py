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


SYSTEM_PROMPT = """Tu es un assistant qui extrait une intention de service à la demande à partir d'une phrase en français parlée par l'utilisateur d'une super-app (taxi, livraison, beauté, animaux, food, etc.).

Tu DOIS répondre UNIQUEMENT par un objet JSON valide (sans backticks, sans markdown, sans texte autour) avec exactement ces champs:
{
  "intent": "book_taxi" | "book_runner" | "book_delivery" | "book_food" | "book_beauty" | "book_pet_care" | "book_car_care" | "book_towing" | "book_intercity" | "book_carpool" | "book_video_consult" | "book_parking" | "search_marketplace" | "search_nearby" | "open_wallet" | "view_rides" | "call_sos" | "unknown",
  "pickup": "adresse complète ou null",
  "dropoff": "adresse complète ou null",
  "vehicle_type": "vtc-taxi" | "moto-taxi" | "premium" | "van" | null,
  "category": "string ou null",
  "when": "now" | "ISO8601" | null,
  "passengers": 1,
  "notes": "instructions précises mentionnées ou null",
  "confidence": 0.0 à 1.0
}

Règles d'intention:
- "taxi", "vtc", "voiture", "course", "ramène-moi", "déposer", "rejoindre" → book_taxi
- "coursier", "récupère", "ramène le sac", "va chercher" → book_runner
- "livre", "livraison", "envoie le colis" → book_delivery
- "restaurant", "à manger", "pizza", "sushi", "burger", "food", "commander à manger" → book_food
- "coiffeur", "salon de beauté", "manucure", "épilation", "massage" → book_beauty
- "vétérinaire", "toiletteur", "promener mon chien", "garder mon animal" → book_pet_care
- "garagiste", "lavage auto", "vidange", "entretien voiture", "carrosserie" → book_car_care
- "dépannage", "panne", "remorquage", "batterie déchargée", "crevaison" → book_towing
- "trajet longue distance", "Paris-Lyon", "intercity", "covoiturage" + ville lointaine → book_intercity
- "covoiturage", "carpool", "partager le trajet" → book_carpool
- "consultation médicale", "téléconsultation", "voir un médecin", "vidéo médecin" → book_video_consult
- "parking", "garer", "place de stationnement" → book_parking
- "trouve une boutique", "magasin", "annonces", "vente" → search_marketplace
- "autour de moi", "près de moi", "nearby" → search_nearby
- "mon portefeuille", "mon solde", "wallet" → open_wallet
- "mes courses", "historique" → view_rides
- "urgence", "police", "SOS", "à l'aide" → call_sos
- Si rien ne matche, intent = "unknown" et confidence = 0

Règles d'adresses:
- Pour pickup: "ma position", "ici", "actuelle", "depuis chez moi" → "current_location"
- vehicle_type uniquement si l'intent est book_taxi/book_runner/book_delivery
- Pour book_food/book_beauty/etc., utilise "category" pour préciser (ex: "pizza", "sushi", "coiffeur homme")
- Garde le texte exact d'adresse mentionné, ne devine pas
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
    confidence = parsed.get("confidence")
    if confidence is None:
        confidence = 0.6
    return {
        "intent": parsed.get("intent") or "unknown",
        "pickup": parsed.get("pickup") or None,
        "dropoff": parsed.get("dropoff") or None,
        "vehicle_type": parsed.get("vehicle_type") or ("vtc-taxi" if (parsed.get("intent") == "book_taxi") else None),
        "category": parsed.get("category") or None,
        "when": parsed.get("when") or "now",
        "passengers": int(parsed.get("passengers") or 1),
        "notes": parsed.get("notes") or None,
        "confidence": float(confidence),
    }


def _fallback_extract(transcript: str) -> dict:
    """Heuristic fallback when LLM is unavailable. Maps French keywords → intent."""
    low = transcript.lower()
    intent = "unknown"
    category = None

    keyword_map = [
        (("taxi", "vtc", "voiture", "course", "déposer", "ramener", "ramène"), "book_taxi"),
        (("coursier", "récupère", "va chercher"), "book_runner"),
        (("livre", "livraison", "envoie le colis"), "book_delivery"),
        (("restaurant", "manger", "pizza", "sushi", "burger", "food", "commander"), "book_food"),
        (("coiffeur", "salon de beauté", "manucure", "épilation", "massage", "esthétique"), "book_beauty"),
        (("vétérinaire", "toiletteur", "chien", "chat", "animal"), "book_pet_care"),
        (("garagiste", "lavage", "vidange", "entretien voiture", "carrosserie"), "book_car_care"),
        (("dépannage", "panne", "remorquage", "crevaison"), "book_towing"),
        (("covoiturage", "carpool"), "book_carpool"),
        (("téléconsultation", "consultation médicale", "vidéo médecin"), "book_video_consult"),
        (("parking", "garer", "stationnement"), "book_parking"),
        (("portefeuille", "mon solde", "wallet"), "open_wallet"),
        (("urgence", "sos", "à l'aide", "police"), "call_sos"),
    ]
    for kws, label in keyword_map:
        if any(k in low for k in kws):
            intent = label
            break

    # Category hints for non-transport services
    if intent == "book_food":
        for c in ("pizza", "sushi", "burger", "tacos", "asiatique", "indien", "italien", "français"):
            if c in low:
                category = c
                break

    pickup = dropoff = None
    import re
    m = re.search(r"\b(?:de|du)\s+([^,]+?)\s+(?:à|au|jusqu['’]?à?)\s+(.+)$", low)
    if m:
        pickup = m.group(1).strip()
        dropoff = m.group(2).strip()
    elif any(w in low for w in ("ici", "ma position", "position actuelle", "actuelle")):
        pickup = "current_location"

    vehicle = "vtc-taxi" if intent == "book_taxi" else None
    if intent == "book_taxi":
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
        "category": category,
        "when": "now",
        "passengers": 1,
        "notes": None,
        "confidence": 0.4 if intent != "unknown" else 0.0,
    })
