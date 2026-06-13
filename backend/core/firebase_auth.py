"""Vérification du téléphone via Firebase Phone Auth — feature-flaggée.

Le frontend réalise le flux Firebase (reCAPTCHA + signInWithPhoneNumber) et obtient
un ID token signé par Firebase. Le backend vérifie ce token avec le Firebase Admin SDK
pour confirmer le numéro de téléphone avant de marquer le compte comme vérifié.

Activation automatique dès que des identifiants Admin sont fournis via l'une des
variables d'environnement suivantes (par ordre de priorité) :
- FIREBASE_SERVICE_ACCOUNT_JSON : contenu JSON brut de la clé de compte de service
- FIREBASE_SERVICE_ACCOUNT_PATH : chemin vers le fichier JSON de la clé
- fichier par défaut /app/backend/secrets/firebase-admin.json

Si aucun identifiant n'est disponible, `firebase_enabled()` renvoie False et les
endpoints renvoient une erreur claire « non configuré » sans casser l'application.
"""
import os
import json
import threading

from core.config import logger

_DEFAULT_PATH = "/app/backend/secrets/firebase-admin.json"

_app = None
_init_lock = threading.Lock()
_init_failed = False


def _load_credentials():
    """Renvoie un objet credentials firebase_admin ou None si indisponible."""
    from firebase_admin import credentials

    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if raw:
        try:
            return credentials.Certificate(json.loads(raw))
        except Exception as e:
            logger.error("FIREBASE_SERVICE_ACCOUNT_JSON invalide: %s", e)
            return None

    path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH", "").strip() or _DEFAULT_PATH
    if os.path.isfile(path):
        try:
            return credentials.Certificate(path)
        except Exception as e:
            logger.error("Fichier service account Firebase invalide (%s): %s", path, e)
            return None
    return None


def _ensure_app():
    """Initialise (une seule fois) l'app Firebase Admin. Renvoie l'app ou None."""
    global _app, _init_failed
    if _app is not None:
        return _app
    if _init_failed:
        return None
    with _init_lock:
        if _app is not None:
            return _app
        try:
            import firebase_admin
            cred = _load_credentials()
            if cred is None:
                _init_failed = True
                return None
            # Évite l'erreur "default app already exists" en cas de double import.
            if firebase_admin._apps:
                _app = firebase_admin.get_app()
            else:
                _app = firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin SDK initialisé")
            return _app
        except Exception as e:
            logger.error("Échec init Firebase Admin: %s", e)
            _init_failed = True
            return None


def firebase_enabled() -> bool:
    """True si le backend peut vérifier des tokens Firebase."""
    return _ensure_app() is not None


def verify_id_token(id_token: str) -> dict:
    """Vérifie un ID token Firebase et renvoie le payload décodé.

    Lève ValueError si le service est désactivé ou le token invalide.
    """
    app = _ensure_app()
    if app is None:
        raise ValueError("firebase_disabled")
    from firebase_admin import auth as fb_auth
    try:
        decoded = fb_auth.verify_id_token(id_token, app=app)
    except Exception as e:
        logger.warning("Vérification token Firebase échouée: %s", e)
        raise ValueError("invalid_token")
    return decoded


def extract_phone(decoded: dict) -> str:
    """Extrait le numéro E.164 vérifié du payload Firebase (ou '' si absent)."""
    return (decoded.get("phone_number") or "").strip()
