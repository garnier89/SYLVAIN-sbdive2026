"""Pool (shared ride) pricing & policy configuration — extracted from
``routes.rides`` to slim that module down and group cohesive pool logic.

Two readers:
- ``get_pool_config(vtype_doc)``      → per-Vehicle-Type pricing (V3Cube parity).
- ``get_pool_global_config()``        → global cross-cutting Pool policy.

V3Cube pool pricing model:
  1st seat = full fare F (no discount). Each additional seat = Pool Percentage % of F.
  total(n) = F * (1 + (n-1) * pool_percentage/100). e.g. P=90 → 2 seats = F*1.9.
  Capacity ("Available Seats", excl. driver) caps the seats a booking may request.
"""
from core.config import db

POOL_DEFAULT_PERCENTAGE = 90.0
POOL_DEFAULT_SEATS = 4
# A single passenger can only reserve a few seats in a SHARED pool so the vehicle
# keeps room for other pool riders. Admin-overridable per Vehicle Type / pool config.
POOL_DEFAULT_MAX_SEATS_PER_BOOKING = 2
# Pool = SHARED ride → the rider accepts detours/other passengers in exchange for a
# genuinely cheaper fare. This % is taken off the standard private fare for the 1st
# seat (each extra seat the same booking reserves is then billed via pool_percentage).
POOL_DEFAULT_DISCOUNT_PERCENT = 25.0

# Payment methods that may be allowed for Pool (shared) rides.
POOL_ALL_PAYMENTS = ["cash", "card", "wallet", "sbpaygo"]
POOL_DEFAULT_MAX_STOPS = 2


def pool_seat_multiplier(seats: int, pool_percentage: float) -> float:
    """Linear V3Cube pool multiplier: 1 + (n-1) * pool_percentage/100.
    seats=1 -> 1.0 ; seats=2 (P=90) -> 1.9 ; seats=3 -> 2.8 ; seats=4 -> 3.7."""
    n = max(1, int(seats or 1))
    return round(1 + (n - 1) * (pool_percentage / 100.0), 6)


def _pool_num(v, d):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


def _pool_bool(v, d):
    if isinstance(v, str):
        return v.strip().lower() in ("true", "1", "yes", "oui", "on")
    return bool(v) if v is not None else d


async def _db_pool_config():
    return await db.service_configs.find_one({"service_key": "pool"}, {"_id": 0})


async def get_pool_config(vtype_doc=None):
    """Pool config sourced **per Vehicle Type** (V3Cube parity).

    The Admin configures Enable Pool / Pool Percentage / Available Seats on each
    Vehicle Type. We read those fields from the selected vehicle_types document.
    Falls back to the legacy global service_configs 'pool' doc, then to defaults.
    """
    if vtype_doc and ("pool_percentage" in vtype_doc or "enable_pool" in vtype_doc):
        return {
            "enabled": _pool_bool(vtype_doc.get("enable_pool"), True),
            "pool_percentage": _pool_num(vtype_doc.get("pool_percentage", POOL_DEFAULT_PERCENTAGE), POOL_DEFAULT_PERCENTAGE),
            "available_seats": int(_pool_num(vtype_doc.get("person_capacity", POOL_DEFAULT_SEATS), POOL_DEFAULT_SEATS)),
            "max_seats_per_booking": int(_pool_num(vtype_doc.get("pool_max_seats_per_booking", POOL_DEFAULT_MAX_SEATS_PER_BOOKING), POOL_DEFAULT_MAX_SEATS_PER_BOOKING)),
            "discount_percent": _pool_num(vtype_doc.get("pool_discount_percent", POOL_DEFAULT_DISCOUNT_PERCENT), POOL_DEFAULT_DISCOUNT_PERCENT),
        }

    doc = await _db_pool_config()
    s = (doc or {}).get("settings", {}) or {}
    return {
        "enabled": _pool_bool(s.get("enable_pool", True), True),
        "pool_percentage": _pool_num(s.get("pool_percentage", POOL_DEFAULT_PERCENTAGE), POOL_DEFAULT_PERCENTAGE),
        "available_seats": int(_pool_num(s.get("available_seats", POOL_DEFAULT_SEATS), POOL_DEFAULT_SEATS)),
        "max_seats_per_booking": int(_pool_num(s.get("max_seats_per_booking", POOL_DEFAULT_MAX_SEATS_PER_BOOKING), POOL_DEFAULT_MAX_SEATS_PER_BOOKING)),
        "discount_percent": _pool_num(s.get("pool_discount_percent", POOL_DEFAULT_DISCOUNT_PERCENT), POOL_DEFAULT_DISCOUNT_PERCENT),
    }


async def get_pool_global_config():
    """GLOBAL Pool configuration (V3Cube « Configuration Pool »), stored in the
    service_configs 'pool' doc. Unlike `get_pool_config` (per Vehicle Type pricing),
    this exposes the admin's cross-cutting Pool policy consumed by the booking flow:
    eligible vehicle categories, allowed payment methods, capacity & max stops."""
    doc = await _db_pool_config()
    s = (doc or {}).get("settings", {}) or {}
    elig = s.get("eligible_vehicle_slugs")
    if not isinstance(elig, list):
        elig = []
    pms = s.get("payment_methods")
    if not isinstance(pms, list) or not pms:
        pms = list(POOL_ALL_PAYMENTS)
    discount = s.get("share_discount_percent", s.get("pool_discount_percent", POOL_DEFAULT_DISCOUNT_PERCENT))
    return {
        "enabled": _pool_bool(s.get("enable_pool", True), True),
        "pool_percentage": _pool_num(s.get("pool_percentage", POOL_DEFAULT_PERCENTAGE), POOL_DEFAULT_PERCENTAGE),
        "available_seats": int(_pool_num(s.get("available_seats", POOL_DEFAULT_SEATS), POOL_DEFAULT_SEATS)),
        "max_seats_per_booking": int(_pool_num(s.get("max_seats_per_booking", POOL_DEFAULT_MAX_SEATS_PER_BOOKING), POOL_DEFAULT_MAX_SEATS_PER_BOOKING)),
        "discount_percent": _pool_num(discount, POOL_DEFAULT_DISCOUNT_PERCENT),
        "max_stops": int(_pool_num(s.get("max_stops", POOL_DEFAULT_MAX_STOPS), POOL_DEFAULT_MAX_STOPS)),
        "eligible_vehicle_slugs": [str(x).strip().lower() for x in elig if x],
        "payment_methods": [str(x).strip().lower() for x in pms if x in POOL_ALL_PAYMENTS],
    }
