"""SB Student Phase 3 — campus zones detection + campus discount + Campus Share (in-process)."""
import asyncio
import uuid

from core.config import db
import routes.student_zones as sz
import routes.student as st


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _seed_zone(lat=-12.345678, lng=45.678912, r=800):
    zid = f"cz_{uuid.uuid4().hex[:8]}"
    await db.campus_zones.insert_one({
        "id": zid, "name": "Test Campus", "type": "university", "lat": lat, "lng": lng,
        "radius_m": r, "country": "FR", "pickup_points": [], "safe_meeting_points": [], "enabled": True})
    return zid


def test_find_zone_inside_and_outside():
    async def scenario():
        zid = await _seed_zone()
        inside = await sz.find_campus_zone(-12.345700, 45.678900)   # ~few m away
        far = await sz.find_campus_zone(48.8566, 2.3522)        # Paris
        assert inside and inside["id"] == zid
        assert far is None
        await db.campus_zones.delete_one({"id": zid})
    _run(scenario())


def test_is_campus_trip_either_endpoint():
    async def scenario():
        zid = await _seed_zone()
        # dropoff inside campus, pickup far
        t1 = await sz.is_campus_trip(48.85, 2.35, -12.345700, 45.678900)
        # neither inside
        t2 = await sz.is_campus_trip(48.85, 2.35, 45.0, 1.0)
        assert t1 is True
        assert t2 is False
        await db.campus_zones.delete_one({"id": zid})
    _run(scenario())


def test_campus_discount_uses_campus_pct():
    async def scenario():
        uid = f"u_{uuid.uuid4().hex[:8]}"
        await db.student_profiles.insert_one({"user_id": uid, "status": "verified", "created_at": st._now()})
        await st.ensure_seeded()
        await db.student_config.update_one({"id": st.CONFIG_ID}, {"$set": {
            "enabled": True, "ride_discount_pct": 20.0, "campus_discount_pct": 25.0,
            "daily_cap": 0, "monthly_cap": 0}})
        res = await st.compute_student_discount(uid, 100.0, "campus")
        assert res["pct"] == 25.0 and res["amount"] == 25.0
        await db.student_config.update_one({"id": st.CONFIG_ID}, {"$set": {"daily_cap": 5.0, "monthly_cap": 50.0}})
        await db.student_profiles.delete_many({"user_id": uid})
    _run(scenario())


def test_campus_share_matching():
    async def scenario():
        zid = await _seed_zone()
        u1, u2 = f"u_{uuid.uuid4().hex[:6]}", f"u_{uuid.uuid4().hex[:6]}"
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        base = {"status": "open", "dest_lat": -12.345678, "dest_lng": 45.678912, "dest_zone_id": zid,
                "origin_lat": -12.36, "origin_lng": 45.69, "depart_at": now, "created_at": now}
        await db.campus_share_requests.insert_one({**base, "id": "csr_a", "user_id": u1, "user_name": "A", "origin_label": "Rés A"})
        await db.campus_share_requests.insert_one({**base, "id": "csr_b", "user_id": u2, "user_name": "B", "origin_label": "Rés B"})
        req = await db.campus_share_requests.find_one({"id": "csr_a"}, {"_id": 0})
        matches = await sz._share_matches(req)
        assert len(matches) == 1 and matches[0]["id"] == "csr_b"
        await db.campus_share_requests.delete_many({"user_id": {"$in": [u1, u2]}})
        await db.campus_zones.delete_one({"id": zid})
    _run(scenario())
