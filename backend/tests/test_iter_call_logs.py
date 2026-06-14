"""Journal des appels masqués (admin) — agrégation KPIs + filtres.

Vérifie que l'endpoint /admin/calls calcule correctement les compteurs
(WebRTC vs Relais, aboutis, manqués, durée moyenne, taux de réponse) à partir
de la collection masked_call_logs, et que les filtres canal/statut fonctionnent.
"""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

import pytest

from core.config import db
from routes.calls_admin import list_calls


class _FakeReq:
    """Request factice : court-circuite require_role en simulant un admin."""
    def __init__(self):
        self.state = type("S", (), {})()


@pytest.fixture
def seed(monkeypatch):
    # Bypass auth
    async def _ok(*a, **k):
        return {"id": "admin", "role": "admin"}
    monkeypatch.setattr("routes.calls_admin.require_role", _ok)

    now = datetime.now(timezone.utc)
    tag = f"ride_t_{uuid.uuid4().hex[:6]}"
    docs = [
        dict(channel="webrtc", status="ended", duration_seconds=60),
        dict(channel="webrtc", status="ended", duration_seconds=120),
        dict(channel="webrtc", status="no_answer", duration_seconds=0),
        dict(channel="relay", status="relayed", duration_seconds=0),
    ]

    async def _ins():
        for i, d in enumerate(docs):
            await db.masked_call_logs.insert_one({
                "id": uuid.uuid4().hex, "call_id": uuid.uuid4().hex[:16],
                "ride_id": f"{tag}_{i}", "caller_id": f"u{i}", "caller_name": "Jean",
                "counterpart_id": f"c{i}", "counterpart_name": "Sophie",
                "counterpart_online": True,
                "created_at": (now - timedelta(minutes=i)).isoformat(),
                "updated_at": now.isoformat(), **d})
    asyncio.get_event_loop().run_until_complete(_ins())
    yield tag
    asyncio.get_event_loop().run_until_complete(
        db.masked_call_logs.delete_many({"ride_id": {"$regex": f"^{tag}"}}))


def test_kpis_and_filters(seed):
    tag = seed
    loop = asyncio.get_event_loop()

    # Filtre par recherche q=tag pour isoler nos docs de test
    res = loop.run_until_complete(list_calls(_FakeReq(), q=tag))
    k = res["kpis"]
    assert k["total"] == 4
    assert k["webrtc"] == 3 and k["relay"] == 1
    assert k["connected"] == 2          # deux 'ended'
    assert k["missed"] == 1             # un 'no_answer'
    assert k["avg_duration"] == 90      # (60+120)/2
    assert k["answer_rate"] == 50       # 2/4

    # Filtre canal=relay
    res_relay = loop.run_until_complete(list_calls(_FakeReq(), q=tag, channel="relay"))
    assert res_relay["kpis"]["total"] == 1
    assert all(c["channel"] == "relay" for c in res_relay["calls"])

    # Filtre statut=ended
    res_ended = loop.run_until_complete(list_calls(_FakeReq(), q=tag, status="ended"))
    assert res_ended["kpis"]["total"] == 2
    assert all(c["status"] == "ended" for c in res_ended["calls"])
