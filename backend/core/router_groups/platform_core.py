"""Plateforme & configuration (admin, phases, finance, dispatch, geo, CMS, pricing, taxi configs...).

Extrait de core/api_router.py (refacto). L'ordre est préservé."""

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
from routes.debts import router as debts_router
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
from routes.service_categories import router as service_categories_router
from routes.service_categories import admin_router as service_categories_admin_router
from routes.store_categories import router as store_categories_router
from routes.store_categories import admin_router as store_categories_admin_router
from routes.news import router as news_router
from routes.pricing import router as pricing_router
from routes.pricing import public_router as pricing_public_router
from routes.taxi_configs import router as taxi_configs_router
from routes.taxi_configs import public_router as taxi_configs_public_router
from routes.taxi_extra import admin_router as taxi_extra_admin_router
from routes.reservation_config import router as reservation_rules_router
from routes.reservation_config import public_router as reservation_rules_public_router
from routes.taxi_extra import public_router as taxi_extra_public_router

ROUTERS = [
    gojek_services_router,
    cart_router,
    admin_router,
    phase1_router,
    phase2_router,
    finance_router,
    auto_dispatch_router,
    kiosk_router,
    acl_router,
    subscriptions_router,
    geo_router,
    debts_router,
    audit_logs_router,
    driver_shifts_router,
    organizations_router,
    i18n_router,
    voice_router,
    corporate_router,
    home_categories_router,
    promo_banners_router,
    places_router,
    search_router,
    service_categories_router,
    service_categories_admin_router,
    store_categories_router,
    store_categories_admin_router,
    news_router,
    pricing_router,
    pricing_public_router,
    taxi_configs_router,
    taxi_configs_public_router,
    taxi_extra_admin_router,
    reservation_rules_router,
    reservation_rules_public_router,
    taxi_extra_public_router,
]
