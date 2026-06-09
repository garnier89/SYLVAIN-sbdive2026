"""Iter 199 — Image uploads via Emergent object storage + persistence (merchants/providers).

Covers:
- POST /api/uploads/image: auth (401 sans cookie), accepte PNG, renvoie {id, url}.
- GET  /api/uploads/{id}: PUBLIC (sans cookie), sert l'image avec le bon Content-Type.
- Rejets: format non image -> 400 ; trop lourd (>6 Mo) -> 400.
- PUT /api/merchants/me: image_url + gallery persistent, gallery cappee a 12 elements.
- PUT /api/admin/merchants/{id}: image_url persiste.
- PUT /api/services/admin/providers/{id}: photo + gallery persistent.
"""
import io
import os
import struct
import zlib

import pytest
import requests

def _read_env_url():
    v = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    return ""

BASE = _read_env_url()
assert BASE, "REACT_APP_BACKEND_URL missing"

ADMIN = {"email": "admin@superapp.com", "password": "SuperAdmin123!"}
MERCHANT = {"email": "merchant@example.com", "password": "Merchant123!"}


def _png(width=2, height=2):
    """Return a tiny valid PNG (RGBA)."""
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    raw = b""
    for _ in range(height):
        raw += b"\x00" + b"\xff\x00\x00\xff" * width
    idat = chunk(b"IDAT", zlib.compress(raw))
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


@pytest.fixture(scope="module")
def merchant_sess():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=MERCHANT, timeout=15)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin_sess():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    return s


# ---------- Uploads: POST/GET --------------------------------------------------

def test_upload_requires_auth():
    r = requests.post(f"{BASE}/api/uploads/image",
                      files={"file": ("a.png", _png(), "image/png")}, timeout=20)
    assert r.status_code in (401, 403), r.status_code


def test_upload_rejects_non_image(merchant_sess):
    r = merchant_sess.post(f"{BASE}/api/uploads/image",
                           files={"file": ("hello.txt", b"hello", "text/plain")}, timeout=20)
    assert r.status_code == 400


def test_upload_rejects_too_large(merchant_sess):
    big = b"\x89PNG\r\n\x1a\n" + b"\x00" * (6 * 1024 * 1024 + 10)
    r = merchant_sess.post(f"{BASE}/api/uploads/image",
                           files={"file": ("big.png", big, "image/png")}, timeout=60)
    assert r.status_code == 400


def test_upload_and_public_serve(merchant_sess):
    png = _png()
    r = merchant_sess.post(f"{BASE}/api/uploads/image",
                           files={"file": ("t.png", png, "image/png")}, timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "id" in j and "url" in j
    assert j["url"] == f"/api/uploads/{j['id']}"
    # Public GET (no auth)
    r2 = requests.get(f"{BASE}{j['url']}", timeout=30)
    assert r2.status_code == 200
    assert r2.headers.get("content-type", "").startswith("image/")
    assert r2.content[:8] == b"\x89PNG\r\n\x1a\n"


# ---------- Merchant persistence ----------------------------------------------

def test_merchant_persist_image_and_gallery(merchant_sess):
    # Upload 3 images
    urls = []
    for _ in range(3):
        r = merchant_sess.post(f"{BASE}/api/uploads/image",
                               files={"file": ("g.png", _png(), "image/png")}, timeout=60)
        assert r.status_code == 200
        urls.append(r.json()["url"])
    logo = urls[0]
    gallery = urls[1:]

    # Save vitrine
    r = merchant_sess.put(f"{BASE}/api/merchants/me",
                          json={"image_url": logo, "gallery": gallery}, timeout=20)
    assert r.status_code == 200, r.text
    me_after = r.json()
    assert me_after.get("image_url") == logo
    assert me_after.get("gallery") == gallery

    # Re-fetch via GET /api/merchants/me
    r = merchant_sess.get(f"{BASE}/api/merchants/me", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("image_url") == logo
    assert body.get("gallery") == gallery


def test_merchant_gallery_capped_at_12(merchant_sess):
    fake = [f"/api/uploads/fake{i}" for i in range(20)]
    r = merchant_sess.put(f"{BASE}/api/merchants/me", json={"gallery": fake}, timeout=15)
    assert r.status_code == 200
    assert len(r.json().get("gallery", [])) == 12


# ---------- Admin merchant + provider ----------------------------------------

def test_admin_update_merchant_image(admin_sess, merchant_sess):
    me = merchant_sess.get(f"{BASE}/api/merchants/me", timeout=15).json()
    mid = me.get("id")
    assert mid

    up = admin_sess.post(f"{BASE}/api/uploads/image",
                         files={"file": ("a.png", _png(), "image/png")}, timeout=60)
    assert up.status_code == 200
    url = up.json()["url"]

    r = admin_sess.put(f"{BASE}/api/admin/merchants/{mid}",
                       json={"image_url": url}, timeout=15)
    assert r.status_code == 200, r.text

    # Verify persisted via merchant GET
    me2 = merchant_sess.get(f"{BASE}/api/merchants/me", timeout=15).json()
    assert me2.get("image_url") == url


def test_admin_update_provider_photo_and_gallery(admin_sess):
    # Find any provider, or create one
    r = admin_sess.get(f"{BASE}/api/services/admin/providers", timeout=15)
    assert r.status_code == 200
    lst = r.json()
    if lst:
        pid = lst[0]["id"]
    else:
        r2 = admin_sess.post(f"{BASE}/api/services/admin/providers",
                             json={"name": "TEST_Provider", "category_slug": "menage"}, timeout=15)
        assert r2.status_code == 200, r2.text
        pid = r2.json()["id"]

    up = admin_sess.post(f"{BASE}/api/uploads/image",
                         files={"file": ("p.png", _png(), "image/png")}, timeout=60)
    photo = up.json()["url"]
    up2 = admin_sess.post(f"{BASE}/api/uploads/image",
                          files={"file": ("p2.png", _png(), "image/png")}, timeout=60)
    g1 = up2.json()["url"]

    r3 = admin_sess.put(f"{BASE}/api/services/admin/providers/{pid}",
                        json={"photo": photo, "gallery": [g1]}, timeout=15)
    assert r3.status_code == 200, r3.text
    out = r3.json()
    assert out.get("photo") == photo
    assert out.get("gallery") == [g1]


# ---------- Regression: livechat ----------------------------------------------

def test_livechat_still_works():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": "test2@example.com", "password": "TestPass123!"}, timeout=15)
    assert r.status_code == 200, r.text
    r = s.post(f"{BASE}/api/support/message", json={"text": "Bonjour, test rapide"}, timeout=60)
    assert r.status_code == 200, r.text
    msgs = r.json().get("messages", [])
    # Should include user + ai reply
    senders = [m.get("sender") for m in msgs]
    assert "user" in senders
