"""Iter 204 — Risky-keyword detection in driver↔client ride chat (E2E).

Companion to the unit test test_iter204_chat_risk_keywords.py (pure scan_risky_text).
This file validates the integration:
  • POST /api/phase1/rides/{rid}/messages by a DRIVER with risky text
        → response has flagged=True + flag_reasons (≥ {"espèces","hors-app","numéro de téléphone"})
        → driver chat_flags_count increments by 1
  • Clean message → no `flagged` field on the response.
  • PASSENGER (client) risky message → message flagged True BUT driver chat_flags
    counter must NOT increment.
  • GET /api/moderation/admin/ride-conversations → thread flagged True
  • GET /api/admin/dispatch/driver-behavior → driver chat_flags > 0, flagged True
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


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed {creds['email']}: {r.status_code} {r.text}"
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


def _create_ride(pax_sess, payment_method="card"):
    body = {**PICKUP, **DROPOFF, "vehicle_type": "standard", "payment_method": payment_method}
    r = pax_sess.post(f"{API}/rides", json=body, timeout=15)
    assert r.status_code == 200, f"create_ride failed: {r.status_code} {r.text}"
    return r.json()


async def _read_driver_chat_flags(email):
    client, db = _mongo()
    try:
        u = await db.users.find_one({"email": email}, {"_id": 0, "id": 1})
        if not u:
            return None
        d = await db.drivers.find_one({"user_id": u["id"]}, {"_id": 0, "chat_flags_count": 1})
        return int((d or {}).get("chat_flags_count") or 0)
    finally:
        client.close()


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
# 1. DRIVER risky message → response flagged True + reasons
#    + driver chat_flags_count +1
# ============================================================
def test_driver_risky_message_flags_msg_and_driver(passenger_sess, driver1_sess):
    before = asyncio.run(_read_driver_chat_flags(DRIVER_1["email"])) or 0

    ride = _create_ride(passenger_sess, payment_method="card")
    rid = ride["id"]
    try:
        acc = driver1_sess.post(f"{API}/rides/{rid}/accept", timeout=15)
        assert acc.status_code == 200, acc.text

        # Clean message first → response should NOT contain `flagged`
        clean = driver1_sess.post(
            f"{API}/phase1/rides/{rid}/messages",
            json={"text": "Bonjour, j'arrive dans 3 minutes."}, timeout=15)
        assert clean.status_code in (200, 201), clean.text
        clean_msg = clean.json()
        assert "flagged" not in clean_msg or clean_msg.get("flagged") is False, \
            f"clean message must not be flagged: {clean_msg}"

        # Risky message → flagged True + ≥ 3 reasons
        risky = driver1_sess.post(
            f"{API}/phase1/rides/{rid}/messages",
            json={"text": "Payez en especes, appelez-moi au 0612345678, on fait hors app"},
            timeout=15)
        assert risky.status_code in (200, 201), risky.text
        r_msg = risky.json()
        assert r_msg.get("flagged") is True, f"expected flagged=True, got {r_msg}"
        reasons = set(r_msg.get("flag_reasons") or [])
        assert {"espèces", "hors-app", "numéro de téléphone"} <= reasons, \
            f"missing reasons in {reasons}"

        # Driver counter incremented
        # tiny delay to let async record_chat_flag persist
        import time
        time.sleep(0.5)
        after = asyncio.run(_read_driver_chat_flags(DRIVER_1["email"])) or 0
        assert after == before + 1, f"driver chat_flags_count: before={before} after={after}"
    finally:
        passenger_sess.post(f"{API}/rides/{rid}/cancel", timeout=10)


# ============================================================
# 2. PASSENGER risky message → flagged True on msg
#    BUT driver chat_flags_count must NOT increment
# ============================================================
def test_passenger_risky_does_not_increment_driver(passenger_sess, driver1_sess):
    before = asyncio.run(_read_driver_chat_flags(DRIVER_1["email"])) or 0

    ride = _create_ride(passenger_sess, payment_method="card")
    rid = ride["id"]
    try:
        driver1_sess.post(f"{API}/rides/{rid}/accept", timeout=15)

        # Passenger sends a risky message
        pax = passenger_sess.post(
            f"{API}/phase1/rides/{rid}/messages",
            json={"text": "On peut faire ça en espèces hors app ? 0612345678"},
            timeout=15)
        assert pax.status_code in (200, 201), pax.text
        pmsg = pax.json()
        # Message itself IS flagged
        assert pmsg.get("flagged") is True, f"passenger risky message should be flagged: {pmsg}"
        reasons = set(pmsg.get("flag_reasons") or [])
        assert "espèces" in reasons or "hors-app" in reasons or "numéro de téléphone" in reasons

        import time
        time.sleep(0.5)
        after = asyncio.run(_read_driver_chat_flags(DRIVER_1["email"])) or 0
        assert after == before, \
            f"driver counter must NOT change on passenger risky msg: before={before} after={after}"
    finally:
        passenger_sess.post(f"{API}/rides/{rid}/cancel", timeout=10)


# ============================================================
# 3. Admin ride-conversations list marks the thread flagged=True
#    + thread endpoint exposes per-message flag_reasons
# ============================================================
def test_admin_thread_marked_flagged(admin_sess, passenger_sess, driver1_sess):
    ride = _create_ride(passenger_sess, payment_method="card")
    rid = ride["id"]
    try:
        driver1_sess.post(f"{API}/rides/{rid}/accept", timeout=15)
        driver1_sess.post(
            f"{API}/phase1/rides/{rid}/messages",
            json={"text": "Salut, payez en espèces svp, appelle-moi 0612345678"},
            timeout=15)

        # List
        r = admin_sess.get(f"{API}/moderation/admin/ride-conversations", timeout=15)
        assert r.status_code == 200, r.text
        ours = next((it for it in r.json() if it.get("ride_id") == rid), None)
        assert ours, f"ride {rid} missing from admin list"
        assert ours.get("flagged") is True, f"thread should be flagged: {ours}"

        # Thread
        rt = admin_sess.get(f"{API}/moderation/admin/ride-conversations/{rid}", timeout=15)
        assert rt.status_code == 200, rt.text
        payload = rt.json()
        msgs = payload.get("messages") or []
        assert any(m.get("flagged") is True and m.get("flag_reasons") for m in msgs), \
            f"no flagged message returned in thread: {msgs}"
    finally:
        passenger_sess.post(f"{API}/rides/{rid}/cancel", timeout=10)


# ============================================================
# 4. Dispatch driver-behavior surfaces chat_flags + flagged=True
# ============================================================
def test_driver_behavior_chat_flags(admin_sess, passenger_sess, driver1_sess):
    # ensure at least one flag for jean.dupont
    ride = _create_ride(passenger_sess, payment_method="card")
    rid = ride["id"]
    try:
        driver1_sess.post(f"{API}/rides/{rid}/accept", timeout=15)
        driver1_sess.post(
            f"{API}/phase1/rides/{rid}/messages",
            json={"text": "hors-app 0612345678 espèces"}, timeout=15)
    finally:
        passenger_sess.post(f"{API}/rides/{rid}/cancel", timeout=10)

    import time
    time.sleep(0.5)
    r = admin_sess.get(f"{API}/admin/dispatch/driver-behavior", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data if isinstance(data, list) else (data.get("items") or data.get("drivers") or [])
    assert items, f"no driver-behavior items: {data}"

    def _name(it):
        return (it.get("name") or it.get("driver_name") or "").lower()
    target = next(
        (it for it in items if "jean" in _name(it) or "dupont" in _name(it)),
        None,
    )
    assert target, f"jean.dupont not in driver-behavior: {[_name(i) for i in items]}"
    assert "chat_flags" in target, f"missing chat_flags field: {target}"
    assert int(target["chat_flags"]) >= 1, f"chat_flags expected ≥1 got {target['chat_flags']}"
    assert target.get("flagged") is True, f"driver should be flagged: {target}"
