"""Backend tests for SB Tracking — Famille module (iteration 375)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "famtester@demo.sb"
PASSWORD = "FamTest123!"


@pytest.fixture(scope="module")
def token():
    s = requests.Session()
    # try login first
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    if r.status_code != 200:
        # register then login
        s.post(f"{API}/auth/register", json={"email": EMAIL, "password": PASSWORD, "name": "Fam Tester"}, timeout=20)
        r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token") or (data.get("user", {}) or {}).get("token")
    assert tok, f"no token in {data}"
    return tok


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


def test_context(client):
    r = client.get(f"{API}/family/context", timeout=20)
    assert r.status_code == 200
    j = r.json()
    assert "circle" in j and "counts" in j
    assert {"members", "places", "unread_alerts"}.issubset(j["counts"].keys())


def test_seed_demo(client):
    r = client.post(f"{API}/family/seed-demo", json={}, timeout=20)
    assert r.status_code == 200
    assert r.json().get("members", 0) >= 2


def test_members_after_seed(client):
    r = client.get(f"{API}/family/members", timeout=20)
    assert r.status_code == 200
    members = r.json().get("members", [])
    assert len(members) >= 2
    # demo positions simulated -> live should have lat/lng
    demo = [m for m in members if m.get("name", "").startswith(("Maman", "Léa"))]
    assert demo, "demo members not found"
    assert demo[0]["live"]["lat"] is not None
    assert demo[0]["invite_code"].startswith("FAM")


def test_add_member_and_delete(client):
    r = client.post(f"{API}/family/members", json={"name": "TEST_Papa", "relation": "Père"}, timeout=20)
    assert r.status_code == 200, r.text
    mid = r.json()["id"]
    # list contains it
    lst = client.get(f"{API}/family/members", timeout=20).json()["members"]
    assert any(m["id"] == mid for m in lst)
    # delete
    d = client.delete(f"{API}/family/members/{mid}", timeout=20)
    assert d.status_code == 200
    lst2 = client.get(f"{API}/family/members", timeout=20).json()["members"]
    assert not any(m["id"] == mid for m in lst2)


def test_add_member_validation(client):
    r = client.post(f"{API}/family/members", json={"name": ""}, timeout=20)
    assert r.status_code == 400


def test_places_crud(client):
    # create
    r = client.post(f"{API}/family/places", json={
        "name": "TEST_Parc", "kind": "other", "lat": 14.61, "lng": -61.07, "radius_m": 150,
    }, timeout=20)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    assert r.json()["radius_m"] == 150
    # list
    lst = client.get(f"{API}/family/places", timeout=20).json()["places"]
    assert any(p["id"] == pid for p in lst)
    # delete
    d = client.delete(f"{API}/family/places/{pid}", timeout=20)
    assert d.status_code == 200
    # delete again -> 404
    d2 = client.delete(f"{API}/family/places/{pid}", timeout=20)
    assert d2.status_code == 404


def test_place_validation(client):
    r = client.post(f"{API}/family/places", json={"name": "x"}, timeout=20)
    assert r.status_code == 400


def test_sos_creates_alert(client):
    before = client.get(f"{API}/family/alerts", timeout=20).json().get("alerts", [])
    r = client.post(f"{API}/family/sos", json={"lat": 14.6, "lng": -61.07}, timeout=20)
    assert r.status_code == 200
    assert "SOS" in r.json().get("message", "")
    after = client.get(f"{API}/family/alerts", timeout=20).json()
    assert len(after["alerts"]) > len(before)
    sos_alerts = [a for a in after["alerts"] if a["type"] == "sos"]
    assert sos_alerts, "no SOS alert created"


def test_alerts_read_all(client):
    # ensure at least 1 unread
    client.post(f"{API}/family/sos", json={}, timeout=20)
    r = client.post(f"{API}/family/alerts/read-all", json={}, timeout=20)
    assert r.status_code == 200
    j = client.get(f"{API}/family/alerts", timeout=20).json()
    assert j["unread"] == 0


def test_join_invalid_code(client):
    r = client.post(f"{API}/family/join", json={"code": "ZZZZZ_NOPE"}, timeout=20)
    assert r.status_code == 404


def test_join_empty_code(client):
    r = client.post(f"{API}/family/join", json={"code": ""}, timeout=20)
    assert r.status_code == 400


def test_join_valid_code():
    """A separate user joins via invite code from famtester's member."""
    s_owner = requests.Session()
    r = s_owner.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    tok_owner = r.json().get("access_token") or r.json().get("token")
    s_owner.headers.update({"Authorization": f"Bearer {tok_owner}", "Content-Type": "application/json"})
    # create a fresh member
    add = s_owner.post(f"{API}/family/members", json={"name": "TEST_JoinSlot", "relation": "Proche"}, timeout=20)
    assert add.status_code == 200
    code = add.json()["invite_code"]
    mid = add.json()["id"]
    # second user
    other_email = "famjoiner@demo.sb"
    other_pwd = "FamJoin123!"
    s_other = requests.Session()
    s_other.post(f"{API}/auth/register", json={"email": other_email, "password": other_pwd, "name": "Joiner"}, timeout=20)
    r2 = s_other.post(f"{API}/auth/login", json={"email": other_email, "password": other_pwd}, timeout=20)
    tok2 = r2.json().get("access_token") or r2.json().get("token")
    s_other.headers.update({"Authorization": f"Bearer {tok2}", "Content-Type": "application/json"})
    j = s_other.post(f"{API}/family/join", json={"code": code}, timeout=20)
    assert j.status_code == 200, j.text
    assert "circle_name" in j.json()
    # cleanup
    s_owner.delete(f"{API}/family/members/{mid}", timeout=20)


def test_sos_notifies_circle_members():
    """When a linked member raises SOS, the circle owner receives a real notification."""
    s_owner = requests.Session()
    r = s_owner.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    tok_owner = r.json().get("access_token") or r.json().get("token")
    s_owner.headers.update({"Authorization": f"Bearer {tok_owner}", "Content-Type": "application/json"})
    add = s_owner.post(f"{API}/family/members", json={"name": "TEST_SosSlot", "relation": "Proche"}, timeout=20)
    assert add.status_code == 200
    code, mid = add.json()["invite_code"], add.json()["id"]

    s_other = requests.Session()
    s_other.post(f"{API}/auth/register", json={"email": "famjoiner@demo.sb", "password": "FamJoin123!", "name": "Joiner"}, timeout=20)
    r2 = s_other.post(f"{API}/auth/login", json={"email": "famjoiner@demo.sb", "password": "FamJoin123!"}, timeout=20)
    tok2 = r2.json().get("access_token") or r2.json().get("token")
    s_other.headers.update({"Authorization": f"Bearer {tok2}", "Content-Type": "application/json"})
    assert s_other.post(f"{API}/family/join", json={"code": code}, timeout=20).status_code == 200

    before = len(s_owner.get(f"{API}/push/list", timeout=20).json())
    sos = s_other.post(f"{API}/family/sos", json={"lat": 14.61, "lng": -61.07}, timeout=20)
    assert sos.status_code == 200, sos.text
    notifs = s_owner.get(f"{API}/push/list", timeout=20).json()
    assert len(notifs) > before
    assert any(n.get("type") == "family_sos" for n in notifs[:3])
    s_owner.delete(f"{API}/family/members/{mid}", timeout=20)


def test_cleanup(client):
    # delete any TEST_ members and places
    for m in client.get(f"{API}/family/members", timeout=20).json().get("members", []):
        if str(m.get("name", "")).startswith("TEST_"):
            client.delete(f"{API}/family/members/{m['id']}", timeout=20)
    for p in client.get(f"{API}/family/places", timeout=20).json().get("places", []):
        if str(p.get("name", "")).startswith("TEST_"):
            client.delete(f"{API}/family/places/{p['id']}", timeout=20)
