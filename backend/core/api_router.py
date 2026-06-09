"""
Central API router registration.

All feature routers are imported and mounted here, keeping server.py focused
on app wiring only.
"""
from fastapi import APIRouter

from routes.auth import router as auth_router, users_router
from routes.drivers import router as drivers_router
from routes.driver_pro import router as driver_pro_router
from routes.merchants import router as merchants_router
from routes.rides import router as rides_router
from routes.orders import router as orders_router
from routes.misc import router as misc_router
from routes.marketplace import router as marketplace_router, stripe_webhook_router
from routes.carpool import router as carpool_router
from routes.services import router as services_router
from routes.config import router as config_router
from routes.wallet import router as wallet_router
from routes.debts import router as debts_router
from routes.coupons import router as coupons_router
from routes.auto_promotions import router as auto_promotions_router
from routes.vouchers import router as vouchers_router
from routes.referral import router as referral_router
from routes.payments import router as payments_router
from routes.webhooks import router as webhooks_router
from routes.features import router as features_router
from routes.simulation import router as simulation_router
from routes.gojek_services import router as gojek_services_router
from routes.cart import router as cart_router
from routes.admin import router as admin_router
from routes.phase1 import router as phase1_router
from routes.phase2 import router as phase2_router
from routes.finance import router as finance_router
from routes.auto_dispatch import router as auto_dispatch_router
from routes.kiosk import router as kiosk_router
from routes.acl import router as acl_router
from routes.subscriptions import router as subscriptions_router
from routes.geo import router as geo_router
from routes.audit_logs import router as audit_logs_router
from routes.driver_shifts import router as driver_shifts_router
from routes.organizations import router as organizations_router
from routes.i18n import router as i18n_router
from routes.voice import router as voice_router
from routes.corporate import router as corporate_router
from routes.home_categories import router as home_categories_router
from routes.promo_banners import router as promo_banners_router
from routes.places import router as places_router
from routes.search import router as search_router
from routes.service_categories import router as service_categories_router, admin_router as service_categories_admin_router
from routes.store_categories import router as store_categories_router, admin_router as store_categories_admin_router
from routes.news import router as news_router
from routes.pricing import router as pricing_router, public_router as pricing_public_router
from routes.taxi_configs import router as taxi_configs_router, public_router as taxi_configs_public_router
from routes.taxi_extra import admin_router as taxi_extra_admin_router, public_router as taxi_extra_public_router
from routes.parcels import router as parcels_router
from routes.chat import router as chat_router
from routes.real_estate import router as real_estate_router, admin_router as real_estate_admin_router
from routes.pharmacy import router as pharmacy_router, admin_router as pharmacy_admin_router
from routes.service_settings import router as service_settings_router, admin_router as service_settings_admin_router
from routes.weekly_reports import router as weekly_reports_router, driver_router as weekly_reports_driver_router
from routes.service_trends import router as service_trends_router
from routes.newsletter import router as newsletter_router
from routes.kyc import router as kyc_router
from routes.zones import router as zones_router
from routes.transport import router as transport_router
from routes.trip_share import router as trip_share_router
from routes.loyalty import router as loyalty_router
from routes.moderation import router as moderation_router
from routes.support import router as support_router

# Ordered list of every router mounted under /api
_ROUTERS = [
    auth_router, users_router, drivers_router, merchants_router, rides_router,
    orders_router, misc_router, marketplace_router, stripe_webhook_router, carpool_router, services_router,
    config_router, wallet_router, coupons_router, auto_promotions_router, vouchers_router,
    referral_router, payments_router, webhooks_router, features_router, simulation_router,
    gojek_services_router, cart_router, admin_router, phase1_router, phase2_router,
    finance_router, auto_dispatch_router, kiosk_router, acl_router, subscriptions_router,
    geo_router, debts_router, audit_logs_router, driver_shifts_router, organizations_router,
    i18n_router, voice_router, corporate_router, home_categories_router, promo_banners_router,
    places_router, search_router, service_categories_router, service_categories_admin_router,
    store_categories_router, store_categories_admin_router, news_router, pricing_router,
    pricing_public_router, taxi_configs_router, taxi_configs_public_router, taxi_extra_admin_router,
    taxi_extra_public_router, driver_pro_router, parcels_router, chat_router, real_estate_router,
    real_estate_admin_router, pharmacy_router, pharmacy_admin_router, service_settings_router,
    service_settings_admin_router, weekly_reports_router, weekly_reports_driver_router,
    service_trends_router, newsletter_router, kyc_router, zones_router,
    transport_router, trip_share_router, loyalty_router, moderation_router, support_router,
]


def register_routers(api_router: APIRouter) -> None:
    for r in _ROUTERS:
        api_router.include_router(r)
