"""Marketplace & vie étudiante.

Extrait de core/api_router.py (refacto). L'ordre est préservé."""

from routes.student import router as student_router
from routes.student_campus import router as student_campus_router
from routes.student_zones import router as student_zones_router
from routes.student_safety import router as student_safety_router
from routes.student_rewards import router as student_rewards_router
from routes.student_events import router as student_events_router
from routes.student_marketplace import router as student_marketplace_router
from routes.demo_mode import router as demo_mode_router
from routes.student_digest import router as student_digest_router

ROUTERS = [
    student_router,
    student_campus_router,
    student_zones_router,
    student_safety_router,
    student_rewards_router,
    student_events_router,
    student_marketplace_router,
    demo_mode_router,
    student_digest_router,
]
