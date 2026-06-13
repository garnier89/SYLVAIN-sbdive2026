"""Commerce & paiements (orders, marketplace, panier, wallet, coupons, paiements, webhooks...).

Extrait de core/api_router.py (refacto). L'ordre est préservé."""

from routes.orders import router as orders_router
from routes.misc import router as misc_router
from routes.marketplace import router as marketplace_router
from routes.marketplace import stripe_webhook_router
from routes.carpool import router as carpool_router
from routes.services import router as services_router
from routes.config import router as config_router
from routes.wallet import router as wallet_router
from routes.coupons import router as coupons_router
from routes.auto_promotions import router as auto_promotions_router
from routes.vouchers import router as vouchers_router
from routes.referral import router as referral_router
from routes.payments import router as payments_router
from routes.webhooks import router as webhooks_router
from routes.features import router as features_router
from routes.simulation import router as simulation_router

ROUTERS = [
    orders_router,
    misc_router,
    marketplace_router,
    stripe_webhook_router,
    carpool_router,
    services_router,
    config_router,
    wallet_router,
    coupons_router,
    auto_promotions_router,
    vouchers_router,
    referral_router,
    payments_router,
    webhooks_router,
    features_router,
    simulation_router,
]
