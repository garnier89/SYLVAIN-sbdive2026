"""Iter298 — Tuile « Reprendre » : endpoint dernière commande de livraison."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gojek-clone-41.preview.emergentagent.com").rstrip("/")
USER_EMAIL = "paul.vendeur@example.com"
USER_PASSWORD = "Test1234!"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def test_last_delivery_shape():
    """L'endpoint renvoie has_order + mode + champs selon le mode (active/reorder)."""
    t = _login(USER_EMAIL, USER_PASSWORD)
    r = requests.get(f"{BASE_URL}/api/orders/last-delivery", headers=_h(t), timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "has_order" in data
    if data["has_order"]:
        assert data.get("mode") in ("active", "reorder")
        assert data.get("order_id") and data.get("merchant_id")
        if data["mode"] == "active":
            # Suivi live : statut + libellé + barre de progression
            assert data.get("status") and data.get("status_label")
            assert isinstance(data.get("step"), int) and 0 <= data["step"] <= 3
            assert data.get("steps") == ["Reçue", "Préparation", "En route", "Livrée"]
        else:
            # Re-commande 1-tap : articles au format panier
            assert isinstance(data["items"], list)
            for it in data["items"]:
                assert it.get("id") and "price" in it and "quantity" in it


def test_last_delivery_requires_auth():
    r = requests.get(f"{BASE_URL}/api/orders/last-delivery", timeout=15)
    assert r.status_code in (401, 403)
