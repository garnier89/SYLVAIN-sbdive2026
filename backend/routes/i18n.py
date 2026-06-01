"""
Internationalization labels (V3Cube language_label + language_master).

Iteration 75 — Permet d'ajouter une langue ou modifier des libellés sans redéploiement.
Compose les labels à servir dynamiquement au frontend via /api/i18n/{lang}.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Dict, Optional
from datetime import datetime, timezone

from core.config import db
from core.permissions import require_permission

router = APIRouter(prefix="/i18n", tags=["i18n"])

DEFAULT_LANGUAGES = [
    {"code": "fr", "name": "Français", "is_default": True, "is_active": True, "flag": "🇫🇷"},
    {"code": "en", "name": "English", "is_default": False, "is_active": True, "flag": "🇬🇧"},
    {"code": "es", "name": "Español", "is_default": False, "is_active": True, "flag": "🇪🇸"},
    {"code": "pt", "name": "Português", "is_default": False, "is_active": True, "flag": "🇵🇹"},
    {"code": "ar", "name": "العربية", "is_default": False, "is_active": False, "flag": "🇸🇦"},
]

# Bootstrap minimal labels (FR primary; EN fallback). The frontend can ship a richer base bundle.
SEED_LABELS_FR = {
    "common.welcome": "Bienvenue",
    "common.continue": "Continuer",
    "common.cancel": "Annuler",
    "common.confirm": "Confirmer",
    "common.save": "Enregistrer",
    "common.loading": "Chargement…",
    "common.error": "Erreur",
    "auth.login": "Se connecter",
    "auth.logout": "Déconnexion",
    "auth.register": "S'inscrire",
    "auth.forgot_password": "Mot de passe oublié ?",
    "ride.book": "Réserver une course",
    "ride.find_driver": "Trouver un chauffeur",
    "ride.estimated_fare": "Tarif estimé",
    "ride.in_progress": "En cours",
    "ride.completed": "Terminée",
    "ride.cancelled": "Annulée",
    "kiosk.welcome": "Bienvenue à",
    "kiosk.book_now": "Réserver un chauffeur",
    "kiosk.lock": "Verrouiller la borne",
    "subscription.choose_plan": "Choisir un plan",
    "subscription.current_plan": "Plan actuel",
    "subscription.expires_in": "Expire dans",
}

SEED_LABELS_EN = {
    "common.welcome": "Welcome",
    "common.continue": "Continue",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "common.save": "Save",
    "common.loading": "Loading…",
    "common.error": "Error",
    "auth.login": "Sign in",
    "auth.logout": "Sign out",
    "auth.register": "Sign up",
    "auth.forgot_password": "Forgot password?",
    "ride.book": "Book a ride",
    "ride.find_driver": "Find a driver",
    "ride.estimated_fare": "Estimated fare",
    "ride.in_progress": "In progress",
    "ride.completed": "Completed",
    "ride.cancelled": "Cancelled",
    "kiosk.welcome": "Welcome to",
    "kiosk.book_now": "Book a taxi",
    "kiosk.lock": "Lock the kiosk",
    "subscription.choose_plan": "Choose a plan",
    "subscription.current_plan": "Current plan",
    "subscription.expires_in": "Expires in",
}


async def seed_i18n():
    """Idempotent seed of languages and base labels."""
    # Languages
    for lang in DEFAULT_LANGUAGES:
        await db.i18n_languages.update_one({"code": lang["code"]}, {"$set": lang}, upsert=True)
    # Labels (seed only if empty)
    if await db.i18n_translations.count_documents({"lang": "fr"}) == 0:
        for key, value in SEED_LABELS_FR.items():
            await db.i18n_translations.insert_one({"lang": "fr", "key": key, "value": value, "updated_at": datetime.now(timezone.utc).isoformat()})
    if await db.i18n_translations.count_documents({"lang": "en"}) == 0:
        for key, value in SEED_LABELS_EN.items():
            await db.i18n_translations.insert_one({"lang": "en", "key": key, "value": value, "updated_at": datetime.now(timezone.utc).isoformat()})


class LabelSet(BaseModel):
    lang: str
    key: str
    value: str


@router.get("/languages")
async def list_languages():
    items = await db.i18n_languages.find({"is_active": True}, {"_id": 0}).to_list(50)
    return {"items": items}


@router.get("/{lang}")
async def get_labels(lang: str):
    """Return all labels for a language as a dict {key: value}."""
    items = await db.i18n_translations.find({"lang": lang}, {"_id": 0, "key": 1, "value": 1}).to_list(2000)
    labels = {item["key"]: item["value"] for item in items}
    return {"lang": lang, "labels": labels, "total": len(labels)}


@router.post("/admin/labels")
async def set_label(body: LabelSet, current_user: dict = Depends(require_permission("server.settings.edit"))):
    await db.i18n_translations.update_one(
        {"lang": body.lang, "key": body.key},
        {"$set": {"value": body.value, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"updated": True}


@router.delete("/admin/labels/{lang}/{key:path}")
async def delete_label(lang: str, key: str, current_user: dict = Depends(require_permission("server.settings.edit"))):
    res = await db.i18n_translations.delete_one({"lang": lang, "key": key})
    if res.deleted_count == 0:
        raise HTTPException(404, "Label not found")
    return {"deleted": True}


@router.get("/admin/missing")
async def find_missing_labels(target_lang: str, base_lang: str = "fr", current_user: dict = Depends(require_permission("server.settings.edit"))):
    """List keys that exist in base_lang but not in target_lang."""
    base_keys = {d["key"] async for d in db.i18n_translations.find({"lang": base_lang}, {"_id": 0, "key": 1})}
    target_keys = {d["key"] async for d in db.i18n_translations.find({"lang": target_lang}, {"_id": 0, "key": 1})}
    missing = sorted(base_keys - target_keys)
    return {"missing": missing, "total": len(missing)}
