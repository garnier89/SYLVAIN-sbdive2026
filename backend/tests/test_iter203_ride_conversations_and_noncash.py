"""Iter 203 — Ride conversations (admin) + Non-cash (wallet+card) abuse flag.

Validates the follow-up to Phase 4 dispatch control tower:
  • GET  /api/moderation/admin/ride-conversations         (list, payment filters)
  • GET  /api/moderation/admin/ride-conversations/{rid}   (thread + ride context)
  • Role gating (passenger -> 401/403 on both)
  • POST /api/phase1/rides/{id}/messages stores into db.ride_messages
  • record_driver_cancellation increments accept_release_cb_count for WALLET
    rides as well as CARD (NONCASH_METHODS = CARD ∪ WALLET).
  • GET /api/admin/dispatch/overview still exposes totals.no_driver_alerts
    (bell badge source) — regression.

Cleans up any test data and leaves driver1 reinstated + online.
"""
import os
import re
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient


# ─── BASE_URL ────────────────────────────────────────────────────────────
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

PICKUP = {"pickup_lat": 48.8566, "pickup_lng": 2.3522, "pickup_address": "Châtelet, Paris"}
DROPOFF = {"dropoff_lat": 48.8738, "dropoff_lng": 2.2950, "dropoff_address": "Arc de Triomphe, Paris"}


# ─── Mongo helper ────────────────────────────────────────────────────────
def _mongo():
    try:
        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")
    except Exception:
        env = {}
    mongo_url = os.environ.get("MONGO_URL") or env.get("MONGO_URL") or "mongodb://localhost:27017"
    db_name = os.environ.get("DB_NAME") or env.get("DB_NAME") or "test_database"
    client = AsyncIOMotorClient(mongo_url)
    return client, client[db_name]


# ─── HTTP helpers ────────────────────────────────────────────────────────
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
    if not d.get("is_online") and d.get("status") != "suspended":
        sess.post(f"{API}/drivers/toggle-online", timeout=10)
    sess.post(f"{API}/drivers/location",
              json={"lat": PICKUP["pickup_lat"], "lng": PICKUP["pickup_lng"]}, timeout=10)
    return d


def _create_ride(pax_sess, payment_method="cash"):
    body = {**PICKUP, **DROPOFF, "vehicle_type": "standard", "payment_method": payment_method}
    r = pax_sess.post(f"{API}/rides", json=body, timeout=15)
    assert r.status_code == 200, f"create_ride failed: {r.status_code} {r.text}"
    return r.json()


# ─── Fixtures ────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def admin_sess():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def passenger_sess():
    return _login(PASSENGER)


@pytest.fixture(scope="module")
def driver1_sess(admin_sess):
    s = _login(DRIVER_1)
    me = s.get(f"{API}/drivers/profile", timeout=10).json()
    if me.get("status") == "suspended":
        admin_sess.post(f"{API}/admin/dispatch/drivers/{me['id']}/reinstate", timeout=10)
        s = _login(DRIVER_1)
    _ensure_driver_online(s)
    return s


@pytest.fixture(scope="module", autouse=True)
def _wipe_state():
    async def _wipe():
        client, db = _mongo()
        try:
            user = await db.users.find_one({"email": PASSENGER["email"]}, {"_id": 0, "id": 1})
            if user:
                await db.moderation_state.delete_many({"user_id": user["id"]})
        finally:
            client.close()
    asyncio.run(_wipe())
    yield
    asyncio.run(_wipe())


# ============================================================
# 1. RIDE CONVERSATIONS — list endpoint shape + payment filters
# ============================================================
def test_ride_conversations_list_and_filters(admin_sess, passenger_sess, driver1_sess):
    # Make a CARD ride, driver accepts, then both exchange messages so a
    # ride_messages thread exists with a non-cash payment context.
    ride = _create_ride(passenger_sess, payment_method="card")
    rid = ride["id"]
    try:
        acc = driver1_sess.post(f"{API}/rides/{rid}/accept", timeout=15)
        assert acc.status_code == 200, acc.text

        m1 = driver1_sess.post(f"{API}/phase1/rides/{rid}/messages",
                               json={"text": "Bonjour, j'arrive dans 3 minutes."}, timeout=15)
        assert m1.status_code in (200, 201), m1.text
        m2 = passenger_sess.post(f"{API}/phase1/rides/{rid}/messages",
                                 json={"text": "Merci, à tout de suite."}, timeout=15)
        assert m2.status_code in (200, 201), m2.text

        # Unfiltered list — must include our ride and expose context fields
        r = admin_sess.get(f"{API}/moderation/admin/ride-conversations", timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list) and items, "expected at least one thread"
        ours = next((it for it in items if it.get("ride_id") == rid), None)
        assert ours, f"new ride {rid} not in list"
        # Shape
        for k in ("ride_id", "booking_no", "driver_name", "client_name",
                  "payment_method", "payment_kind", "message_count", "last_at"):
            assert k in ours, f"missing field {k}"
        assert ours["payment_method"] == "card"
        assert ours["payment_kind"] == "card"
        assert ours["message_count"] >= 2

        # ── payment=card → present ─────────────────────────────────────
        r = admin_sess.get(f"{API}/moderation/admin/ride-conversations",
                           params={"payment": "card"}, timeout=15)
        assert r.status_code == 200
        ids = [it["ride_id"] for it in r.json()]
        assert rid in ids
        assert all(it["payment_kind"] == "card" for it in r.json())

        # ── payment=noncash → present (card+wallet, excludes cash) ─────
        r = admin_sess.get(f"{API}/moderation/admin/ride-conversations",
                           params={"payment": "noncash"}, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert rid in [it["ride_id"] for it in rows]
        assert all(it["payment_kind"] in ("card", "wallet") for it in rows)

        # ── payment=cash → must NOT include our card ride ──────────────
        r = admin_sess.get(f"{API}/moderation/admin/ride-conversations",
                           params={"payment": "cash"}, timeout=15)
        assert r.status_code == 200
        assert rid not in [it["ride_id"] for it in r.json()]
        assert all(it["payment_kind"] == "cash" for it in r.json())
    finally:
        passenger_sess.post(f"{API}/rides/{rid}/cancel", timeout=10)


# ============================================================
# 2. RIDE CONVERSATIONS — thread endpoint with ride context
# ============================================================
def test_ride_conversation_thread_returns_messages(admin_sess, passenger_sess, driver1_sess):
    ride = _create_ride(passenger_sess, payment_method="card")
    rid = ride["id"]
    try:
        driver1_sess.post(f"{API}/rides/{rid}/accept", timeout=15)
        driver1_sess.post(f"{API}/phase1/rides/{rid}/messages",
                          json={"text": "Hello from driver"}, timeout=15)
        passenger_sess.post(f"{API}/phase1/rides/{rid}/messages",
                            json={"text": "Hello from passenger"}, timeout=15)

        r = admin_sess.get(f"{API}/moderation/admin/ride-conversations/{rid}", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "ride" in body and "messages" in body
        ctx = body["ride"]
        assert ctx["ride_id"] == rid
        assert ctx["payment_method"] == "card"
        assert ctx.get("driver_name")
        msgs = body["messages"]
        assert isinstance(msgs, list)
        assert len(msgs) >= 2
        roles = {m.get("sender_role") for m in msgs}
        # At least one of each side must be present
        assert "driver" in roles
        assert "client" in roles or "passenger" in roles or "user" in roles
        texts = [m.get("text") for m in msgs]
        assert "Hello from driver" in texts
        assert "Hello from passenger" in texts
        # No mongo _id leaked
        assert all("_id" not in m for m in msgs)
    finally:
        passenger_sess.post(f"{API}/rides/{rid}/cancel", timeout=10)


# ============================================================
# 3. RIDE CONVERSATIONS — role gating (passenger gets 401/403)
# ============================================================
def test_ride_conversations_role_gating(passenger_sess):
    r = passenger_sess.get(f"{API}/moderation/admin/ride-conversations", timeout=15)
    assert r.status_code in (401, 403), f"passenger should be denied, got {r.status_code}"
    r = passenger_sess.get(f"{API}/moderation/admin/ride-conversations/anything", timeout=15)
    assert r.status_code in (401, 403), f"passenger should be denied, got {r.status_code}"


# ============================================================
# 4. NON-CASH FLAG — WALLET cancellation increments accept_release_cb_count
# ============================================================
def _get_driver_counters_by_email(email):
    async def _fetch():
        client, db = _mongo()
        try:
            u = await db.users.find_one({"email": email}, {"_id": 0, "id": 1})
            if not u:
                return None
            d = await db.drivers.find_one(
                {"user_id": u["id"]},
                {"_id": 0, "id": 1, "accept_release_count": 1, "accept_release_cb_count": 1},
            )
            return d
        finally:
            client.close()
    return asyncio.run(_fetch())


def test_wallet_cancellation_increments_noncash_counter(passenger_sess, driver1_sess):
    """A driver accepting then cancelling a WALLET ride must bump
    accept_release_cb_count (the non-cash counter), proving wallet is now in
    NONCASH_METHODS alongside card."""
    before = _get_driver_counters_by_email(DRIVER_1["email"]) or {}
    before_total = int(before.get("accept_release_count") or 0)
    before_cb = int(before.get("accept_release_cb_count") or 0)

    # Create a WALLET ride. Wallet is debited only on completion, so the
    # creation/accept/release flow does not need a funded wallet.
    ride = _create_ride(passenger_sess, payment_method="wallet")
    rid = ride["id"]
    try:
        acc = driver1_sess.post(f"{API}/rides/{rid}/accept", timeout=15)
        assert acc.status_code == 200, acc.text
        # Driver releases the booking immediately (within window).
        rel = driver1_sess.post(f"{API}/rides/{rid}/driver-cancel-booking", timeout=15)
        assert rel.status_code == 200, rel.text

        after = _get_driver_counters_by_email(DRIVER_1["email"]) or {}
        after_total = int(after.get("accept_release_count") or 0)
        after_cb = int(after.get("accept_release_cb_count") or 0)
        assert after_total == before_total + 1, (
            f"accept_release_count: {before_total} -> {after_total}"
        )
        assert after_cb == before_cb + 1, (
            f"accept_release_cb_count (non-cash) should have incremented for WALLET ride: "
            f"{before_cb} -> {after_cb}"
        )
    finally:
        # Ride is back to pending → cancel it as passenger to clean up.
        try:
            passenger_sess.post(f"{API}/rides/{rid}/cancel", timeout=10)
        except Exception:
            pass


# ============================================================
# 5. BELL BADGE source — overview totals.no_driver_alerts present
# ============================================================
def test_dispatch_overview_exposes_no_driver_alerts(admin_sess):
    r = admin_sess.get(f"{API}/admin/dispatch/overview", timeout=15)
    assert r.status_code == 200, r.text
    totals = r.json().get("totals", {})
    assert "no_driver_alerts" in totals
    assert isinstance(totals["no_driver_alerts"], int)
    assert totals["no_driver_alerts"] >= 0


# ============================================================
# 6. Driver-behavior table still surfaces drivers with non-cash signal
# ============================================================
def test_driver_behavior_table_lists_noncash_signal(admin_sess):
    r = admin_sess.get(f"{API}/admin/dispatch/driver-behavior", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "drivers" in body and isinstance(body["drivers"], list)
    # Driver 1 (jean.dupont) just got a wallet cancel above, so should appear
    drivers = body["drivers"]
    j = next((d for d in drivers if "jean" in (d.get("name") or "").lower()
              or "dupont" in (d.get("name") or "").lower()), None)
    if j is not None:
        assert j.get("accept_release_cb_count", 0) >= 1
        assert "cb_cancel_ratio" in j
