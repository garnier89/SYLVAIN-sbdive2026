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
from routes.rides_rating import router as rides_rating_router
from routes.rides_bidding import router as rides_bidding_router
from routes.rides_rental import router as rides_rental_router
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
from routes.reservation_config import router as reservation_rules_router, public_router as reservation_rules_public_router
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
from routes.uploads import router as uploads_router
from routes.dispatch_admin import router as dispatch_admin_router
from routes.push_web import router as push_web_router, admin_router as push_admin_router
from routes.payouts import router as payouts_router
from routes.contactless import router as contactless_router
from routes.giftcards import router as giftcards_router
from routes.assistant import router as assistant_router
from routes.sbpaygo_connect import router as sbpaygo_connect_router
from routes.student import router as student_router
from routes.student_campus import router as student_campus_router
from routes.student_zones import router as student_zones_router
from routes.student_safety import router as student_safety_router
from routes.student_rewards import router as student_rewards_router
from routes.student_events import router as student_events_router
from routes.student_marketplace import router as student_marketplace_router
from routes.demo_mode import router as demo_mode_router
from routes.student_digest import router as student_digest_router
from routes.sb_access import router as sb_access_router, admin_router as sb_access_admin_router
from routes.moto_rental import router as moto_rental_router, admin_router as moto_rental_admin_router
from routes.car_rental import router as car_rental_router, admin_router as car_rental_admin_router
from routes.hotels import router as hotels_router, admin_router as hotels_admin_router
from routes.flights import router as flights_router, admin_router as flights_admin_router
from routes.travel_packages import router as travel_packages_router, admin_router as travel_packages_admin_router
from routes.favorites import router as favorites_router
from routes.fraud import router as fraud_router
from routes.bookings_admin import router as bookings_admin_router
from routes.reports_admin import router as reports_admin_router
from routes.safety_audio import router as safety_audio_router, admin_router as safety_audio_admin_router
from routes.code_health import router as code_health_router
from routes.debts_admin import router as debts_admin_router
from routes.driver_activity_admin import router as driver_activity_admin_router
from routes.trip_timings_admin import router as trip_timings_admin_router
from routes.calls import router as calls_router
from routes.parking_admin import router as parking_admin_router
from routes.assist_types import public_router as assist_types_public_router, admin_router as assist_types_admin_router
from routes.home_banners import public_router as home_banners_public_router, admin_router as home_banners_admin_router
from routes.ferry import public_router as ferry_public_router, admin_router as ferry_admin_router

# Ordered list of every router mounted under /api
_ROUTERS = [
    auth_router, users_router, drivers_router, merchants_router, rides_router,
    rides_rating_router, rides_bidding_router, rides_rental_router,
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
    reservation_rules_router, reservation_rules_public_router,
    taxi_extra_public_router, driver_pro_router, parcels_router, chat_router, real_estate_router,
    real_estate_admin_router, pharmacy_router, pharmacy_admin_router, service_settings_router,
    service_settings_admin_router, weekly_reports_router, weekly_reports_driver_router,
    service_trends_router, newsletter_router, kyc_router, zones_router,
    transport_router, trip_share_router, loyalty_router, moderation_router, support_router, uploads_router,
    dispatch_admin_router,
    push_web_router, push_admin_router,
    payouts_router,
    contactless_router,
    assistant_router,
    giftcards_router,
    sbpaygo_connect_router,
    student_router,
    student_campus_router,
    student_zones_router,
    student_safety_router,
    student_rewards_router,
    student_events_router,
    student_marketplace_router,
    demo_mode_router,
    student_digest_router,
    sb_access_router,
    sb_access_admin_router,
    moto_rental_router,
    moto_rental_admin_router,
    car_rental_router,
    car_rental_admin_router,
    hotels_router,
    hotels_admin_router,
    flights_router,
    flights_admin_router,
    travel_packages_router,
    travel_packages_admin_router,
    favorites_router,
    fraud_router,
    bookings_admin_router,
    reports_admin_router,
    safety_audio_router,
    safety_audio_admin_router,
    code_health_router,
    debts_admin_router,
    driver_activity_admin_router,
    trip_timings_admin_router,
    calls_router,
    parking_admin_router,
    assist_types_public_router,
    assist_types_admin_router,
    home_banners_public_router,
    home_banners_admin_router,
    ferry_public_router,
    ferry_admin_router,
]


def register_routers(api_router: APIRouter) -> None:
    for r in _ROUTERS:
        api_router.include_router(r)
