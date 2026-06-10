"""AI KYC face-match for payout-method verification.

Compares a selfie against the photo on an ID document using a vision-capable LLM
(gpt-5.4 via the Emergent universal key). Returns a structured verdict that ASSISTS
the admin — final payout-method approval is always a human decision.

Never raises: on any failure it degrades to verdict 'uncertain' so the admin still
reviews the dossier manually.
"""
import os
import json
import uuid
import logging

from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")

_DEFAULT = {
    "verdict": "uncertain",
    "confidence": 0,
    "reasoning": "Vérification IA indisponible — revue manuelle requise.",
    "ai": False,
}

_SYSTEM = (
    "You are a strict KYC identity-verification assistant. You receive two images: "
    "image 1 is a SELFIE of a person, image 2 is a photo of an official ID document. "
    "Compare the human face in the selfie with the face printed on the ID document. "
    "Respond ONLY with a compact JSON object and nothing else: "
    '{"verdict":"match|no_match|uncertain","confidence":0-100,"reasoning":"short explanation"}. '
    "Use 'uncertain' when an image is unreadable, blurry, cropped, or no face is visible. "
    "Be conservative: only answer 'match' when you are clearly confident it is the same person."
)


def _strip(data: str) -> str:
    if isinstance(data, str) and data.startswith("data:"):
        return data.split(",", 1)[1]
    return data


async def verify_face_match(selfie_b64: str, id_b64: str) -> dict:
    """Return {verdict, confidence, reasoning, ai}. Never raises."""
    if not EMERGENT_LLM_KEY or not selfie_b64 or not id_b64:
        return dict(_DEFAULT)
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"facematch_{uuid.uuid4().hex[:8]}",
            system_message=_SYSTEM,
        ).with_model("openai", "gpt-4o")
        msg = UserMessage(
            text="Image 1 = selfie, Image 2 = ID document. Do the faces belong to the same person? Reply with JSON only.",
            file_contents=[
                ImageContent(image_base64=_strip(selfie_b64)),
                ImageContent(image_base64=_strip(id_b64)),
            ],
        )
        resp = await chat.send_message(msg)
        text = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))
        start, end = text.find("{"), text.rfind("}")
        data = json.loads(text[start:end + 1]) if start >= 0 and end > start else {}
        verdict = data.get("verdict", "uncertain")
        if verdict not in ("match", "no_match", "uncertain"):
            verdict = "uncertain"
        try:
            confidence = max(0, min(100, int(data.get("confidence", 0) or 0)))
        except (TypeError, ValueError):
            confidence = 0
        return {
            "verdict": verdict,
            "confidence": confidence,
            "reasoning": str(data.get("reasoning", ""))[:500],
            "ai": True,
        }
    except Exception as e:
        logger.error(f"verify_face_match error: {e}")
        return dict(_DEFAULT)
