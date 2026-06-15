"""Iter 538 — Admin broadcast notifications (custom notif manager).

Tests the admin CRUD + send endpoints over HTTP (public preview URL):
- GET    /api/admin/notifications/broadcasts (list)
- POST   /api/admin/notifications/broadcasts (create)
- PUT    /api/admin/notifications/broadcasts/{id} (update)
- POST   /api/admin/notifications/broadcasts/{id}/send (send to merchant audience)
- DELETE /api/admin/notifications/broadcasts/{id}
- Non-admin (no auth) is rejected.

Cleanups:
- The broadcast doc is deleted at the end.
- The notifications created during /send are removed from `notifications`
  by `type='announcement'` AND `data.kind='admin_broadcast'` for our bid.
"""
import os
import time
import requests
import pytest


def _load_base():
    b = os.environ.get("REACT_APP_BACKEND_URL")
    if b:
        return b.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.strip().split("=", 1)[1].rstrip("/")
    except FileNotFoundError:
        pass
    return ""


BASE = _load_base()
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@superapp.com"
ADMIN_PWD = "SuperAdmin123!"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PWD},
               timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def test_non_admin_rejected():
    r = requests.get(f"{API}/admin/notifications/broadcasts", timeout=15)
    assert r.status_code in (401, 403), f"unauth must be rejected, got {r.status_code}"


def test_list_returns_items_and_audiences(admin_session):
    r = admin_session.get(f"{API}/admin/notifications/broadcasts", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "items" in data and isinstance(data["items"], list)
    assert "audiences" in data and isinstance(data["audiences"], list)
    vals = {a["value"] for a in data["audiences"]}
    assert {"client", "driver", "merchant", "all"}.issubset(vals)


def test_create_update_send_delete_merchant(admin_session):
    # CREATE
    payload = {
        "title": "TEST_iter538 Annonce",
        "body": "TEST_iter538 — diffusion automatisée (à ignorer).",
        "audience": "merchant",
        "url": "/merchant",
    }
    r = admin_session.post(f"{API}/admin/notifications/broadcasts",
                           json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    bid = created["id"]
    assert created["title"] == payload["title"]
    assert created["audience"] == "merchant"
    assert created["audience_label"]  # localised label
    assert created["sent_count"] == 0
    try:
        # GET list and confirm presence
        r = admin_session.get(f"{API}/admin/notifications/broadcasts", timeout=15)
        assert r.status_code == 200
        assert any(it["id"] == bid for it in r.json()["items"]), "created bid missing from list"

        # UPDATE
        r = admin_session.put(f"{API}/admin/notifications/broadcasts/{bid}",
                              json={"title": "TEST_iter538 Annonce (maj)",
                                    "body": payload["body"],
                                    "audience": "merchant"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["title"] == "TEST_iter538 Annonce (maj)"

        # SEND to merchants only (small audience ~12)
        r = admin_session.post(f"{API}/admin/notifications/broadcasts/{bid}/send",
                               timeout=30)
        assert r.status_code == 200, r.text
        send_resp = r.json()
        assert send_resp.get("ok") is True
        sent_count = send_resp.get("sent", 0)
        assert isinstance(sent_count, int) and sent_count >= 0
        # verify persisted last_sent_at + sent_count
        time.sleep(0.5)
        r = admin_session.get(f"{API}/admin/notifications/broadcasts", timeout=15)
        row = next((it for it in r.json()["items"] if it["id"] == bid), None)
        assert row, "row missing after send"
        assert row["sent_count"] == sent_count
        assert row["last_sent_at"]

        # UPDATE 404 path
        r404 = admin_session.put(
            f"{API}/admin/notifications/broadcasts/nope_{bid}",
            json={"title": "x"}, timeout=15)
        assert r404.status_code == 404

        # SEND 404 path
        r404b = admin_session.post(
            f"{API}/admin/notifications/broadcasts/nope_{bid}/send", timeout=15)
        assert r404b.status_code == 404
    finally:
        # CLEAN: delete broadcast row
        rdel = admin_session.delete(
            f"{API}/admin/notifications/broadcasts/{bid}", timeout=15)
        assert rdel.status_code == 200
        # Also try to clean notifications it generated (best-effort via mongo)
        try:
            from core.config import db
            from conftest import run_async

            async def _purge():
                await db.notifications.delete_many(
                    {"type": "announcement", "data.broadcast_id": bid}
                )
            run_async(_purge())
        except Exception:
            pass


def test_create_validation(admin_session):
    # missing title/body → 400
    r = admin_session.post(f"{API}/admin/notifications/broadcasts",
                           json={"title": "", "body": "", "audience": "merchant"},
                           timeout=15)
    assert r.status_code == 400


def test_create_invalid_audience_defaults_to_client(admin_session):
    r = admin_session.post(f"{API}/admin/notifications/broadcasts",
                           json={"title": "TEST_iter538 inv",
                                 "body": "x", "audience": "bogus"}, timeout=15)
    assert r.status_code in (200, 201)
    bid = r.json()["id"]
    assert r.json()["audience"] == "client"
    admin_session.delete(f"{API}/admin/notifications/broadcasts/{bid}", timeout=15)
