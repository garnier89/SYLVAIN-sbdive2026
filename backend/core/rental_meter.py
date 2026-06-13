"""Rental (mise à disposition) live-meter helper extracted from routes/rides.py
(refactor Phase 2). Pure function: no DB access, stdlib datetime only.
"""
from datetime import datetime, timezone


def _compute_rental_meter(ride: dict, now=None, actual_km=None) -> dict:
    """Compute the live rental meter: elapsed time, included vs overage (time + km)."""
    now = now or datetime.now(timezone.utc)
    started = ride.get("rental_started_at")
    hours_inc = float(ride.get("rental_hours_included") or 0)
    km_inc = float(ride.get("rental_km_included") or 0)
    hr_rate = float(ride.get("rental_extra_hour_rate") or 0)
    km_rate = float(ride.get("rental_extra_km_rate") or 0)
    pkg_price = float(ride.get("rental_package_price") or ride.get("estimated_fare") or 0)
    elapsed_min = 0.0
    if started:
        try:
            s = datetime.fromisoformat(str(started).replace("Z", "+00:00"))
            if s.tzinfo is None:
                s = s.replace(tzinfo=timezone.utc)
            elapsed_min = max(0.0, (now - s).total_seconds() / 60)
        except (ValueError, TypeError):
            pass
    elapsed_h = elapsed_min / 60
    overage_h = max(0.0, elapsed_h - hours_inc)
    km = actual_km if actual_km is not None else (ride.get("rental_actual_km") or 0)
    overage_km = max(0.0, float(km or 0) - km_inc)
    overage_fee = round(overage_h * hr_rate + overage_km * km_rate, 2)
    return {
        "started_at": started,
        "elapsed_minutes": round(elapsed_min, 1),
        "hours_included": hours_inc,
        "km_included": km_inc,
        "extra_hour_rate": hr_rate,
        "extra_km_rate": km_rate,
        "package_price": pkg_price,
        "overage_hours": round(overage_h, 2),
        "overage_km": round(overage_km, 2),
        "overage_fee": overage_fee,
        "projected_total": round(pkg_price + overage_fee, 2),
        "gps_km": round(float(ride.get("rental_gps_km") or 0), 2),
        "stops": ride.get("stops") or [],
        "ended": bool(ride.get("rental_ended_at")),
    }
