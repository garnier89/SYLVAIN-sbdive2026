"""Identité & courses (auth, users, drivers, merchants, rides + sous-routeurs).

Extrait de core/api_router.py (refacto). L'ordre est préservé."""

from routes.auth import router as auth_router
from routes.auth import users_router
from routes.drivers import router as drivers_router
from routes.merchants import router as merchants_router
from routes.rides import router as rides_router
from routes.rides_rating import router as rides_rating_router
from routes.rides_bidding import router as rides_bidding_router
from routes.rides_rental import router as rides_rental_router
from routes.rides_driver_feed import router as rides_driver_feed_router
from routes.rides_taxi_hall import router as rides_taxi_hall_router
from routes.rides_scheduled import router as rides_scheduled_router

ROUTERS = [
    auth_router,
    users_router,
    drivers_router,
    merchants_router,
    rides_router,
    rides_rating_router,
    rides_bidding_router,
    rides_rental_router,
    rides_driver_feed_router,
    rides_taxi_hall_router,
    rides_scheduled_router,
]
