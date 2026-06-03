"""Iter78: Admin User Documents endpoints (GET/POST/DELETE).

Acceptance criteria:
- GET /api/admin/users/{id}/documents -> {user, documents: [], total}
- POST /api/admin/users/{id}/documents (with file_url) -> creates doc, status='pending_review'
- POST without file_url -> 400
- POST on missing user -> 404
- DELETE /api/admin/users/{id}/documents/{doc_id} -> removes doc
- DELETE missing doc -> 404
- After POST, GET returns total >= 1
- After DELETE, GET returns total back to 0
"""
import os
import secrets as _s
import requests
import pytest

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://taxi-marketplace-3.preview.emergentagent.com",
).rstrip("/")
from _creds import ADMIN_EMAIL, ADMIN_PASSWORD  # noqa: E402
TINY_PNG_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return s


@pytest.fixture()
def created_user(admin_session):
    suffix = _s.token_hex(3)
    payload = {
        "first_name": "TEST_Iter78",
        "last_name": "Docs",
        "email": f"test_iter78_{suffix}@example.com",
        "password": "Iter78Pass!",
        "country": "FR",
        "phone_code": "+33",
        "phone": f"6{_s.randbelow(10**8):08d}",
        "language": "fr",
        "currency": "EUR",
    }
    r = admin_session.post(f"{BASE_URL}/api/admin/users", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    yield uid
    admin_session.delete(f"{BASE_URL}/api/admin/users/{uid}", timeout=15)


# ---------- GET ----------
def test_get_documents_empty(admin_session, created_user):
    r = admin_session.get(
        f"{BASE_URL}/api/admin/users/{created_user}/documents", timeout=15
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "user" in data and "documents" in data and "total" in data
    assert isinstance(data["documents"], list)
    assert data["total"] == 0
    assert data["user"].get("email", "").startswith("test_iter78_")


def test_get_documents_user_not_found(admin_session):
    r = admin_session.get(
        f"{BASE_URL}/api/admin/users/user_does_not_exist_999/documents", timeout=15
    )
    assert r.status_code == 404


# ---------- POST ----------
def test_post_document_success(admin_session, created_user):
    r = admin_session.post(
        f"{BASE_URL}/api/admin/users/{created_user}/documents",
        json={
            "type": "id_card",
            "label": "Carte d'identite",
            "file_url": TINY_PNG_DATA_URL,
            "mime_type": "image/png",
        },
        timeout=20,
    )
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["id"].startswith("doc_")
    assert doc["user_id"] == created_user
    assert doc["type"] == "id_card"
    assert doc["label"] == "Carte d'identite"
    assert doc["file_url"] == TINY_PNG_DATA_URL
    assert doc["mime_type"] == "image/png"
    assert doc["status"] == "pending_review"
    assert doc["uploaded_by"] == "admin"
    assert doc.get("uploaded_at")

    # Verify persistence via GET
    g = admin_session.get(
        f"{BASE_URL}/api/admin/users/{created_user}/documents", timeout=15
    )
    assert g.status_code == 200
    payload = g.json()
    assert payload["total"] == 1
    assert payload["documents"][0]["id"] == doc["id"]


def test_post_document_missing_file_url(admin_session, created_user):
    r = admin_session.post(
        f"{BASE_URL}/api/admin/users/{created_user}/documents",
        json={"type": "id_card", "label": "No file"},
        timeout=15,
    )
    assert r.status_code == 400
    assert "file_url" in r.text.lower()


def test_post_document_user_not_found(admin_session):
    r = admin_session.post(
        f"{BASE_URL}/api/admin/users/user_does_not_exist_999/documents",
        json={"file_url": TINY_PNG_DATA_URL},
        timeout=15,
    )
    assert r.status_code == 404


# ---------- DELETE ----------
def test_delete_document_success(admin_session, created_user):
    # First create
    r = admin_session.post(
        f"{BASE_URL}/api/admin/users/{created_user}/documents",
        json={"file_url": TINY_PNG_DATA_URL, "type": "other", "label": "TBD"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    doc_id = r.json()["id"]

    # Delete
    d = admin_session.delete(
        f"{BASE_URL}/api/admin/users/{created_user}/documents/{doc_id}", timeout=15
    )
    assert d.status_code == 200, d.text
    assert d.json().get("deleted") is True

    # Verify removed
    g = admin_session.get(
        f"{BASE_URL}/api/admin/users/{created_user}/documents", timeout=15
    )
    assert g.status_code == 200
    assert g.json()["total"] == 0


def test_delete_document_not_found(admin_session, created_user):
    r = admin_session.delete(
        f"{BASE_URL}/api/admin/users/{created_user}/documents/doc_does_not_exist",
        timeout=15,
    )
    assert r.status_code == 404


# ---------- SYNTHETIC PROFILE DOC ----------
def test_get_documents_includes_synthetic_profile_when_avatar(admin_session, created_user):
    # Set avatar_url
    r = admin_session.put(
        f"{BASE_URL}/api/admin/users/{created_user}",
        json={"avatar_url": TINY_PNG_DATA_URL},
        timeout=15,
    )
    assert r.status_code == 200, r.text

    g = admin_session.get(
        f"{BASE_URL}/api/admin/users/{created_user}/documents", timeout=15
    )
    assert g.status_code == 200
    payload = g.json()
    # Synthetic profile doc should be prepended
    assert len(payload["documents"]) >= 1
    profile = payload["documents"][0]
    assert profile["type"] == "profile"
    assert profile["id"] == f"profile_{created_user}"
    assert profile["file_url"] == TINY_PNG_DATA_URL


def test_full_crud_flow(admin_session, created_user):
    # 1) Initial GET -> empty
    g0 = admin_session.get(
        f"{BASE_URL}/api/admin/users/{created_user}/documents", timeout=15
    )
    assert g0.status_code == 200 and g0.json()["total"] == 0

    # 2) POST 2 docs
    r1 = admin_session.post(
        f"{BASE_URL}/api/admin/users/{created_user}/documents",
        json={"file_url": TINY_PNG_DATA_URL, "type": "id_card", "label": "ID"},
        timeout=15,
    )
    r2 = admin_session.post(
        f"{BASE_URL}/api/admin/users/{created_user}/documents",
        json={"file_url": TINY_PNG_DATA_URL, "type": "license", "label": "Permis"},
        timeout=15,
    )
    assert r1.status_code == 200 and r2.status_code == 200
    doc1, doc2 = r1.json()["id"], r2.json()["id"]

    # 3) GET -> total == 2
    g1 = admin_session.get(
        f"{BASE_URL}/api/admin/users/{created_user}/documents", timeout=15
    )
    assert g1.json()["total"] == 2

    # 4) DELETE one
    admin_session.delete(
        f"{BASE_URL}/api/admin/users/{created_user}/documents/{doc1}", timeout=15
    )

    # 5) GET -> total == 1, remaining is doc2
    g2 = admin_session.get(
        f"{BASE_URL}/api/admin/users/{created_user}/documents", timeout=15
    )
    assert g2.json()["total"] == 1
    assert g2.json()["documents"][0]["id"] == doc2
