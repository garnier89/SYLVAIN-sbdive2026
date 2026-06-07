"""
Internationalization engine (i18n) — 30+ langues + traduction automatique LLM.

- Catalogue de 32 langues populaires (avec drapeau + sens RTL).
- Bundle de base FR/EN = source de vérité des libellés de l'app mobile.
- Moteur de traduction automatique (Claude via Emergent LLM key) : 1 clic
  traduit TOUTES les clés vers une langue cible (placeholders préservés),
  stocké en base (collection `i18n_app_bundles`).
- Endpoints publics consommés par les apps (mobile) : /languages, /bundle/{lang}.
- Endpoints admin : overview, activate, auto-translate, override d'une clé.

Collections: i18n_languages, i18n_app_bundles
"""
import os
import json as _json
import uuid
from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone

from core.config import db
from core.permissions import require_permission

router = APIRouter(prefix="/i18n", tags=["i18n"])

# ------------------------------------------------------------------
# Catalogue de langues populaires (native name + flag + RTL)
# ------------------------------------------------------------------
LANGUAGE_CATALOG = [
    {"code": "fr", "name": "Français", "flag": "🇫🇷", "is_rtl": False},
    {"code": "en", "name": "English", "flag": "🇬🇧", "is_rtl": False},
    {"code": "es", "name": "Español", "flag": "🇪🇸", "is_rtl": False},
    {"code": "pt", "name": "Português", "flag": "🇵🇹", "is_rtl": False},
    {"code": "de", "name": "Deutsch", "flag": "🇩🇪", "is_rtl": False},
    {"code": "it", "name": "Italiano", "flag": "🇮🇹", "is_rtl": False},
    {"code": "nl", "name": "Nederlands", "flag": "🇳🇱", "is_rtl": False},
    {"code": "pl", "name": "Polski", "flag": "🇵🇱", "is_rtl": False},
    {"code": "ru", "name": "Русский", "flag": "🇷🇺", "is_rtl": False},
    {"code": "uk", "name": "Українська", "flag": "🇺🇦", "is_rtl": False},
    {"code": "ro", "name": "Română", "flag": "🇷🇴", "is_rtl": False},
    {"code": "el", "name": "Ελληνικά", "flag": "🇬🇷", "is_rtl": False},
    {"code": "tr", "name": "Türkçe", "flag": "🇹🇷", "is_rtl": False},
    {"code": "ar", "name": "العربية", "flag": "🇸🇦", "is_rtl": True},
    {"code": "fa", "name": "فارسی", "flag": "🇮🇷", "is_rtl": True},
    {"code": "ur", "name": "اردو", "flag": "🇵🇰", "is_rtl": True},
    {"code": "he", "name": "עברית", "flag": "🇮🇱", "is_rtl": True},
    {"code": "hi", "name": "हिन्दी", "flag": "🇮🇳", "is_rtl": False},
    {"code": "bn", "name": "বাংলা", "flag": "🇧🇩", "is_rtl": False},
    {"code": "ta", "name": "தமிழ்", "flag": "🇮🇳", "is_rtl": False},
    {"code": "zh", "name": "中文", "flag": "🇨🇳", "is_rtl": False},
    {"code": "ja", "name": "日本語", "flag": "🇯🇵", "is_rtl": False},
    {"code": "ko", "name": "한국어", "flag": "🇰🇷", "is_rtl": False},
    {"code": "th", "name": "ไทย", "flag": "🇹🇭", "is_rtl": False},
    {"code": "vi", "name": "Tiếng Việt", "flag": "🇻🇳", "is_rtl": False},
    {"code": "id", "name": "Bahasa Indonesia", "flag": "🇮🇩", "is_rtl": False},
    {"code": "ms", "name": "Bahasa Melayu", "flag": "🇲🇾", "is_rtl": False},
    {"code": "tl", "name": "Filipino", "flag": "🇵🇭", "is_rtl": False},
    {"code": "sw", "name": "Kiswahili", "flag": "🇰🇪", "is_rtl": False},
    {"code": "ha", "name": "Hausa", "flag": "🇳🇬", "is_rtl": False},
    {"code": "yo", "name": "Yorùbá", "flag": "🇳🇬", "is_rtl": False},
    {"code": "am", "name": "አማርኛ", "flag": "🇪🇹", "is_rtl": False},
    # Suédois, Grec (déjà el), Slovène
    {"code": "sv", "name": "Svenska", "flag": "🇸🇪", "is_rtl": False},
    {"code": "sl", "name": "Slovenščina", "flag": "🇸🇮", "is_rtl": False},
    # Créoles à base française (DOM-TOM + Haïti)
    {"code": "gcf", "name": "Kréyòl Gwadloupéyen", "flag": "🇬🇵", "is_rtl": False},
    {"code": "gcf-mq", "name": "Kréyòl Matinik", "flag": "🇲🇶", "is_rtl": False},
    {"code": "ht", "name": "Kreyòl Ayisyen", "flag": "🇭🇹", "is_rtl": False},
    {"code": "rcf", "name": "Kréol Rénioné", "flag": "🇷🇪", "is_rtl": False},
    {"code": "gcr", "name": "Kriyòl Giyanè", "flag": "🇬🇫", "is_rtl": False},
    # Langues africaines
    {"code": "ln", "name": "Lingála", "flag": "🇨🇩", "is_rtl": False},
    {"code": "wo", "name": "Wolof", "flag": "🇸🇳", "is_rtl": False},
    {"code": "bci", "name": "Baoulé", "flag": "🇨🇮", "is_rtl": False},
    {"code": "dyu", "name": "Dioula", "flag": "🇨🇮", "is_rtl": False},
]

# Langues actives par défaut (les autres : activables par l'admin)
DEFAULT_ACTIVE = {"fr", "en", "es"}
DEFAULT_LANG = "fr"

# ------------------------------------------------------------------
# Bundles de base (source de vérité) — miroir des locales mobiles.
# ------------------------------------------------------------------
BASE_BUNDLE_FR = {
    "app_name": "SB Drive VTC",
    "common": {"loading": "Chargement...", "error": "Une erreur est survenue", "retry": "Reessayer", "save": "Enregistrer", "cancel": "Annuler", "confirm": "Confirmer", "continue": "Continuer", "back": "Retour", "close": "Fermer", "next": "Suivant", "skip": "Passer", "search": "Rechercher", "yes": "Oui", "no": "Non", "ok": "OK"},
    "auth": {"welcome": "Bienvenue", "subtitle": "Votre super-app de mobilite", "login": "Connexion", "register": "S'inscrire", "logout": "Deconnexion", "email": "Email", "phone": "Telephone", "password": "Mot de passe", "name": "Nom complet", "forgot_password": "Mot de passe oublie ?", "no_account": "Pas de compte ?", "have_account": "Deja un compte ?", "continue_with_google": "Continuer avec Google", "continue_with_email": "Continuer avec Email", "continue_with_phone": "Continuer avec Telephone", "phone_login_title": "Saisissez votre numero", "phone_login_hint": "Vous recevrez un code de verification", "otp_title": "Code de verification", "otp_hint": "Saisissez le code envoye au {{phone}}", "send_otp": "Envoyer le code", "verify_otp": "Verifier", "select_role": "Je suis...", "role_user": "Client", "role_driver": "Chauffeur", "role_merchant": "Marchand"},
    "tabs": {"home": "Accueil", "services": "Services", "orders": "Mes courses", "wallet": "Portefeuille", "profile": "Profil", "rides": "Courses", "earnings": "Gains", "jobs": "Missions", "dashboard": "Tableau de bord"},
    "user_home": {"hello": "Bonjour {{name}}", "where_to": "Ou allez-vous ?", "categories": "Categories", "promos": "Promotions", "recent": "Recents", "taxi": "Taxi", "moto": "Moto", "carpool": "Covoiturage", "food": "Food", "delivery": "Livraison", "runner": "Coursier", "beauty": "Beaute", "pet": "Animaux", "car_care": "Auto", "towing": "Depannage", "marketplace": "Marketplace", "nearby": "Pres de moi", "on_demand": "Services"},
    "booking": {"title": "Reserver un taxi", "pickup": "Lieu de prise en charge", "dropoff": "Destination", "vehicle_type": "Type de vehicule", "estimate": "Estimer", "book_now": "Reserver", "confirm_pickup": "Confirmer le depart", "confirm_dropoff": "Confirmer l'arrivee", "fare_estimate": "Tarif estime", "distance": "Distance", "duration": "Duree", "no_drivers": "Aucun chauffeur disponible", "searching_driver": "Recherche d'un chauffeur..."},
    "driver": {"online": "En ligne", "offline": "Hors ligne", "go_online": "Passer en ligne", "go_offline": "Passer hors ligne", "new_ride": "Nouvelle course", "accept": "Accepter", "decline": "Refuser", "navigate": "Naviguer", "start_ride": "Demarrer la course", "complete_ride": "Terminer la course", "earnings_today": "Gains du jour", "earnings_week": "Cette semaine", "rides_today": "Courses du jour", "rating": "Note", "acceptance": "Acceptation", "cancellation": "Annulation", "activity_score": "Score d'activite", "my_activity": "Mon activite", "priority": "Priorite", "palette_beginner": "Debutant", "palette_standard": "Standard", "palette_confirmed": "Confirme", "palette_expert": "Expert"},
    "merchant": {"dashboard": "Tableau de bord", "orders": "Commandes", "products": "Produits", "today_orders": "Commandes du jour", "today_revenue": "CA du jour", "pending": "En attente", "preparing": "En preparation", "ready": "Pret", "delivered": "Livre"},
    "wallet": {"title": "Portefeuille", "balance": "Solde", "topup": "Recharger", "history": "Historique", "amount": "Montant"},
    "profile": {"title": "Profil", "settings": "Parametres", "language": "Langue", "help": "Aide", "about": "A propos", "rate_app": "Noter l'application"},
    "voice": {"title": "Assistant vocal", "listening": "Ecoute en cours...", "tap_to_speak": "Appuyez pour parler", "say_something": "Dites \"reserver un taxi pour ...\""},
    "login": {"phone_title": "Entrez votre numéro de mobile", "mobile": "Mobile", "other_options": "Ou choisir une autre option de connexion", "terms_agree": "En continuant, j'accepte les", "terms_link": "Conditions Générales", "create_password": "Créer un mot de passe", "enter_password": "Entrez votre mot de passe", "create_password_hint": "Choisissez un mot de passe sécurisé pour votre compte", "login_with_number": "Connectez-vous avec le numéro {{number}}", "confirm_password": "Confirmer le mot de passe", "complete_profile": "Complétez votre profil", "complete_profile_hint": "Quelques informations pour personnaliser votre expérience", "lastname": "Nom", "firstname": "Prénom", "optional": "(facultatif)", "referral_code": "Code de parrainage", "create_account": "Créer mon compte", "choose_account": "Choisir un compte", "email_password": "Email & mot de passe"},
    "menu": {"wallet_balance": "Balance de portefeuille", "general_settings": "Réglages généraux", "buy_sell_rent": "Acheter, vendre et louer", "account_settings": "Paramètre du compte", "payment": "Paiement", "gift_card": "Carte cadeau", "favorite_places": "Lieux favoris", "support": "Soutien", "other": "Autre", "about_you": "À propos de vous", "carpool_only": "Requis uniquement pour le covoiturage", "my_bookings": "Mes réservations", "the_bookings": "Les réservations", "company_profile": "Profil de l'entreprise", "my_cart": "Mon panier", "notifications": "Les notifications", "news": "Actualités", "favorite_drivers": "Chauffeurs favoris", "invite_friends": "Inviter des amis", "invite": "Inviter", "emergency_contacts": "Contacts d'urgence", "make_donation": "Faire un don", "items_list": "Votre liste générale d'articles", "properties_list": "Votre liste de propriétés", "cars_list": "Votre liste de voitures", "enable_faceid": "Activer Face ID/Touch ID", "manage_account": "Gérer son compte", "manage_documents": "Gérer les documents", "change_password": "Changer le mot de passe", "change_currency": "Changer de devise", "change_language": "Changer de langue", "payment_method": "Mode de paiement", "my_wallet": "Mon portefeuille", "add_money": "Ajouter de l'argent", "send_money": "Envoyer de l'argent", "send_gift": "Envoyer une carte-cadeau", "redeem_gift": "Échanger une carte-cadeau", "add_home": "Ajouter une maison", "add_work": "Ajouter du travail", "about_us": "À propos de nous", "privacy": "Politique de confidentialité", "terms": "Termes et conditions", "faq": "FAQ", "live_chat": "Parler en direct", "contact_us": "Contactez-nous", "logout": "Se déconnecter", "topup": "Recharger"},
}

BASE_BUNDLE_EN = {
    "app_name": "SB Drive VTC",
    "common": {"loading": "Loading...", "error": "An error occurred", "retry": "Retry", "save": "Save", "cancel": "Cancel", "confirm": "Confirm", "continue": "Continue", "back": "Back", "close": "Close", "next": "Next", "skip": "Skip", "search": "Search", "yes": "Yes", "no": "No", "ok": "OK"},
    "auth": {"welcome": "Welcome", "subtitle": "Your all-in-one mobility super app", "login": "Sign in", "register": "Sign up", "logout": "Sign out", "email": "Email", "phone": "Phone", "password": "Password", "name": "Full name", "forgot_password": "Forgot password?", "no_account": "No account?", "have_account": "Have an account?", "continue_with_google": "Continue with Google", "continue_with_email": "Continue with email", "continue_with_phone": "Continue with phone", "phone_login_title": "Enter your phone", "phone_login_hint": "We'll send you a verification code", "otp_title": "Verification code", "otp_hint": "Enter the code sent to {{phone}}", "send_otp": "Send code", "verify_otp": "Verify", "select_role": "I am a...", "role_user": "Rider", "role_driver": "Driver", "role_merchant": "Merchant"},
    "tabs": {"home": "Home", "services": "Services", "orders": "My rides", "wallet": "Wallet", "profile": "Profile", "rides": "Rides", "earnings": "Earnings", "jobs": "Jobs", "dashboard": "Dashboard"},
    "user_home": {"hello": "Hi {{name}}", "where_to": "Where to?", "categories": "Categories", "promos": "Promotions", "recent": "Recent", "taxi": "Taxi", "moto": "Bike", "carpool": "Carpool", "food": "Food", "delivery": "Delivery", "runner": "Runner", "beauty": "Beauty", "pet": "Pet", "car_care": "Car care", "towing": "Towing", "marketplace": "Marketplace", "nearby": "Nearby", "on_demand": "Services"},
    "booking": {"title": "Book a taxi", "pickup": "Pickup", "dropoff": "Destination", "vehicle_type": "Vehicle type", "estimate": "Estimate", "book_now": "Book now", "confirm_pickup": "Confirm pickup", "confirm_dropoff": "Confirm dropoff", "fare_estimate": "Estimated fare", "distance": "Distance", "duration": "Duration", "no_drivers": "No drivers available", "searching_driver": "Searching for a driver..."},
    "driver": {"online": "Online", "offline": "Offline", "go_online": "Go online", "go_offline": "Go offline", "new_ride": "New ride", "accept": "Accept", "decline": "Decline", "navigate": "Navigate", "start_ride": "Start ride", "complete_ride": "Complete ride", "earnings_today": "Today's earnings", "earnings_week": "This week", "rides_today": "Today's rides", "rating": "Rating", "acceptance": "Acceptance", "cancellation": "Cancellation", "activity_score": "Activity score", "my_activity": "My activity", "priority": "Priority", "palette_beginner": "Beginner", "palette_standard": "Standard", "palette_confirmed": "Confirmed", "palette_expert": "Expert"},
    "merchant": {"dashboard": "Dashboard", "orders": "Orders", "products": "Products", "today_orders": "Today's orders", "today_revenue": "Today's revenue", "pending": "Pending", "preparing": "Preparing", "ready": "Ready", "delivered": "Delivered"},
    "wallet": {"title": "Wallet", "balance": "Balance", "topup": "Top up", "history": "History", "amount": "Amount"},
    "profile": {"title": "Profile", "settings": "Settings", "language": "Language", "help": "Help", "about": "About", "rate_app": "Rate the app"},
    "voice": {"title": "Voice assistant", "listening": "Listening...", "tap_to_speak": "Tap to speak", "say_something": "Say \"book a taxi to ...\""},
    "login": {"phone_title": "Enter your mobile number", "mobile": "Mobile", "other_options": "Or choose another sign-in option", "terms_agree": "By continuing, I accept the", "terms_link": "Terms & Conditions", "create_password": "Create a password", "enter_password": "Enter your password", "create_password_hint": "Choose a secure password for your account", "login_with_number": "Sign in with number {{number}}", "confirm_password": "Confirm password", "complete_profile": "Complete your profile", "complete_profile_hint": "A few details to personalize your experience", "lastname": "Last name", "firstname": "First name", "optional": "(optional)", "referral_code": "Referral code", "create_account": "Create my account", "choose_account": "Choose an account", "email_password": "Email & password"},
    "menu": {"wallet_balance": "Wallet balance", "general_settings": "General settings", "buy_sell_rent": "Buy, sell & rent", "account_settings": "Account settings", "payment": "Payment", "gift_card": "Gift card", "favorite_places": "Favorite places", "support": "Support", "other": "Other", "about_you": "About you", "carpool_only": "Required only for carpooling", "my_bookings": "My bookings", "the_bookings": "Bookings", "company_profile": "Company profile", "my_cart": "My cart", "notifications": "Notifications", "news": "News", "favorite_drivers": "Favorite drivers", "invite_friends": "Invite friends", "invite": "Invite", "emergency_contacts": "Emergency contacts", "make_donation": "Make a donation", "items_list": "Your general items list", "properties_list": "Your properties list", "cars_list": "Your cars list", "enable_faceid": "Enable Face ID/Touch ID", "manage_account": "Manage account", "manage_documents": "Manage documents", "change_password": "Change password", "change_currency": "Change currency", "change_language": "Change language", "payment_method": "Payment method", "my_wallet": "My wallet", "add_money": "Add money", "send_money": "Send money", "send_gift": "Send a gift card", "redeem_gift": "Redeem a gift card", "add_home": "Add home", "add_work": "Add work", "about_us": "About us", "privacy": "Privacy policy", "terms": "Terms & conditions", "faq": "FAQ", "live_chat": "Live chat", "contact_us": "Contact us", "logout": "Sign out", "topup": "Top up"},
}


# ------------------------------------------------------------------
# Helpers flatten / unflatten
# ------------------------------------------------------------------
def _flatten(d: dict, prefix: str = "") -> dict:
    out = {}
    for k, v in d.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(_flatten(v, key + "."))
        else:
            out[key] = v
    return out


def _unflatten(flat: dict) -> dict:
    root: dict = {}
    for k, v in flat.items():
        parts = k.split(".")
        node = root
        for p in parts[:-1]:
            node = node.setdefault(p, {})
        node[parts[-1]] = v
    return root


BASE_FLAT_FR = _flatten(BASE_BUNDLE_FR)
BASE_TOTAL = len(BASE_FLAT_FR)


# ------------------------------------------------------------------
# Seed (idempotent) : langues + bundles fr/en
# ------------------------------------------------------------------
async def seed_i18n():
    for lang in LANGUAGE_CATALOG:
        await db.i18n_languages.update_one(
            {"code": lang["code"]},
            {
                # champs d'affichage : toujours à jour
                "$set": {"name": lang["name"], "flag": lang["flag"], "is_rtl": lang["is_rtl"]},
                # état mutable : seulement à la création (ne pas écraser les choix admin)
                "$setOnInsert": {
                    "is_active": lang["code"] in DEFAULT_ACTIVE,
                    "is_default": lang["code"] == DEFAULT_LANG,
                },
            },
            upsert=True,
        )
    # Bundles fr/en (source de vérité) — réécrits à chaque boot
    for code, bundle in (("fr", BASE_BUNDLE_FR), ("en", BASE_BUNDLE_EN)):
        await db.i18n_app_bundles.update_one(
            {"lang": code},
            {"$set": {"lang": code, "bundle": bundle, "coverage": BASE_TOTAL,
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )


async def _get_bundle(lang: str) -> dict:
    if lang == "fr":
        return BASE_BUNDLE_FR
    if lang == "en":
        return BASE_BUNDLE_EN
    doc = await db.i18n_app_bundles.find_one({"lang": lang}, {"_id": 0, "bundle": 1})
    return (doc or {}).get("bundle") or {}


# ------------------------------------------------------------------
# Public (consommé par les apps)
# ------------------------------------------------------------------
@router.get("/languages")
async def list_languages():
    items = await db.i18n_languages.find({"is_active": True}, {"_id": 0}).to_list(100)
    # N'exposer que les langues prêtes : FR/EN (base) ou ayant un bundle traduit (coverage > 0).
    ready_codes = {"fr", "en"}
    async for b in db.i18n_app_bundles.find({"coverage": {"$gt": 0}}, {"_id": 0, "lang": 1}):
        ready_codes.add(b["lang"])
    items = [i for i in items if i["code"] in ready_codes]
    items.sort(key=lambda x: (not x.get("is_default"), x.get("name", "")))
    return {"items": items, "default": DEFAULT_LANG}


@router.get("/bundle/{lang}")
async def get_bundle(lang: str):
    bundle = await _get_bundle(lang)
    meta = await db.i18n_languages.find_one({"code": lang}, {"_id": 0, "is_rtl": 1})
    return {"lang": lang, "bundle": bundle, "is_rtl": bool((meta or {}).get("is_rtl"))}


# ------------------------------------------------------------------
# Admin
# ------------------------------------------------------------------
@router.get("/admin/overview")
async def admin_overview(current_user: dict = Depends(require_permission("server.settings.edit"))):
    langs = await db.i18n_languages.find({}, {"_id": 0}).to_list(200)
    bundles = {d["lang"]: d for d in await db.i18n_app_bundles.find({}, {"_id": 0, "lang": 1, "coverage": 1}).to_list(500)}
    out = []
    for lng in langs:
        code = lng["code"]
        if code in ("fr", "en"):
            coverage = BASE_TOTAL
        else:
            coverage = (bundles.get(code) or {}).get("coverage", 0)
        out.append({**lng, "coverage": coverage, "total": BASE_TOTAL})
    out.sort(key=lambda x: (not x.get("is_default"), x.get("name", "")))
    return {"items": out, "total": BASE_TOTAL}


class ActivateBody(BaseModel):
    is_active: bool


@router.post("/admin/languages/{code}/activate")
async def toggle_language(code: str, body: ActivateBody, current_user: dict = Depends(require_permission("server.settings.edit"))):
    res = await db.i18n_languages.update_one({"code": code}, {"$set": {"is_active": body.is_active}})
    if res.matched_count == 0:
        raise HTTPException(404, "Langue inconnue")
    return {"code": code, "is_active": body.is_active}


class AutoTranslateBody(BaseModel):
    target_lang: str
    overwrite: bool = False  # si False, ne traduit que les clés manquantes


async def _llm_translate(items: dict, target_name: str, target_code: str) -> dict:
    """Traduit {key: value} -> {key: traduction} via Claude (placeholders préservés)."""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(503, "Service de traduction indisponible (clé manquante)")
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    payload = _json.dumps(items, ensure_ascii=False)
    prompt = (
        f"Translate the VALUES of this JSON object from French into {target_name} "
        f"(ISO code: {target_code}), for a ride-hailing / delivery mobile app. "
        "Rules:\n"
        "- Keep each KEY EXACTLY as-is.\n"
        "- Preserve ALL placeholders verbatim, e.g. {{name}}, {{phone}}, {count} — do not translate or alter them.\n"
        "- Keep translations short and natural for UI buttons/labels.\n"
        "- Do NOT translate the brand name 'SB Drive VTC'.\n"
        "- Reply with ONLY a strict JSON object (same keys), no markdown, no commentary.\n\n"
        f"JSON:\n{payload}"
    )
    chat = LlmChat(
        api_key=api_key,
        session_id=f"i18n-{target_code}-{uuid.uuid4().hex[:8]}",
        system_message="You are a professional software localization engine. Output strict JSON only.",
    ).with_model("anthropic", "claude-sonnet-4-6")
    raw = (await chat.send_message(UserMessage(text=prompt))).strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1].replace("json", "", 1).strip()
    try:
        data = _json.loads(raw)
    except Exception as e:
        raise HTTPException(502, f"Réponse de traduction invalide: {e}")
    return {k: v for k, v in data.items() if k in items}


@router.post("/admin/auto-translate")
async def auto_translate(body: AutoTranslateBody, current_user: dict = Depends(require_permission("server.settings.edit"))):
    code = body.target_lang
    if code in ("fr", "en"):
        raise HTTPException(400, "Le bundle de base FR/EN ne se traduit pas.")
    lang = await db.i18n_languages.find_one({"code": code}, {"_id": 0})
    if not lang:
        raise HTTPException(404, "Langue inconnue")

    existing_flat = _flatten(await _get_bundle(code))
    if body.overwrite:
        todo = dict(BASE_FLAT_FR)
    else:
        todo = {k: v for k, v in BASE_FLAT_FR.items() if not existing_flat.get(k)}

    translated = dict(existing_flat)
    BATCH = 64
    keys = list(todo.keys())
    for i in range(0, len(keys), BATCH):
        chunk = {k: todo[k] for k in keys[i:i + BATCH]}
        if not chunk:
            continue
        result = await _llm_translate(chunk, lang["name"], code)
        translated.update(result)

    bundle = _unflatten(translated)
    coverage = sum(1 for k in BASE_FLAT_FR if translated.get(k))
    await db.i18n_app_bundles.update_one(
        {"lang": code},
        {"$set": {"lang": code, "bundle": bundle, "coverage": coverage,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    # active automatiquement la langue traduite
    await db.i18n_languages.update_one({"code": code}, {"$set": {"is_active": True}})
    return {"target_lang": code, "translated": len(todo), "coverage": coverage, "total": BASE_TOTAL}


class KeyOverride(BaseModel):
    lang: str
    key: str
    value: str


@router.get("/admin/bundle/{lang}")
async def admin_get_bundle_flat(lang: str, current_user: dict = Depends(require_permission("server.settings.edit"))):
    """Renvoie le bundle aplati + la base FR (pour repérer les manquants)."""
    flat = _flatten(await _get_bundle(lang))
    return {"lang": lang, "labels": flat, "base": BASE_FLAT_FR, "total": BASE_TOTAL}


@router.post("/admin/bundle-key")
async def set_bundle_key(body: KeyOverride, current_user: dict = Depends(require_permission("server.settings.edit"))):
    if body.lang in ("fr", "en"):
        raise HTTPException(400, "Le bundle de base FR/EN n'est pas éditable ici.")
    flat = _flatten(await _get_bundle(body.lang))
    flat[body.key] = body.value
    bundle = _unflatten(flat)
    coverage = sum(1 for k in BASE_FLAT_FR if flat.get(k))
    await db.i18n_app_bundles.update_one(
        {"lang": body.lang},
        {"$set": {"lang": body.lang, "bundle": bundle, "coverage": coverage,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"updated": True, "coverage": coverage}
