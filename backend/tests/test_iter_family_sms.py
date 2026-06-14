"""SB Urgences — alerte SMS Twilio aux proches (cercle Famille).

Vérifie le câblage : notify_user_circles(sms=True) récupère les numéros des proches
reliés et appelle send_sms_to_many ; SOS idem. L'envoi Twilio réel est mocké pour
ne pas dépenser de crédit ni dépendre du réseau pendant les tests.
"""
import uuid
import pytest
import core.sms as sms
from core.config import db
from routes import family
from conftest import run_async


def _now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


@pytest.fixture
def fam_setup():
    """Crée un propriétaire de cercle + un proche relié avec un numéro de téléphone."""
    owner_id = f"user_{uuid.uuid4().hex[:12]}"
    proche_id = f"user_{uuid.uuid4().hex[:12]}"
    circle_id = f"fam_{uuid.uuid4().hex[:12]}"
    phone = "+33611223344"

    async def setup():
        await db.users.insert_one({"id": owner_id, "email": f"{owner_id}@t.sb", "name": "Owner", "phone": "+33600000000"})
        await db.users.insert_one({"id": proche_id, "email": f"{proche_id}@t.sb", "name": "Proche", "phone": phone})
        await db.family_circles.insert_one({"id": circle_id, "owner_id": owner_id, "name": "Test", "center": {"lat": 14.6, "lng": -61.0}, "created_at": _now()})
        await db.family_members.insert_one({"id": f"mem_{uuid.uuid4().hex[:8]}", "circle_id": circle_id, "name": "Proche", "user_id": proche_id, "is_self": False, "created_at": _now()})
    run_async(setup())
    yield {"owner_id": owner_id, "proche_id": proche_id, "circle_id": circle_id, "phone": phone}

    async def teardown():
        await db.users.delete_many({"id": {"$in": [owner_id, proche_id]}})
        await db.family_circles.delete_one({"id": circle_id})
        await db.family_members.delete_many({"circle_id": circle_id})
        await db.family_alerts.delete_many({"circle_id": circle_id})
    run_async(teardown())


def test_users_phones_lookup(fam_setup):
    phones = run_async(family._users_phones({fam_setup["proche_id"]}))
    assert fam_setup["phone"] in phones


def test_notify_user_circles_sends_sms(fam_setup, monkeypatch):
    captured = {}

    async def fake_bulk(phones, body):
        captured["phones"] = list(phones)
        captured["body"] = body
        return len(phones)

    monkeypatch.setattr(sms, "sms_enabled", lambda: True)
    monkeypatch.setattr(sms, "send_sms_to_many", fake_bulk)

    owner = {"id": fam_setup["owner_id"], "name": "Owner"}
    res = run_async(family.notify_user_circles(
        owner, "ambulance_alert", "🚑 Ambulance", "Un proche a demandé une ambulance.",
        lat=14.61, lng=-61.05, alert_type="sos", sms=True,
        sms_body="SB Urgences : ambulance demandee."))

    assert res["notified"] == 1
    assert res["sms_sent"] == 1
    assert fam_setup["phone"] in captured["phones"]
    # Le lien Google Maps doit être joint au SMS.
    assert "maps.google.com/?q=14.61,-61.05" in captured["body"]
    assert "SB Urgences" in captured["body"]


def test_notify_no_sms_when_flag_off(fam_setup, monkeypatch):
    called = {"n": 0}

    async def fake_bulk(phones, body):
        called["n"] += 1
        return 0

    monkeypatch.setattr(sms, "sms_enabled", lambda: True)
    monkeypatch.setattr(sms, "send_sms_to_many", fake_bulk)

    owner = {"id": fam_setup["owner_id"], "name": "Owner"}
    res = run_async(family.notify_user_circles(
        owner, "family_place", "Famille", "Léa est arrivée.", sms=False))

    assert res["sms_sent"] == 0
    assert called["n"] == 0  # SMS jamais appelé pour les alertes non urgentes
