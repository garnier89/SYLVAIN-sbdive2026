"""
Central API router registration.

Feature routers are grouped by domain in core/router_groups/* and concatenated
here in a FIXED order, then mounted under /api. Keep server.py focused on app
wiring only.

⚠️ Do NOT reorder the concatenation: FastAPI matches routes in registration
order, so the sequence below is behaviour-significant.
"""
from fastapi import APIRouter

from core.router_groups.identity_rides import ROUTERS as _identity_rides
from core.router_groups.commerce_payments import ROUTERS as _commerce_payments
from core.router_groups.platform_core import ROUTERS as _platform_core
from core.router_groups.services_ops import ROUTERS as _services_ops
from core.router_groups.student import ROUTERS as _student
from core.router_groups.travel_booking import ROUTERS as _travel_booking

_ROUTERS = [
    *_identity_rides,
    *_commerce_payments,
    *_platform_core,
    *_services_ops,
    *_student,
    *_travel_booking,
]


def register_routers(api_router: APIRouter) -> None:
    for r in _ROUTERS:
        api_router.include_router(r)
