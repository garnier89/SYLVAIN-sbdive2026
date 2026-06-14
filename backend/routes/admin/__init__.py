"""Admin API package (split from the former 2107-line routes/admin.py).

Shared imports/constants/helpers + the `router` live in _common; the 65
endpoints are grouped by domain. Importing the domain modules registers
their @router routes onto the shared router."""
from routes.admin._common import router  # noqa: F401
from routes.admin import (  # noqa: F401
    vehicle_types, driver_categories, merchants, drivers, imports, onboarding, users, settings, rewards, analytics, monitoring,
)
# Re-exports consumed by other modules / tests (backwards-compatible).
from routes.admin._common import (  # noqa: F401
    get_rewards_config, _clean_driver_category, _rewards_zone_candidates,
    _merge_rewards_settings, _rewards_zone_key, DEFAULT_REWARDS_CONFIG,
)

__all__ = ["router", "get_rewards_config", "DEFAULT_REWARDS_CONFIG"]
