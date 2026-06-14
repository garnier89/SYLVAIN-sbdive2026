"""Iter 397 — Pet care: CARNET DE SANTÉ NUMÉRIQUE.
Backend tests for /api/pet-care/pets/{pet_id}/health (GET/POST), DELETE, and reminders.
"""
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
EMAIL = "famtester@demo.sb"
PASSWORD = "FamTest123!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/email/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    if r.status_code != 200:
        # Fallback to alternate login route names
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def pet_id(session):
    r = session.get(f"{BASE_URL}/api/pet-care/pets", timeout=10)
    assert r.status_code == 200
    pets = r.json()
    if not pets:
        # Create a pet
        c = session.post(f"{BASE_URL}/api/pet-care/pets", json={"name": "TestRex", "species": "Chien"}, timeout=10)
        assert c.status_code in (200, 201)
        pet = c.json()
        return pet["id"]
    return pets[0]["id"]


class TestHealthGet:
    def test_grouped_view(self, session, pet_id):
        r = session.get(f"{BASE_URL}/api/pet-care/pets/{pet_id}/health", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("pet", "vaccines", "treatments", "documents", "weights", "reminders"):
            assert k in data, f"missing key {k}"
        assert isinstance(data["vaccines"], list)


class TestHealthCreate:
    def test_vaccine_requires_name(self, session, pet_id):
        r = session.post(f"{BASE_URL}/api/pet-care/pets/{pet_id}/health",
                         json={"kind": "vaccine"}, timeout=10)
        assert r.status_code == 400

    def test_create_vaccine(self, session, pet_id):
        future = (datetime.now(timezone.utc) + timedelta(days=10)).strftime("%Y-%m-%d")
        r = session.post(f"{BASE_URL}/api/pet-care/pets/{pet_id}/health",
                         json={"kind": "vaccine", "name": "TEST_Rage",
                               "date": "2026-01-01", "next_due": future}, timeout=10)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["kind"] == "vaccine"
        assert rec["name"] == "TEST_Rage"
        assert rec["next_due"] == future
        # Verify persisted via GET
        g = session.get(f"{BASE_URL}/api/pet-care/pets/{pet_id}/health", timeout=10).json()
        assert any(v["id"] == rec["id"] for v in g["vaccines"])
        # Cleanup
        session.delete(f"{BASE_URL}/api/pet-care/health/{rec['id']}", timeout=10)

    def test_create_weight(self, session, pet_id):
        r = session.post(f"{BASE_URL}/api/pet-care/pets/{pet_id}/health",
                         json={"kind": "weight", "weight": "28", "date": "2026-01-15"}, timeout=10)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["kind"] == "weight"
        assert str(rec["weight"]) == "28"
        session.delete(f"{BASE_URL}/api/pet-care/health/{rec['id']}", timeout=10)

    def test_weight_requires_weight(self, session, pet_id):
        r = session.post(f"{BASE_URL}/api/pet-care/pets/{pet_id}/health",
                         json={"kind": "weight"}, timeout=10)
        assert r.status_code == 400

    def test_document_requires_url(self, session, pet_id):
        r = session.post(f"{BASE_URL}/api/pet-care/pets/{pet_id}/health",
                         json={"kind": "document", "name": "Ordonnance"}, timeout=10)
        assert r.status_code == 400

    def test_create_document(self, session, pet_id):
        r = session.post(f"{BASE_URL}/api/pet-care/pets/{pet_id}/health",
                         json={"kind": "document", "name": "TEST_Ordonnance",
                               "url": "https://example.com/test.png"}, timeout=10)
        assert r.status_code == 200, r.text
        rec = r.json()
        session.delete(f"{BASE_URL}/api/pet-care/health/{rec['id']}", timeout=10)

    def test_invalid_kind(self, session, pet_id):
        r = session.post(f"{BASE_URL}/api/pet-care/pets/{pet_id}/health",
                         json={"kind": "xxx"}, timeout=10)
        assert r.status_code == 400


class TestHealthDelete:
    def test_delete_record(self, session, pet_id):
        r = session.post(f"{BASE_URL}/api/pet-care/pets/{pet_id}/health",
                         json={"kind": "treatment", "name": "TEST_Vermifuge"}, timeout=10)
        rec = r.json()
        d = session.delete(f"{BASE_URL}/api/pet-care/health/{rec['id']}", timeout=10)
        assert d.status_code == 200
        # Verify removed
        g = session.get(f"{BASE_URL}/api/pet-care/pets/{pet_id}/health", timeout=10).json()
        assert not any(v["id"] == rec["id"] for v in g["treatments"])

    def test_delete_404(self, session):
        d = session.delete(f"{BASE_URL}/api/pet-care/health/ph_nonexistent_xx", timeout=10)
        assert d.status_code == 404


class TestReminders:
    def test_reminders_list(self, session, pet_id):
        # Create a soon-due vaccine
        future = (datetime.now(timezone.utc) + timedelta(days=5)).strftime("%Y-%m-%d")
        r = session.post(f"{BASE_URL}/api/pet-care/pets/{pet_id}/health",
                         json={"kind": "vaccine", "name": "TEST_Soon",
                               "next_due": future}, timeout=10)
        rec = r.json()
        lst = session.get(f"{BASE_URL}/api/pet-care/health/reminders", timeout=10)
        assert lst.status_code == 200
        items = lst.json()
        assert isinstance(items, list)
        assert any(it["id"] == rec["id"] for it in items)
        session.delete(f"{BASE_URL}/api/pet-care/health/{rec['id']}", timeout=10)
