"""Admin-tunable notification settings (proximity, ride chaining, message copy).

Extracted into ``core`` so that both ``routes.push_web`` (HTTP layer) and the
``core`` background helpers (``availability``, ``proximity``) can read these
settings without importing each other — this removes the previous
``core.availability`` ↔ ``routes.push_web`` circular dependency.
"""
from core.config import db

# Admin-tunable notification behaviour (proximity, ride chaining, message copy).
DEFAULT_NOTIF_SETTINGS = {
    "arrival_distance_m": 200,        # driver "is here" radius
    "chaining_enabled": True,         # allow a 2nd ride while finishing one
    "chaining_time_min": 5,           # offer chained ride within N min of completion
    "chaining_distance_km": 3,        # ...and within N km of the dropoff
    "auto_demand_alerts": True,       # background agent auto-notifies offline drivers
    "demand_cooldown_min": 30,        # min minutes between auto-pushes per zone
    "demand_min_waiting": 1,          # min waiting clients in a zone to trigger
    "messages": {
        "new_ride": "Nouvelle course disponible",
        "scheduled_reservation": "Nouvelle réservation planifiée",
        "ride_accepted": "Votre course a été acceptée",
        "driver_nearby": "Votre chauffeur arrive (à moins de {distance} m)",
        "driver_arrived": "Votre chauffeur est là",
        "ride_started": "Votre course a commencé",
        "ride_completed": "Course terminée — merci !",
        "driver_back_online": "Vous êtes de nouveau en ligne",
        "new_message": "Nouveau message",
    },
}


async def get_notif_settings() -> dict:
    """Merge persisted admin settings over the safe defaults."""
    doc = await db.app_settings.find_one({"key": "notifications"}, {"_id": 0})
    s = (doc or {}).get("value") or {}
    merged = {**DEFAULT_NOTIF_SETTINGS, **s}
    merged["messages"] = {**DEFAULT_NOTIF_SETTINGS["messages"], **(s.get("messages") or {})}
    return merged
