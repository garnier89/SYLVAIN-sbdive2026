"""Réservations voyage & admin (locations, hôtels, vols, ferry, favoris, audits, à proximité...).

Extrait de core/api_router.py (refacto). L'ordre est préservé."""

from routes.sb_access import router as sb_access_router
from routes.sb_access import admin_router as sb_access_admin_router
from routes.market.moto_rental import router as moto_rental_router
from routes.market.moto_rental import admin_router as moto_rental_admin_router
from routes.market.car_rental import router as car_rental_router
from routes.market.car_rental import admin_router as car_rental_admin_router
from routes.hotels import router as hotels_router
from routes.hotels import admin_router as hotels_admin_router
from routes.flights import router as flights_router
from routes.flights import admin_router as flights_admin_router
from routes.travel_packages import router as travel_packages_router
from routes.travel_packages import admin_router as travel_packages_admin_router
from routes.favorites import router as favorites_router
from routes.fraud import router as fraud_router
from routes.bookings_admin import router as bookings_admin_router
from routes.reports_admin import router as reports_admin_router
from routes.safety_audio import router as safety_audio_router
from routes.safety_audio import admin_router as safety_audio_admin_router
from routes.code_health import router as code_health_router
from routes.debts_admin import router as debts_admin_router
from routes.driver_activity_admin import router as driver_activity_admin_router
from routes.trip_timings_admin import router as trip_timings_admin_router
from routes.calls import router as calls_router
from routes.parking_admin import router as parking_admin_router
from routes.assist_types import public_router as assist_types_public_router
from routes.assist_types import admin_router as assist_types_admin_router
from routes.home_banners import public_router as home_banners_public_router
from routes.home_banners import admin_router as home_banners_admin_router
from routes.ferry import public_router as ferry_public_router
from routes.ferry import admin_router as ferry_admin_router
from routes.nearby_places import router as nearby_places_router
from routes.itineraries import router as itineraries_router
from routes.events import public_router as events_public_router
from routes.events import admin_router as events_admin_router
from routes.organizer import router as organizer_router

ROUTERS = [
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
    nearby_places_router,
    itineraries_router,
    events_public_router,
    events_admin_router,
    organizer_router,
]
