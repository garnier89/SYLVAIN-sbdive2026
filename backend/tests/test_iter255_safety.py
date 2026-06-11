"""SB Student Phase 4 — Safe Ride Night driver prioritisation (in-process)."""
import asyncio
import uuid

from core.config import db
import routes.auto_dispatch as ad


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _seed_driver(rating, lat, lng):
    uid = f"u_{uuid.uuid4().hex[:8]}"
    did = f"d_{uuid.uuid4().hex[:8]}"
    await db.drivers.insert_one({
        "id": did, "user_id": uid, "status": "approved", "is_online": True,
        "points": 0, "current_lat": lat, "current_lng": lng, "rating": rating, "vehicle_type": "moto",
    })
    return uid


def test_safe_ride_prioritises_top_rated():
    async def scenario():
        # Two drivers near the same pickup, different ratings.
        # Lower-rated is slightly closer; rating priority must override distance.
        plat, plng = -20.111111, 55.222222
        u_low = await _seed_driver(4.1, plat + 0.001, plng)      # ~111 m
        u_high = await _seed_driver(4.9, plat + 0.005, plng)     # ~555 m
        try:
            by_rating = await ad._drivers_in_radius(plat, plng, 5.0, ["Standard"], {}, prioritize_rating=True)
            mine = [m for m in by_rating if m["user_id"] in (u_low, u_high)]
            assert mine[0]["user_id"] == u_high  # best-rated first
            by_dist = await ad._drivers_in_radius(plat, plng, 5.0, ["Standard"], {}, prioritize_rating=False)
            mine2 = [m for m in by_dist if m["user_id"] in (u_low, u_high)]
            assert mine2[0]["user_id"] == u_low  # nearest first
        finally:
            await db.drivers.delete_many({"user_id": {"$in": [u_low, u_high]}})
    _run(scenario())


def test_haversine_sanity():
    # ~111 km per degree of latitude
    km = ad._haversine_km(0.0, 0.0, 1.0, 0.0)
    assert 110 < km < 112
