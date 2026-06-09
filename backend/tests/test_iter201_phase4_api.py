"""Iter 201 — Phase 4 dispatch API-level e2e tests.

Validates the live HTTP behaviour built on top of the unit tests in
test_iter201_phase4_scheduled_dispatch.py:

  - ATOMIC ACCEPT LOCK: two concurrent /accept calls -> 1 winner, 1 loser
    (404 or 409 — never both 200)
  - DRIVER RELEASE: accept + driver-cancel-booking -> ride back to pending
  - SCHEDULED RIDE separation: excluded from available_rides feed, present
    in scheduled_pending; status stays pending shortly after creation
  - ATOMIC scheduled-ride claim
  - REGRESSION happy path: create -> accept -> status updates
  - ADMIN auto-dispatch config exposes/updates scheduled_lead_minutes
"""
import os
import re
import time
import threading
from datetime import datetime, timezone, timedelta

import pytest
import requests


def _read_backend_url():
    # Prefer shell env, then frontend/.env, fallback to localhost
    env = os.environ.get("REACT_APP_BACKEND_URL")
    if env:
        return env.rstrip("/")
    try:
        with open("/app/frontend/.env", "r", encoding="utf-8") as f:
            for line in f:
                m = re.match(r"\s*REACT_APP_BACKEND_URL\s*=\s*(.+?)\s*$", line)
                if m:
                    return m.group(1).strip().strip('"').rstrip("/")
    except FileNotFoundError:
        pass
    return "http://localhost:8001"


BASE_URL = _read_backend_url()
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}
PASSENGER = {"email": "test2@example.com", "password": "TestPass123!"}
DRIVER_1 = {"email": "jean.dupont@demo.sb", "password": "Driver123!"}
DRIVER_2 = {"email": "amadou.diallo@demo.sb", "password": "Driver123!"}

# Paris pickup/dropoff (default Demo zone) -- standard vehicle
PICKUP = {"pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Châtelet, Paris"}
DROPOFF = {"dropoff_lat": 48.8738, "dropoff_lng": 2.2950, "dropoff_address": "Arc de Triomphe, Paris"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    # Cookies are Secure+SameSite=none — they only flow over HTTPS. For
    # robustness (mixed local/https), also attach Bearer token from the body.
    token = r.json().get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def _ensure_driver_online_approved(sess):
    """Toggle online if needed. Returns the driver dict from /api/drivers/profile."""
    me = sess.get(f"{API}/drivers/profile", timeout=10)
    assert me.status_code == 200, f"/drivers/profile failed: {me.status_code} {me.text}"
    d = me.json()
    if not d.get("is_online"):
        t = sess.post(f"{API}/drivers/toggle-online", timeout=10)
        assert t.status_code == 200, t.text
    # Push location near pickup to make sure dispatcher would broadcast.
    sess.post(f"{API}/drivers/location",
              json={"lat": PICKUP["pickup_lat"], "lng": PICKUP["pickup_lng"]}, timeout=10)
    return d


def _create_ride(pax_session, *, scheduled_at=None, payment_method="cash"):
    body = {
        **PICKUP, **DROPOFF,
        "vehicle_type": "standard",
        "payment_method": payment_method,
    }
    if scheduled_at:
        body["scheduled_at"] = scheduled_at
    r = pax_session.post(f"{API}/rides", json=body, timeout=15)
    assert r.status_code == 200, f"create_ride failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def admin_sess():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def passenger_sess():
    return _login(PASSENGER)


@pytest.fixture(scope="module", autouse=True)
def _reset_passenger_ban():
    """Clear any moderation ban on the test passenger between runs.

    Repeated cleanups (POST /rides/{id}/cancel) accumulate cancel events and
    eventually trigger the 'Réservations suspendues' 403. We reset the
    moderation_state for the test passenger before *and* after the suite so
    tests are deterministic across reruns.
    """
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient

    async def _wipe():
        # Load backend env so we hit the right Mongo instance
        try:
            from dotenv import dotenv_values
            env = dotenv_values("/app/backend/.env")
        except Exception:
            env = {}
        mongo_url = os.environ.get("MONGO_URL") or env.get("MONGO_URL") or "mongodb://localhost:27017"
        db_name = os.environ.get("DB_NAME") or env.get("DB_NAME") or "test_database"
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        user = await db.users.find_one({"email": PASSENGER["email"]}, {"_id": 0, "id": 1})
        if user:
            await db.moderation_state.delete_many({"user_id": user["id"]})
        client.close()

    asyncio.run(_wipe())
    yield
    asyncio.run(_wipe())


@pytest.fixture(scope="module")
def driver1_sess():
    s = _login(DRIVER_1)
    _ensure_driver_online_approved(s)
    return s


@pytest.fixture(scope="module")
def driver2_sess():
    s = _login(DRIVER_2)
    _ensure_driver_online_approved(s)
    return s


# ============================================================
# 1. ATOMIC ACCEPT LOCK — concurrent /accept from two drivers
# ============================================================
def test_concurrent_accept_only_one_wins(passenger_sess, driver1_sess, driver2_sess):
    ride = _create_ride(passenger_sess)
    rid = ride["id"]
    assert ride["status"] == "pending"

    results = {}

    def _accept(label, sess):
        try:
            r = sess.post(f"{API}/rides/{rid}/accept", timeout=15)
            results[label] = (r.status_code, r.text[:200])
        except Exception as e:
            results[label] = ("EXC", str(e))

    t1 = threading.Thread(target=_accept, args=("d1", driver1_sess))
    t2 = threading.Thread(target=_accept, args=("d2", driver2_sess))
    t1.start(); t2.start(); t1.join(); t2.join()

    codes = sorted([results["d1"][0], results["d2"][0]])
    # Acceptable outcomes: (200, 404) or (200, 409). NEVER (200, 200).
    assert codes.count(200) == 1, f"Expected exactly one winner, got {results}"
    loser = next(c for c in codes if c != 200)
    assert loser in (404, 409), f"Loser code must be 404 or 409, got {loser} ({results})"

    # Confirm ride is now accepted with a single driver
    g = passenger_sess.get(f"{API}/rides/{rid}", timeout=10)
    assert g.status_code == 200
    body = g.json()
    assert body["status"] == "accepted"
    assert body["driver_id"]

    # Cleanup: cancel as passenger
    passenger_sess.post(f"{API}/rides/{rid}/cancel", json={"reason": "TEST cleanup"}, timeout=10)


# ============================================================
# 2. DRIVER RELEASE BACK TO POOL
# ============================================================
def test_driver_release_returns_ride_to_pending(passenger_sess, driver1_sess):
    ride = _create_ride(passenger_sess)
    rid = ride["id"]

    a = driver1_sess.post(f"{API}/rides/{rid}/accept", timeout=15)
    assert a.status_code == 200, a.text

    # Release within 20 min window
    rel = driver1_sess.post(f"{API}/rides/{rid}/driver-cancel-booking", timeout=15)
    assert rel.status_code == 200, rel.text
    assert rel.json().get("status") == "pending"

    # Verify persistence: status pending, driver_id null
    g = passenger_sess.get(f"{API}/rides/{rid}", timeout=10)
    assert g.status_code == 200
    body = g.json()
    assert body["status"] == "pending", f"Ride should be back to pending, got {body['status']}"
    assert body.get("driver_id") in (None, ""), f"driver_id should be null, got {body.get('driver_id')}"

    # And it must be available for re-acceptance
    a2 = driver1_sess.post(f"{API}/rides/{rid}/accept", timeout=15)
    assert a2.status_code == 200, f"Re-accept should succeed after release: {a2.status_code} {a2.text}"

    # Cleanup
    passenger_sess.post(f"{API}/rides/{rid}/cancel", json={"reason": "TEST cleanup"}, timeout=10)


# ============================================================
# 3. SCHEDULED RIDE STAYS IN POOL (agenda, not live)
# ============================================================
def test_scheduled_ride_excluded_from_available_feed(passenger_sess, driver1_sess):
    # ~2h ahead -> far above min_advance (60min) and lead_minutes (15min)
    sched = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    ride = _create_ride(passenger_sess, scheduled_at=sched)
    rid = ride["id"]
    assert ride.get("scheduled_at"), "scheduled_at must be persisted"

    feed = driver1_sess.get(f"{API}/rides/driver/home-feed", timeout=15)
    assert feed.status_code == 200, feed.text
    data = feed.json()

    avail_ids = [r["id"] for r in data.get("available_rides", [])]
    sched_ids = [r["id"] for r in data.get("scheduled_pending", [])]

    assert rid not in avail_ids, f"Scheduled ride leaked into available_rides: {avail_ids}"
    assert rid in sched_ids, f"Scheduled ride missing from scheduled_pending: {sched_ids}"

    # Status must stay pending shortly after creation (no auto-cancel for far-future)
    time.sleep(8)  # auto-dispatch loop runs every 5s; give it a cycle
    g = passenger_sess.get(f"{API}/rides/{rid}", timeout=10)
    assert g.status_code == 200
    assert g.json()["status"] == "pending", "Far-future scheduled ride must stay pending"

    # Cleanup
    passenger_sess.post(f"{API}/rides/{rid}/cancel", json={"reason": "TEST cleanup"}, timeout=10)


# ============================================================
# 4. SCHEDULED RIDE ATOMIC CLAIM FROM AGENDA
# ============================================================
def test_scheduled_ride_atomic_claim(passenger_sess, driver1_sess, driver2_sess):
    sched = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    ride = _create_ride(passenger_sess, scheduled_at=sched)
    rid = ride["id"]

    results = {}

    def _accept(label, sess):
        r = sess.post(f"{API}/rides/{rid}/accept", timeout=15)
        results[label] = r.status_code

    t1 = threading.Thread(target=_accept, args=("d1", driver1_sess))
    t2 = threading.Thread(target=_accept, args=("d2", driver2_sess))
    t1.start(); t2.start(); t1.join(); t2.join()

    codes = sorted(results.values())
    assert codes.count(200) == 1, f"Expected exactly one winner, got {results}"
    loser = [c for c in codes if c != 200][0]
    assert loser in (404, 409), f"Scheduled-ride loser code must be 404 or 409, got {loser}"

    # Cleanup
    passenger_sess.post(f"{API}/rides/{rid}/cancel", json={"reason": "TEST cleanup"}, timeout=10)


# ============================================================
# 5. REGRESSION — happy path create -> accept -> status updates
# ============================================================
def test_happy_path_create_accept_arriving(passenger_sess, driver1_sess):
    ride = _create_ride(passenger_sess)
    rid = ride["id"]

    a = driver1_sess.post(f"{API}/rides/{rid}/accept", timeout=15)
    assert a.status_code == 200, a.text

    # accepted -> arriving (driver heading to pickup)
    s = driver1_sess.post(f"{API}/rides/{rid}/status", json={"status": "arriving"}, timeout=10)
    assert s.status_code == 200, s.text

    g = passenger_sess.get(f"{API}/rides/{rid}", timeout=10)
    assert g.status_code == 200
    assert g.json()["status"] == "arriving"

    # Cleanup
    passenger_sess.post(f"{API}/rides/{rid}/cancel", json={"reason": "TEST cleanup"}, timeout=10)


# ============================================================
# 6. ADMIN AUTO-DISPATCH CONFIG — scheduled_lead_minutes
# ============================================================
def test_admin_auto_dispatch_config_has_scheduled_lead_minutes(admin_sess):
    g = admin_sess.get(f"{API}/admin/auto-dispatch/config", timeout=10)
    assert g.status_code == 200, g.text
    cfg = g.json().get("config", {})
    assert "scheduled_lead_minutes" in cfg, f"Missing scheduled_lead_minutes in config: {list(cfg.keys())}"
    assert isinstance(cfg["scheduled_lead_minutes"], int)
    original = cfg["scheduled_lead_minutes"]

    # PUT update
    new_val = 25 if original != 25 else 20
    u = admin_sess.put(
        f"{API}/admin/auto-dispatch/config",
        json={"scheduled_lead_minutes": new_val},
        timeout=10,
    )
    assert u.status_code == 200, u.text
    cfg2 = u.json().get("config", {})
    assert cfg2.get("scheduled_lead_minutes") == new_val

    # Verify GET reflects the change
    g2 = admin_sess.get(f"{API}/admin/auto-dispatch/config", timeout=10)
    assert g2.status_code == 200
    assert g2.json()["config"]["scheduled_lead_minutes"] == new_val

    # Restore
    admin_sess.put(
        f"{API}/admin/auto-dispatch/config",
        json={"scheduled_lead_minutes": original},
        timeout=10,
    )


# ============================================================
# 7. REGRESSION — bidding flow: counter-offer + accept-offer
# ============================================================
def test_bidding_passenger_accept_offer_atomic(passenger_sess, driver1_sess, driver2_sess):
    # Create a bidding ride
    body = {**PICKUP, **DROPOFF, "vehicle_type": "standard",
            "payment_method": "cash", "ride_type": "bidding"}
    r = passenger_sess.post(f"{API}/rides", json=body, timeout=15)
    assert r.status_code == 200, f"create bidding ride: {r.status_code} {r.text}"
    ride = r.json()
    rid = ride["id"]
    assert ride.get("mode") == "bidding", f"ride.mode expected 'bidding', got {ride.get('mode')}"

    # Driver 1 posts a counter-offer
    o1 = driver1_sess.post(f"{API}/rides/{rid}/counter-offer", json={"amount": 17.5}, timeout=15)
    assert o1.status_code == 200, f"counter-offer d1: {o1.status_code} {o1.text}"
    offer1 = o1.json()["offer"]

    # Driver 2 posts a counter-offer too
    o2 = driver2_sess.post(f"{API}/rides/{rid}/counter-offer", json={"amount": 19.0}, timeout=15)
    assert o2.status_code == 200, f"counter-offer d2: {o2.status_code} {o2.text}"

    # Passenger accepts driver 1's offer
    a = passenger_sess.post(f"{API}/rides/{rid}/accept-offer/{offer1['id']}", timeout=15)
    assert a.status_code == 200, f"accept-offer: {a.status_code} {a.text}"
    j = a.json()
    assert j.get("final_fare") == 17.5, f"final_fare expected 17.5, got {j.get('final_fare')}"

    # The ride should now be accepted and locked to driver 1; a direct /accept
    # by driver 2 must NOT succeed (atomic claim already done)
    a2 = driver2_sess.post(f"{API}/rides/{rid}/accept", timeout=15)
    assert a2.status_code in (404, 409), \
        f"After offer-accept, second /accept must fail (404/409), got {a2.status_code} {a2.text}"

    # Cleanup
    passenger_sess.post(f"{API}/rides/{rid}/cancel", json={"reason": "TEST cleanup"}, timeout=10)


# ============================================================
# 8. REGRESSION — instant ride live-dispatch escalation kicks in
# ============================================================
def test_instant_ride_dispatch_tier_advances(passenger_sess, admin_sess):
    """Instant ride with no candidate driver in radius → auto_dispatch_tier
    must advance past 0 within a few seconds (loop runs every 5s, tier-1 at 30s,
    tier-2 at 60s). We shorten the thresholds via admin config to avoid waiting
    minutes, then restore the original config.
    """
    # Snapshot current config
    g0 = admin_sess.get(f"{API}/admin/auto-dispatch/config", timeout=10)
    assert g0.status_code == 200
    orig = g0.json()["config"]

    # Shorten timings for the test
    patch = {
        "first_escalation_seconds": 3,
        "second_escalation_seconds": 6,
        "auto_cancel_after_seconds": 30,
    }
    u = admin_sess.put(f"{API}/admin/auto-dispatch/config", json=patch, timeout=10)
    assert u.status_code == 200, u.text

    try:
        ride = _create_ride(passenger_sess)
        rid = ride["id"]
        # Wait for dispatcher (every 5s) to escalate twice (~12-15s should be ample)
        observed_tier = 0
        for _ in range(8):
            time.sleep(3)
            g = passenger_sess.get(f"{API}/rides/{rid}", timeout=10)
            if g.status_code != 200:
                continue
            tier = g.json().get("auto_dispatch_tier", 0)
            if tier > observed_tier:
                observed_tier = tier
            if observed_tier >= 2:
                break
        assert observed_tier >= 1, (
            f"auto_dispatch_tier did not advance past 0 after escalation window "
            f"(observed={observed_tier})"
        )

        # Cleanup: cancel as passenger (in case auto-cancel hasn't fired yet)
        passenger_sess.post(f"{API}/rides/{rid}/cancel", json={"reason": "TEST cleanup"}, timeout=10)
    finally:
        # Restore original timings
        restore = {
            "first_escalation_seconds": orig.get("first_escalation_seconds", 30),
            "second_escalation_seconds": orig.get("second_escalation_seconds", 60),
            "auto_cancel_after_seconds": orig.get("auto_cancel_after_seconds", 120),
        }
        admin_sess.put(f"{API}/admin/auto-dispatch/config", json=restore, timeout=10)
