"""SB Student Phase 5 — HTTP e2e tests for rewards + events.

Covers:
- Rewards: catalog seeded, /me balance + ledger + redemptions, redeem insufficient => 400,
  admin config GET/PUT, admin catalog CRUD, admin award credits user balance, non-admin guards.
- Events: admin create party with shuttle, list (seats_left), reserve OK, capacity 409,
  double 409, cancel, my-reservations, admin list + update + delete.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PASSWORD = "SuperAdmin123!"


def _new_user_session():
    s = requests.Session()
    email = f"TEST_iter256_{uuid.uuid4().hex[:8]}@example.com"
    password = "Test123!@#"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": password, "name": "Iter256 Tester", "phone": f"+33{uuid.uuid4().int % 10**9:09d}"
    })
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    # Auto-login should set cookie OR explicit login
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    me = s.get(f"{API}/auth/me")
    assert me.status_code == 200
    return s, me.json()


def _admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


# ============================================================
# REWARDS
# ============================================================
@pytest.fixture(scope="module")
def admin():
    return _admin_session()


@pytest.fixture(scope="module")
def user():
    return _new_user_session()


def test_rewards_catalog_seeded(user):
    s, _ = user
    r = s.get(f"{API}/student/rewards/catalog")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "rewards" in data
    assert len(data["rewards"]) >= 3, f"Expected ≥3 seeded rewards, got {len(data['rewards'])}"
    for rw in data["rewards"]:
        assert "id" in rw and "title" in rw and "cost_points" in rw and "type" in rw


def test_rewards_me_initial_zero(user):
    s, _ = user
    r = s.get(f"{API}/student/rewards/me")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["balance"] == 0
    assert isinstance(d["ledger"], list)
    assert isinstance(d["redemptions"], list)


def test_rewards_redeem_insufficient_points_400(user):
    s, _ = user
    cat = s.get(f"{API}/student/rewards/catalog").json()["rewards"]
    reward_id = cat[0]["id"]
    r = s.post(f"{API}/student/rewards/redeem", json={"reward_id": reward_id})
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"


def test_rewards_admin_guard_non_admin(user):
    s, _ = user
    r = s.get(f"{API}/student/rewards/admin/config")
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


def test_rewards_admin_guard_no_auth():
    r = requests.get(f"{API}/student/rewards/admin/config")
    assert r.status_code in (401, 403)


def test_rewards_admin_config_get_put(admin):
    r = admin.get(f"{API}/student/rewards/admin/config")
    assert r.status_code == 200, r.text
    cfg = r.json()
    assert "points_per_ride" in cfg
    original_ppr = cfg.get("points_per_ride", 10)
    # PUT update
    r = admin.put(f"{API}/student/rewards/admin/config", json={"points_per_ride": 15})
    assert r.status_code == 200, r.text
    assert r.json()["points_per_ride"] == 15
    # restore
    admin.put(f"{API}/student/rewards/admin/config", json={"points_per_ride": original_ppr})


def test_rewards_admin_catalog_crud(admin):
    # CREATE
    payload = {"title": "TEST_iter256_reward", "type": "voucher", "cost_points": 250, "value": 7.5, "enabled": True}
    r = admin.post(f"{API}/student/rewards/admin/catalog", json=payload)
    assert r.status_code == 200, r.text
    new_reward = r.json()["reward"]
    rid = new_reward["id"]
    assert new_reward["title"] == "TEST_iter256_reward"
    assert new_reward["cost_points"] == 250

    # READ via admin listing
    r = admin.get(f"{API}/student/rewards/admin/catalog")
    assert r.status_code == 200
    assert any(rw["id"] == rid for rw in r.json()["rewards"])

    # UPDATE
    r = admin.put(f"{API}/student/rewards/admin/catalog/{rid}", json={"cost_points": 300})
    assert r.status_code == 200
    assert r.json()["reward"]["cost_points"] == 300

    # DELETE (cleanup)
    r = admin.delete(f"{API}/student/rewards/admin/catalog/{rid}")
    assert r.status_code == 200
    assert r.json()["deleted"] == 1


def test_rewards_admin_award_credits_user(admin, user):
    s, u = user
    uid = u["id"]
    r = admin.post(f"{API}/student/rewards/admin/award", json={
        "user_id": uid, "points": 600, "reason": "TEST_iter256_award"
    })
    assert r.status_code == 200, r.text
    assert r.json()["balance"] >= 600

    # User sees the new balance
    r = s.get(f"{API}/student/rewards/me")
    assert r.status_code == 200
    d = r.json()
    assert d["balance"] >= 600
    assert any(e.get("reason") == "TEST_iter256_award" for e in d["ledger"])


def test_rewards_redeem_after_award(admin, user):
    s, u = user
    # Ensure user has plenty of points (already from prev test)
    cat = s.get(f"{API}/student/rewards/catalog").json()["rewards"]
    # Pick cheapest reward
    target = sorted(cat, key=lambda x: x["cost_points"])[0]
    bal_before = s.get(f"{API}/student/rewards/me").json()["balance"]
    if bal_before < target["cost_points"]:
        admin.post(f"{API}/student/rewards/admin/award", json={
            "user_id": u["id"], "points": target["cost_points"], "reason": "TEST_topup"})
        bal_before = s.get(f"{API}/student/rewards/me").json()["balance"]
    r = s.post(f"{API}/student/rewards/redeem", json={"reward_id": target["id"]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["ok"] is True
    assert d["balance"] == bal_before - target["cost_points"]
    assert "redemption" in d and "code" in d["redemption"]
    # Verify in /me
    me = s.get(f"{API}/student/rewards/me").json()
    assert any(rd["id"] == d["redemption"]["id"] for rd in me["redemptions"])


# ============================================================
# EVENTS
# ============================================================
@pytest.fixture(scope="module")
def event_ctx(admin):
    """Create an event with capacity=2 + shuttle enabled, yield id, cleanup."""
    payload = {
        "title": f"TEST_iter256_party_{uuid.uuid4().hex[:6]}",
        "type": "party",
        "shuttle_enabled": True,
        "shuttle_price": 5.0,
        "capacity": 2,
        "enabled": True,
        "location": "Campus Demo",
    }
    r = admin.post(f"{API}/student/events/admin", json=payload)
    assert r.status_code == 200, r.text
    event_id = r.json()["event"]["id"]
    yield event_id
    # Cleanup
    admin.delete(f"{API}/student/events/admin/{event_id}")


def test_events_admin_create_and_list(admin, event_ctx):
    r = admin.get(f"{API}/student/events/admin/list")
    assert r.status_code == 200
    ids = [e["id"] for e in r.json()["events"]]
    assert event_ctx in ids


def test_events_list_shows_seats_left(user, event_ctx):
    s, _ = user
    r = s.get(f"{API}/student/events")
    assert r.status_code == 200
    events = r.json()["events"]
    ev = next((e for e in events if e["id"] == event_ctx), None)
    assert ev is not None, "TEST event not in user-listing"
    assert ev.get("shuttle_enabled") is True
    assert ev.get("seats_left") == 2


def test_events_reserve_and_my_reservations(user, event_ctx):
    s, _ = user
    r = s.post(f"{API}/student/events/reserve", json={"event_id": event_ctx, "seats": 1, "pickup": "Stop A"})
    assert r.status_code == 200, r.text
    res = r.json()["reservation"]
    assert res["status"] == "confirmed"
    assert res["event_id"] == event_ctx
    # my-reservations contains it
    r = s.get(f"{API}/student/events/my-reservations")
    assert r.status_code == 200
    assert any(x["id"] == res["id"] for x in r.json()["reservations"])
    # seats_left now 1
    events = s.get(f"{API}/student/events").json()["events"]
    ev = next((e for e in events if e["id"] == event_ctx), None)
    assert ev["seats_left"] == 1


def test_events_double_reservation_409(user, event_ctx):
    s, _ = user
    r = s.post(f"{API}/student/events/reserve", json={"event_id": event_ctx, "seats": 1})
    assert r.status_code == 409, f"Expected 409, got {r.status_code}: {r.text}"


def test_events_capacity_exceeded_409(event_ctx):
    """Another user tries to reserve 2 seats (only 1 left) => 409."""
    s2, _ = _new_user_session()
    r = s2.post(f"{API}/student/events/reserve", json={"event_id": event_ctx, "seats": 2})
    assert r.status_code == 409, f"Expected 409, got {r.status_code}: {r.text}"
    # But reserving 1 should be OK (last seat)
    r = s2.post(f"{API}/student/events/reserve", json={"event_id": event_ctx, "seats": 1})
    assert r.status_code == 200, r.text


def test_events_cancel(user, event_ctx):
    s, _ = user
    # Get my reservation id
    res_list = s.get(f"{API}/student/events/my-reservations").json()["reservations"]
    my_active = [r for r in res_list if r["event_id"] == event_ctx and r["status"] == "confirmed"]
    assert my_active, "no active reservation to cancel"
    rid = my_active[0]["id"]
    r = s.delete(f"{API}/student/events/reserve/{rid}")
    assert r.status_code == 200, r.text


def test_events_admin_update_and_delete(admin):
    # Standalone event for update/delete test
    r = admin.post(f"{API}/student/events/admin", json={
        "title": "TEST_iter256_to_delete", "type": "festival", "enabled": True
    })
    assert r.status_code == 200
    ev_id = r.json()["event"]["id"]
    r = admin.put(f"{API}/student/events/admin/{ev_id}", json={"title": "TEST_iter256_updated"})
    assert r.status_code == 200
    assert r.json()["event"]["title"] == "TEST_iter256_updated"
    r = admin.delete(f"{API}/student/events/admin/{ev_id}")
    assert r.status_code == 200
    assert r.json()["deleted"] == 1


def test_events_admin_guard_non_admin(user):
    s, _ = user
    r = s.get(f"{API}/student/events/admin/list")
    assert r.status_code in (401, 403)
    r = s.post(f"{API}/student/events/admin", json={"title": "should_fail", "type": "party"})
    assert r.status_code in (401, 403)


def test_events_reserve_invalid_event_404(user):
    s, _ = user
    r = s.post(f"{API}/student/events/reserve", json={"event_id": "nope_xxx", "seats": 1})
    assert r.status_code == 404
