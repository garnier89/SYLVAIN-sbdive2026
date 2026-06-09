"""Iter 198 — "Parler en direct" support chat (AI + escalation + admin inbox)."""
import os
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE}/api"

ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}
CLIENT = {"email": "test2@example.com", "password": "TestPass123!"}
MERCHANT = {"email": "merchant@example.com", "password": "Merchant123!"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token")
    assert tok, f"no access_token in login response: {r.text[:200]}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def admin_sess():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def client_sess():
    return _login(CLIENT)


@pytest.fixture(scope="module")
def merchant_sess():
    return _login(MERCHANT)


# ---- 1. Auth presence ---------------------------------------------------
def test_unauth_blocked():
    r = requests.get(f"{API}/support/me", timeout=10)
    assert r.status_code in (401, 403), f"expected auth required, got {r.status_code}"


# ---- 2. Client AI flow --------------------------------------------------
def test_client_message_returns_ai_reply(client_sess):
    # Close any existing thread first so we start clean (best effort)
    me = client_sess.get(f"{API}/support/me", timeout=15)
    assert me.status_code == 200
    body = {"text": "Bonjour, je veux savoir comment réserver une course VTC ?"}
    r = client_sess.post(f"{API}/support/message", json=body, timeout=60)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    assert "thread_id" in d and "messages" in d
    assert d.get("status") in ("ai", "escalated")  # likely 'ai' on fresh thread
    senders = [m["sender"] for m in d["messages"]]
    assert "user" in senders, f"user msg missing: {senders}"
    if d["status"] == "ai":
        assert "ai" in senders, f"AI reply missing while status=ai: {senders}"
        ai_msg = next(m for m in d["messages"] if m["sender"] == "ai")
        assert isinstance(ai_msg["text"], str) and len(ai_msg["text"]) > 0


def test_client_get_me_returns_thread_and_history(client_sess):
    r = client_sess.get(f"{API}/support/me", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["thread"] is not None
    assert isinstance(d["messages"], list) and len(d["messages"]) >= 1
    # _id stripped
    for m in d["messages"]:
        assert "_id" not in m


# ---- 3. Escalation cuts off AI -----------------------------------------
def test_escalate_then_message_no_ai(client_sess):
    r = client_sess.post(f"{API}/support/escalate", timeout=15)
    assert r.status_code == 200
    assert r.json().get("status") == "escalated"

    # verify thread is escalated
    me = client_sess.get(f"{API}/support/me", timeout=15).json()
    assert me["thread"]["status"] == "escalated"
    pre_unread = int(me["thread"].get("unread_admin", 0))

    r = client_sess.post(f"{API}/support/message",
                         json={"text": "Pouvez-vous me rembourser ma dernière course ?"}, timeout=30)
    assert r.status_code == 200
    d = r.json()
    senders = [m["sender"] for m in d["messages"]]
    assert senders == ["user"], f"expected only user msg, got {senders}"

    me2 = client_sess.get(f"{API}/support/me", timeout=15).json()
    assert me2["thread"]["status"] == "escalated"
    assert int(me2["thread"].get("unread_admin", 0)) >= pre_unread + 1


# ---- 4. Admin inbox -----------------------------------------------------
def test_admin_lists_escalated_and_replies_and_closes(admin_sess, client_sess):
    # ensure client has an escalated thread (from previous test) — fetch its id
    me = client_sess.get(f"{API}/support/me", timeout=15).json()
    assert me["thread"] is not None
    thread_id = me["thread"]["id"]

    r = admin_sess.get(f"{API}/support/admin/threads?status=escalated", timeout=15)
    assert r.status_code == 200
    arr = r.json()
    ids = [t["id"] for t in arr]
    assert thread_id in ids, f"escalated thread {thread_id} missing from admin list {ids}"

    # fetch messages
    r = admin_sess.get(f"{API}/support/admin/threads/{thread_id}", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["thread"]["id"] == thread_id
    assert isinstance(d["messages"], list) and len(d["messages"]) >= 1

    # empty message rejected
    r0 = admin_sess.post(f"{API}/support/admin/threads/{thread_id}/reply",
                        json={"text": "   "}, timeout=15)
    assert r0.status_code == 400

    # agent reply
    r = admin_sess.post(f"{API}/support/admin/threads/{thread_id}/reply",
                       json={"text": "Bonjour, je suis Marc du support, je regarde votre dossier."}, timeout=15)
    assert r.status_code == 200
    assert r.json()["message"]["sender"] == "agent"

    # client should see the agent reply
    me2 = client_sess.get(f"{API}/support/me", timeout=15).json()
    senders = [m["sender"] for m in me2["messages"]]
    assert "agent" in senders, f"agent reply not visible to client: {senders}"
    # unread_user incremented (then reset by GET → so we check messages instead)

    # close
    r = admin_sess.post(f"{API}/support/admin/threads/{thread_id}/close", timeout=15)
    assert r.status_code == 200
    assert r.json().get("status") == "closed"

    # client's active thread should be gone now (closed filtered out by _get_active_thread)
    me3 = client_sess.get(f"{API}/support/me", timeout=15).json()
    assert me3["thread"] is None or me3["thread"]["status"] != "closed" or True
    # explicit check: should be None since closed
    assert me3["thread"] is None


# ---- 5. Non-admin cannot access admin endpoints -------------------------
def test_non_admin_blocked_from_admin_endpoints(client_sess):
    r = client_sess.get(f"{API}/support/admin/threads", timeout=10)
    assert r.status_code in (401, 403)


# ---- 6. Empty message rejected ------------------------------------------
def test_empty_message_rejected(client_sess):
    r = client_sess.post(f"{API}/support/message", json={"text": ""}, timeout=10)
    assert r.status_code == 400


# ---- 7. Merchant role works --------------------------------------------
def test_merchant_can_chat(merchant_sess):
    r = merchant_sess.post(f"{API}/support/message",
                          json={"text": "Comment activer la réduction flash dans ma boutique ?"}, timeout=60)
    assert r.status_code == 200
    d = r.json()
    senders = [m["sender"] for m in d["messages"]]
    assert "user" in senders
    # cleanup — close via admin
    me = merchant_sess.get(f"{API}/support/me", timeout=15).json()
    tid = me["thread"]["id"]
    admin = _login(ADMIN)
    admin.post(f"{API}/support/admin/threads/{tid}/close", timeout=10)
