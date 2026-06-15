"""Voice booking endpoint — parses a natural-language transcript into a structured taxi booking request.

The frontend captures audio via the Web Speech API (no STT cost) and POSTs the transcript here.
We use Emergent Universal LLM Key + Claude Sonnet 4.5 to extract pickup, dropoff, vehicle type, etc.
"""
import asyncio
import json
import logging
import os
from datetime import datetime, timezone

import requests
from fastapi import APIRouter, File, HTTPException, Request, UploadFile, Form

from core.config import db
from core.deps import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voice", tags=["voice"])

# Langues supportées par l'assistant vocal (dictée + IA + Whisper).
SUPPORTED_LANGS = {"fr", "en", "it", "es", "pt", "de"}


def _safe_lang(code) -> str:
    c = (code or "fr").strip().lower()[:2]
    return c if c in SUPPORTED_LANGS else "fr"


GOOGLE_MAPS_KEY = os.environ.get("GOOGLE_MAPS_KEY")
_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

# Voice vehicle_type → real vehicle_types.slug used by /api/rides.
VEHICLE_SLUG = {"vtc-taxi": "sb", "moto-taxi": "moto", "premium": "luxe", "van": "van"}

# Intent → in-app route (for intents we route to instead of auto-executing).
INTENT_ROUTE = {
    "book_taxi": "/ride", "book_runner": "/runner", "book_delivery": "/parcel",
    "book_food": "/food", "book_beauty": "/beauty", "book_pet_care": "/pet-care",
    "book_car_care": "/car-care", "book_towing": "/towing",
    "book_intercity": "/course?mode=intercity", "book_carpool": "/carpool",
    "book_video_consult": "/video-consult", "book_parking": "/parking",
    "search_marketplace": "/marketplace", "search_nearby": "/nearby",
    "open_wallet": "/wallet", "view_rides": "/history", "call_sos": "/safety",
}


async def _geocode(address: str, lang: str = "fr"):
    """Géocode une adresse libre → {address, lat, lng} ou None (clé Google côté serveur)."""
    if not GOOGLE_MAPS_KEY or not address:
        return None
    params = {"address": address.strip(), "key": GOOGLE_MAPS_KEY, "language": _safe_lang(lang)}
    try:
        resp = await asyncio.to_thread(
            lambda: requests.get(_GEOCODE_URL, params=params, timeout=6))
        data = resp.json()
    except Exception:
        return None
    results = data.get("results") or []
    if data.get("status") != "OK" or not results:
        return None
    top = results[0]
    loc = top["geometry"]["location"]
    return {"address": top.get("formatted_address", address.strip()),
            "lat": loc["lat"], "lng": loc["lng"]}


SYSTEM_PROMPT = """Tu es un assistant multilingue qui extrait une intention de service à la demande à partir d'une phrase parlée par l'utilisateur d'une super-app (taxi, livraison, beauté, animaux, food, etc.).

L'utilisateur peut parler en FRANÇAIS, ANGLAIS, ITALIEN, ESPAGNOL, PORTUGAIS ou ALLEMAND. Comprends la demande quelle que soit la langue et mappe-la par le SENS (pas seulement par mots-clés). Les noms de lieux/adresses doivent être conservés tels que prononcés.

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

Correspondances d'intention (exemples valables dans TOUTES les langues ci-dessus — comprends l'équivalent EN/IT/ES/PT/DE) :
- taxi/vtc/voiture/course/ramène-moi/déposer | taxi/car/ride/pick me up/drop | taxi/auto/corsa | coche/viaje | carro/corrida | Auto/Fahrt → book_taxi
- coursier/récupère/va chercher | courier/pick up parcel | corriere | mensajero | estafeta | Kurier → book_runner
- livre/livraison/colis | deliver/delivery/parcel | consegna | entrega | Lieferung → book_delivery
- restaurant/à manger/pizza/sushi/burger | food/eat/order food | mangiare | comer/comida | comer | essen → book_food
- coiffeur/salon/manucure/massage | hairdresser/beauty/manicure | parrucchiere | peluquería | cabeleireiro | Friseur → book_beauty
- vétérinaire/toiletteur/chien/chat | vet/groomer/dog/cat | veterinario | veterinario/mascota | veterinário | Tierarzt → book_pet_care
- garagiste/lavage/vidange/carrosserie | car wash/garage/oil change | meccanico | taller/lavado | oficina | Werkstatt → book_car_care
- dépannage/panne/remorquage/crevaison | breakdown/towing/flat tire | carro attrezzi | grúa/avería | reboque | Abschleppdienst → book_towing
- covoiturage/carpool | covoiturage/carpool/share ride | carpooling | compartir coche | boleia | Mitfahrt → book_carpool
- téléconsultation/voir un médecin | video doctor/teleconsultation | telemedicina | teleconsulta médica | teleconsulta | Videosprechstunde → book_video_consult
- parking/garer/stationnement | parking | parcheggio | aparcamiento | estacionamento | Parkplatz → book_parking
- boutique/magasin/annonces | shop/marketplace/listings | negozio | tienda/anuncios | loja | Shop → search_marketplace
- autour de moi/près de moi | around me/nearby | vicino a me | cerca de mí | perto de mim | in der Nähe → search_nearby
- portefeuille/solde/wallet → open_wallet
- mes courses/historique | my rides/history → view_rides
- urgence/police/SOS/à l'aide | emergency/help | emergenza | emergencia | emergência | Notfall → call_sos
- Si rien ne matche, intent = "unknown" et confidence = 0

Règles d'adresses:
- Pour pickup: "ma position"/"ici"/"actuelle" (et équivalents : "my location"/"here", "la mia posizione", "mi ubicación", "minha localização", "mein Standort") → "current_location"
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
    parsed = await _llm_extract(transcript, _safe_lang(body.get("language")))

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


async def _prepare_taxi(parsed: dict, body: dict, lang: str = "fr") -> dict:
    """Résout pickup/dropoff + estimation → action book_taxi exécutable, ou
    action navigate si les adresses sont insuffisantes pour commander direct."""
    cur_lat, cur_lng = body.get("current_lat"), body.get("current_lng")
    pickup_raw = parsed.get("pickup")

    # Pickup : "current_location"/null → position actuelle ; sinon géocodage.
    if pickup_raw in (None, "", "current_location") and cur_lat and cur_lng:
        pickup = {"address": "Ma position actuelle", "lat": float(cur_lat), "lng": float(cur_lng)}
    elif pickup_raw and pickup_raw != "current_location":
        pickup = await _geocode(pickup_raw, lang)
    elif cur_lat and cur_lng:
        pickup = {"address": "Ma position actuelle", "lat": float(cur_lat), "lng": float(cur_lng)}
    else:
        pickup = None

    dropoff = await _geocode(parsed.get("dropoff"), lang) if parsed.get("dropoff") else None

    # Sans départ ET arrivée géolocalisés on ne peut pas commander : on route avec préremplissage.
    if not pickup or not dropoff:
        return {"type": "navigate", "route": INTENT_ROUTE["book_taxi"], "prefill": parsed,
                "reason": "addresses_incomplete"}

    slug = VEHICLE_SLUG.get(parsed.get("vehicle_type")) or "sb"
    estimate = None
    try:
        from models.schemas import RideRequest
        from routes.rides import estimate_ride
        req = RideRequest(
            pickup_lat=pickup["lat"], pickup_lng=pickup["lng"], pickup_address=pickup["address"],
            dropoff_lat=dropoff["lat"], dropoff_lng=dropoff["lng"], dropoff_address=dropoff["address"],
            vehicle_type=slug, payment_method="cash", ride_type="instant",
        )
        estimate = await estimate_ride(req)
    except Exception as e:
        logger.warning("voice taxi estimate failed: %s", e)

    return {
        "type": "book_taxi",
        "pickup": pickup,
        "dropoff": dropoff,
        "vehicle_type": slug,
        "estimate": {
            "fare": (estimate or {}).get("estimated_fare"),
            "distance_km": (estimate or {}).get("distance_km"),
            "duration_mins": (estimate or {}).get("duration_mins"),
        } if estimate else None,
    }


async def _prepare_food(parsed: dict) -> dict:
    """Cherche dans le VRAI catalogue le plat/commerce correspondant → action book_food."""
    from routes.assistant import search_products, search_merchants
    kw = parsed.get("category") or parsed.get("notes") or ""
    intent = {"keywords": kw, "open_now": False}
    products = await search_products(intent) if kw else []
    merchants = [] if products else await search_merchants(intent)
    if not products and not merchants and kw:
        # Élargit : on tente une recherche de commerces de restauration.
        merchants = await search_merchants({"keywords": kw, "store_type": "restaurant"})
    return {
        "type": "book_food",
        "query": kw,
        "product": products[0] if products else None,
        "products": products[:4],
        "merchant": merchants[0] if merchants else None,
        "merchants": merchants[:4],
        "route": INTENT_ROUTE["book_food"],
    }


@router.post("/prepare")
async def prepare_action(request: Request):
    """Transforme une commande vocale en ACTION exécutable (taxi prêt à confirmer,
    repas trouvé dans le catalogue) ou en navigation préremplie pour les autres services."""
    user = await get_current_user(request)
    body = await request.json()
    transcript = (body.get("transcript") or "").strip()
    if not transcript:
        raise HTTPException(400, "Transcript vide")
    if len(transcript) > 800:
        raise HTTPException(400, "Transcript trop long (max 800 caractères)")

    parsed = await _llm_extract(transcript, _safe_lang(body.get("language")))
    intent = parsed.get("intent") or "unknown"

    lang = _safe_lang(body.get("language"))
    if intent == "book_taxi":
        action = await _prepare_taxi(parsed, body, lang)
    elif intent in ("book_food", "book_delivery"):
        action = await _prepare_food(parsed)
    elif intent in INTENT_ROUTE:
        action = {"type": "navigate", "route": INTENT_ROUTE[intent], "prefill": parsed}
    else:
        action = {"type": "unknown"}

    await db.voice_bookings.insert_one({
        "user_id": user["id"], "transcript": transcript, "parsed": parsed,
        "action_type": action.get("type"), "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"transcript": transcript, "parsed": parsed, "intent": intent, "action": action}



@router.post("/transcribe")
async def transcribe_audio(request: Request, file: UploadFile = File(...),
                           language: str = Form("fr")):
    """Transcrit un court extrait audio via OpenAI Whisper (whisper-1) — repli
    pour les navigateurs sans dictée (iOS/Safari). Langue parmi fr/en/it/es/pt/de.
    Renvoie {transcript}."""
    user = await get_current_user(request)  # noqa: F841 — auth requise
    lang = _safe_lang(language)
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(503, "Transcription vocale non configurée")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Audio vide")
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "Audio trop volumineux (max 25 Mo)")

    name = (file.filename or "").lower()
    suffix = ".webm"
    for ext in (".webm", ".m4a", ".mp3", ".wav", ".mp4", ".mpeg", ".mpga"):
        if name.endswith(ext):
            suffix = ext
            break

    import tempfile
    try:
        from emergentintegrations.llm.openai import OpenAISpeechToText
        stt = OpenAISpeechToText(api_key=api_key)
        with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
            tmp.write(data)
            tmp.flush()
            with open(tmp.name, "rb") as audio_file:
                resp = await stt.transcribe(
                    file=audio_file, model="whisper-1", language=lang, response_format="text")
        text = resp if isinstance(resp, str) else getattr(resp, "text", "")
        return {"transcript": (text or "").strip()}
    except Exception as e:
        logger.warning("Whisper transcription failed: %s", e)
        raise HTTPException(502, "Transcription impossible, réessayez")


async def _llm_extract(transcript: str, lang: str = "fr") -> dict:
    """Call Claude Sonnet via Emergent Universal LLM Key and return parsed JSON.

    `lang` est la langue de l'app (fr/en/it/es/pt/de) — l'IA comprend les 6 langues
    via le system prompt ; on le précise pour lever toute ambiguïté.
    """
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
        hint = f"[langue utilisateur: {_safe_lang(lang)}]\n"
        raw = await chat.send_message(UserMessage(text=hint + transcript))
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
