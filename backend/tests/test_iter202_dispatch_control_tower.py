"""Iter 202 — Phase 4 Control Tower (Tour de contrôle dispatch) API tests.

Validates the NEW backend endpoints that power /admin/dispatch:
  - GET  /api/admin/dispatch/overview         (zones, totals, config)
  - GET  /api/admin/dispatch/driver-behavior  (accept-release table, CB ratio)
  - POST /api/admin/dispatch/drivers/{id}/suspend
  - POST /api/admin/dispatch/drivers/{id}/reinstate
  - GET/PUT /api/admin/auto-dispatch/config   (max_refusals_before_offline,
                                              refusal_window_minutes,
                                              cb_cancel_flag_pct/min)
  - POST /api/rides/{id}/decline              (auto-offline once over threshold)
  - GET  /api/rides?status=pending            (payment_method MUST be hidden
                                              for drivers on non-assigned rides)

Reuses the demo passenger + drivers from iter201. Cleans up any rides it
creates. Resets max_refusals_before_offline=0 in a finally so subsequent
suites are not affected.
"""
import os
import re
import time
import pytest
import requests


def _read_backend_url():
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
DRIVER_3 = {"email": "sophie.martin@demo.sb", "password": "Driver123!"}

PICKUP = {"pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Châtelet, Paris"}
DROPOFF = {"dropoff_lat": 48.8738, "dropoff_lng": 2.2950, "dropoff_address": "Arc de Triomphe, Paris"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    token = r.json().get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def _ensure_driver_online(sess):
    me = sess.get(f"{API}/drivers/profile", timeout=10)
    assert me.status_code == 200, me.text
    d = me.json()
    if d.get("status") == "suspended":
        return d  # caller is expected to reinstate via admin
    if not d.get("is_online"):
        sess.post(f"{API}/drivers/toggle-online", timeout=10)
    sess.post(f"{API}/drivers/location",
              json={"lat": PICKUP["pickup_lat"], "lng": PICKUP["pickup_lng"]}, timeout=10)
    return d


def _create_ride(pax_sess, payment_method="cash"):
    body = {**PICKUP, **DROPOFF, "vehicle_type": "standard", "payment_method": payment_method}
    r = pax_sess.post(f"{API}/rides", json=body, timeout=15)
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
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    async def _wipe():
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
def driver1_sess(admin_sess):
    # Make sure driver isn't suspended from a previous run
    s = _login(DRIVER_1)
    me = s.get(f"{API}/drivers/profile", timeout=10).json()
    if me.get("status") == "suspended":
        admin_sess.post(f"{API}/admin/dispatch/drivers/{me['id']}/reinstate", timeout=10)
    _ensure_driver_online(s)
    return s


@pytest.fixture(scope="module")
def driver3_sess(admin_sess):
    s = _login(DRIVER_3)
    me = s.get(f"{API}/drivers/profile", timeout=10).json()
    if me.get("status") == "suspended":
        admin_sess.post(f"{API}/admin/dispatch/drivers/{me['id']}/reinstate", timeout=10)
    _ensure_driver_online(s)
    return s


# ============================================================
# 1. OVERVIEW endpoint shape + counts
# ============================================================
def test_overview_shape_and_totals(admin_sess, passenger_sess, driver1_sess):
    # Create a fresh pending ride so totals.pending >= 1
    ride = _create_ride(passenger_sess, payment_method="card")
    rid = ride["id"]
    try:
        r = admin_sess.get(f"{API}/admin/dispatch/overview", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()

        # Top-level shape
        for k in ("zones", "totals", "config", "server_time"):
            assert k in data, f"missing key {k}"
        assert isinstance(data["zones"], list)
        assert isinstance(data["totals"], dict)

        totals = data["totals"]
        for k in ("pending", "online_drivers", "no_driver_alerts"):
            assert k in totals
            assert isinstance(totals[k], int)
        assert totals["pending"] >= 1, "freshly-created ride should appear"
        assert totals["online_drivers"] >= 1, "driver1 was set online"

        # Config block exposes the new discipline fields
        cfg = data["config"]
        for k in ("max_refusals_before_offline", "refusal_window_minutes",
                  "cb_cancel_flag_pct", "cb_cancel_flag_min",
                  "first_escalation_seconds", "scheduled_lead_minutes"):
            assert k in cfg, f"config missing {k}"

        # Our ride must be findable in one of the zone groups (Paris is unzoned
        # in the seeded zones -> 'Hors zone' bucket).
        found = None
        for g in data["zones"]:
            for rd in g.get("rides", []):
                if rd.get("id") == rid:
                    found = (g, rd); break
            if found:
                break
        assert found, "newly created ride not present in overview"
        g, rd = found
        # Card payment method must be visible to the ADMIN (it's the driver
        # who can't see it before accept).
        assert rd.get("payment_method") == "card"
        assert "tier" in rd  # auto_dispatch_tier
        assert rd.get("age_seconds", -1) >= 0
        # Each zone group has the expected counters
        for key in ("zone", "pending", "online_drivers", "rides", "alert"):
            assert key in g, f"zone group missing {key}"
    finally:
        passenger_sess.post(f"{API}/rides/{rid}/cancel", timeout=10)


# ============================================================
# 2. PAYMENT METHOD HIDDEN from driver feed on non-assigned rides
# ============================================================
def test_payment_method_hidden_from_driver_pending_feed(passenger_sess, driver1_sess):
    # CB ride created by passenger - driver1 has NOT accepted.
    ride = _create_ride(passenger_sess, payment_method="card")
    rid = ride["id"]
    try:
        # driver lists pending rides
        r = driver1_sess.get(f"{API}/rides", params={"status": "pending"}, timeout=15)
        assert r.status_code == 200, r.text
        listing = r.json()
        target = next((x for x in listing if x.get("id") == rid), None)
        assert target is not None, "pending ride not visible to driver"
        # CRITICAL: payment_method/payment_status must be MASKED
        assert "payment_method" not in target, \
            f"payment_method leaked to driver before accept: {target}"
        assert "payment_status" not in target, \
            f"payment_status leaked to driver before accept: {target}"

        # Accept the ride -> driver now should see the payment method on the
        # ride owned by them.
        acc = driver1_sess.post(f"{API}/rides/{rid}/accept", timeout=15)
        assert acc.status_code == 200, acc.text
        r2 = driver1_sess.get(f"{API}/rides/{rid}", timeout=10)
        assert r2.status_code == 200
        owned = r2.json()
        assert owned.get("payment_method") == "card", \
            f"after accept, own ride must reveal payment_method, got {owned}"
    finally:
        # Cancel as passenger to put back in a clean state.
        passenger_sess.post(f"{API}/rides/{rid}/cancel", timeout=10)


# ============================================================
# 3. DISCIPLINE CONFIG persistence
# ============================================================
def test_dispatch_config_persistence(admin_sess):
    # Snapshot then mutate, then restore
    r = admin_sess.get(f"{API}/admin/auto-dispatch/config", timeout=15)
    assert r.status_code == 200, r.text
    original = r.json().get("config", r.json())

    new_vals = {
        "max_refusals_before_offline": 4,
        "refusal_window_minutes": 45,
        "cb_cancel_flag_pct": 42,
        "cb_cancel_flag_min": 5,
    }
    upd = admin_sess.put(f"{API}/admin/auto-dispatch/config", json=new_vals, timeout=15)
    assert upd.status_code == 200, upd.text
    upd_body = upd.json().get("config", upd.json())
    for k, v in new_vals.items():
        assert upd_body.get(k) == v, f"PUT response {k}: got {upd_body.get(k)} expected {v}"

    rr = admin_sess.get(f"{API}/admin/auto-dispatch/config", timeout=15)
    assert rr.status_code == 200
    cur = rr.json().get("config", rr.json())
    for k, v in new_vals.items():
        assert cur.get(k) == v, f"{k} not persisted: got {cur.get(k)} expected {v}"

    # Overview must mirror config
    ov = admin_sess.get(f"{API}/admin/dispatch/overview", timeout=15).json()
    for k, v in new_vals.items():
        assert ov["config"].get(k) == v, f"overview.config.{k} mismatch"

    # Restore (esp. max_refusals_before_offline -> 0 to not affect later tests)
    restore = {k: original.get(k, 0) for k in new_vals}
    restore["max_refusals_before_offline"] = 0  # safe default
    admin_sess.put(f"{API}/admin/auto-dispatch/config", json=restore, timeout=15)


# ============================================================
# 4. DRIVER BEHAVIOR table + 1-click SUSPEND/REINSTATE
# ============================================================
def test_driver_behavior_and_suspend_flow(admin_sess, driver1_sess):
    # Behavior endpoint shape
    r = admin_sess.get(f"{API}/admin/dispatch/driver-behavior", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    for k in ("drivers", "flag_pct", "flag_min", "refusal_window_minutes"):
        assert k in data
    assert isinstance(data["drivers"], list)

    # Find driver1 id
    me = driver1_sess.get(f"{API}/drivers/profile", timeout=10).json()
    drv_id = me["id"]

    # Suspend driver1
    s = admin_sess.post(f"{API}/admin/dispatch/drivers/{drv_id}/suspend", timeout=15)
    assert s.status_code == 200, s.text
    body = s.json()
    assert body.get("status") == "suspended"

    # Verify status via driver profile
    me2 = driver1_sess.get(f"{API}/drivers/profile", timeout=10).json()
    assert me2.get("status") == "suspended"
    assert me2.get("is_online") is False  # suspend forces offline

    # Behavior endpoint should surface a suspended driver even with no signal
    beh = admin_sess.get(f"{API}/admin/dispatch/driver-behavior", timeout=15).json()
    susp = next((d for d in beh["drivers"] if d.get("id") == drv_id), None)
    assert susp is not None, "suspended driver missing from behavior table"
    assert susp.get("status") == "suspended"

    # Reinstate
    rr = admin_sess.post(f"{API}/admin/dispatch/drivers/{drv_id}/reinstate", timeout=15)
    assert rr.status_code == 200, rr.text
    assert rr.json().get("status") == "approved"

    me3 = driver1_sess.get(f"{API}/drivers/profile", timeout=10).json()
    assert me3.get("status") == "approved"

    # 404 on unknown driver id
    bad = admin_sess.post(f"{API}/admin/dispatch/drivers/__nope__/suspend", timeout=10)
    assert bad.status_code == 404


# ============================================================
# 5. DRIVER AUTO-OFFLINE after N refusals (POST /rides/{id}/decline)
# ============================================================
def test_driver_auto_offline_on_refusals(admin_sess, passenger_sess, driver3_sess):
    # Set threshold = 2
    admin_sess.put(f"{API}/admin/auto-dispatch/config",
                   json={"max_refusals_before_offline": 2, "refusal_window_minutes": 60},
                   timeout=10)
    try:
        # Wipe driver3's prior refusal_log via a brand-new login (the helper
        # uses the rolling window so old refusals could matter — we set the
        # threshold via admin then ensure driver is online + log cleared by
        # asking admin DB tools).
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient
        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")
        mongo_url = os.environ.get("MONGO_URL") or env.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME") or env.get("DB_NAME")
        async def _reset():
            client = AsyncIOMotorClient(mongo_url)
            db = client[db_name]
            user = await db.users.find_one({"email": DRIVER_3["email"]}, {"_id": 0, "id": 1})
            if user:
                await db.drivers.update_one({"user_id": user["id"]}, {"$set": {"refusal_log": [], "is_online": True, "status": "approved"}})
            client.close()
        asyncio.run(_reset())

        # Two pending rides so we have valid ride_ids (decline doesn't gate on
        # ride ownership — it just records refusal — but we use real ids for
        # realism).
        r1 = _create_ride(passenger_sess); r2 = _create_ride(passenger_sess)
        try:
            d1 = driver3_sess.post(f"{API}/rides/{r1['id']}/decline", timeout=10)
            assert d1.status_code == 200, d1.text
            b1 = d1.json()
            assert b1.get("ok") is True
            assert b1.get("went_offline") is False, f"first decline should NOT auto-offline: {b1}"

            d2 = driver3_sess.post(f"{API}/rides/{r2['id']}/decline", timeout=10)
            assert d2.status_code == 200, d2.text
            b2 = d2.json()
            assert b2.get("went_offline") is True, f"second decline should auto-offline: {b2}"
            assert b2.get("count", 0) >= 2

            # Confirm driver flipped offline
            me = driver3_sess.get(f"{API}/drivers/profile", timeout=10).json()
            assert me.get("is_online") is False, "driver should be offline after auto-trigger"
        finally:
            passenger_sess.post(f"{API}/rides/{r1['id']}/cancel", timeout=10)
            passenger_sess.post(f"{API}/rides/{r2['id']}/cancel", timeout=10)
    finally:
        # CRITICAL: restore so other suites/dev don't auto-offline
        admin_sess.put(f"{API}/admin/auto-dispatch/config",
                       json={"max_refusals_before_offline": 0}, timeout=10)


# ============================================================
# 6. ROLE GATING — passenger cannot access admin dispatch
# ============================================================
def test_role_gating_passenger_cannot_access(passenger_sess):
    r = passenger_sess.get(f"{API}/admin/dispatch/overview", timeout=10)
    assert r.status_code in (401, 403), f"expected 401/403 for passenger, got {r.status_code}"

    r2 = passenger_sess.get(f"{API}/admin/dispatch/driver-behavior", timeout=10)
    assert r2.status_code in (401, 403)
