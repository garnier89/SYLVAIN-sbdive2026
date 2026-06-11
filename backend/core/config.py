from dotenv import load_dotenv
load_dotenv()

import os
import logging
import secrets
from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
REFRESH_TOKEN_EXPIRE_DAYS = 7

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "superapp"
storage_key = None

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")

# Web Push (VAPID) — used by core.webpush to deliver background notifications.
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:admin@sbdrive.com")



# ---- Global Demo Mode flag (admin-toggleable). Stripe payments stay LIVE. ----
DEMO_CONFIG_ID = "demo_mode"


async def is_demo_mode() -> bool:
    """True when the global Demo Mode is enabled (relaxes student verification,
    enables non-charged wallet credit, shows the MODE DÉMO banner). Never raises."""
    try:
        doc = await db.app_config.find_one({"id": DEMO_CONFIG_ID}, {"_id": 0, "enabled": 1})
        return bool(doc and doc.get("enabled"))
    except Exception:
        return False


async def get_demo_config() -> dict:
    doc = await db.app_config.find_one({"id": DEMO_CONFIG_ID}, {"_id": 0})
    if not doc:
        doc = {"id": DEMO_CONFIG_ID, "enabled": False, "wallet_credit": 100.0}
        await db.app_config.insert_one(dict(doc))
        doc.pop("_id", None)
    return {"id": DEMO_CONFIG_ID, "enabled": False, "wallet_credit": 100.0, **doc}
