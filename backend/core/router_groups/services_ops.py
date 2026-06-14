"""Services & opérations (colis, chat, immobilier, pharmacie, KYC, zones, transport, support, payouts...).

Extrait de core/api_router.py (refacto). L'ordre est préservé."""

from routes.driver_pro import router as driver_pro_router
from routes.parcels import router as parcels_router
from routes.chat import router as chat_router
from routes.real_estate import router as real_estate_router
from routes.real_estate import admin_router as real_estate_admin_router
from routes.pharmacy import router as pharmacy_router
from routes.pharmacy import admin_router as pharmacy_admin_router
from routes.service_settings import router as service_settings_router
from routes.service_settings import admin_router as service_settings_admin_router
from routes.weekly_reports import router as weekly_reports_router
from routes.weekly_reports import driver_router as weekly_reports_driver_router
from routes.service_trends import router as service_trends_router
from routes.newsletter import router as newsletter_router
from routes.kyc import router as kyc_router
from routes.zones import router as zones_router
from routes.transport import router as transport_router
from routes.trip_share import router as trip_share_router
from routes.loyalty import router as loyalty_router
from routes.moderation import router as moderation_router
from routes.support import router as support_router
from routes.uploads import router as uploads_router
from routes.dispatch_admin import router as dispatch_admin_router
from routes.push_web import router as push_web_router
from routes.push_web import admin_router as push_admin_router
from routes.payouts import router as payouts_router
from routes.contactless import router as contactless_router
from routes.assistant import router as assistant_router
from routes.giftcards import router as giftcards_router
from routes.sbpaygo_connect import router as sbpaygo_connect_router
from routes.fleet import router as fleet_router

ROUTERS = [
    driver_pro_router,
    parcels_router,
    chat_router,
    real_estate_router,
    real_estate_admin_router,
    pharmacy_router,
    pharmacy_admin_router,
    service_settings_router,
    service_settings_admin_router,
    weekly_reports_router,
    weekly_reports_driver_router,
    service_trends_router,
    newsletter_router,
    kyc_router,
    zones_router,
    transport_router,
    trip_share_router,
    loyalty_router,
    moderation_router,
    support_router,
    uploads_router,
    dispatch_admin_router,
    push_web_router,
    push_admin_router,
    payouts_router,
    contactless_router,
    assistant_router,
    giftcards_router,
    sbpaygo_connect_router,
    fleet_router,
]
