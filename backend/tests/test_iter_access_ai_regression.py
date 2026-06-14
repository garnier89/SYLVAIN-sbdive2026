"""Régression — moteur IA Access (core/access_ai.py).

Garantit le comportement AVANT refactoring : haversine, adéquation besoins,
classement des chauffeurs (score, préférence en ligne, distance) et prédiction
de demande (matrice 7×24, pics, jour le plus chargé). In-process via run_async.
"""
import uuid

from conftest import run_async
from core import access_ai as ai


# ───────────── helpers purs ─────────────
def test_haversine_known_distance_and_none():
    # Paris (48.8566,2.3522) → Lyon (45.7640,4.8357) ≈ 392 km
    d = ai._haversine_km(48.8566, 2.3522, 45.7640, 4.8357)
    assert 380 < d < 405, d
    assert ai._haversine_km(None, 2.0, 3.0, 4.0) is None


def test_needs_match_score():
    # aucun besoin → neutre/parfait
    score, covered = ai._needs_match_score([], ["formation X"])
    assert score == 1.0 and covered == []
    # fauteuil couvert par une formation contenant "rampe"
    score, covered = ai._needs_match_score(["wheelchair_manual"], ["Manipulation rampe et transfert"])
    assert score == 1.0 and "wheelchair" in covered
    # besoin visuel non couvert
    score, covered = ai._needs_match_score(["blind"], ["formation fauteuil seulement"])
    assert score == 0.0 and covered == []
    # 2 besoins (catégories différentes), 1 seule couverte → 0.5
    score, covered = ai._needs_match_score(["wheelchair_manual", "blind"], ["rampe pmr"])
    assert score == 0.5 and covered == ["wheelchair"]


# ───────────── rank_access_drivers (DB) ─────────────
async def _seed_driver(db, uid, *, lat, lng, online, rating, trainings):
    await db.users.insert_one({
        "id": uid, "email": f"{uid}@acc.test", "role": "driver", "access_certified": True, "name": f"Drv {uid[-4:]}",
        "access_photo": None, "access_bio": "bio", "access_trainings": trainings,
    })
    await db.drivers.insert_one({
        "user_id": uid, "current_lat": lat, "current_lng": lng,
        "is_online": online, "rating": rating,
    })


async def _cleanup_drivers(db, uids):
    await db.users.delete_many({"id": {"$in": uids}})
    await db.drivers.delete_many({"user_id": {"$in": uids}})


def test_rank_orders_by_score_and_prefers_online_for_immediate():
    async def scenario():
        from core.config import db
        near = f"acc_near_{uuid.uuid4().hex[:6]}"
        far = f"acc_far_{uuid.uuid4().hex[:6]}"
        offline = f"acc_off_{uuid.uuid4().hex[:6]}"
        uids = [near, far, offline]
        pickup = {"lat": 14.60, "lng": -61.07}
        try:
            # near : proche, en ligne, bien noté, formé fauteuil
            await _seed_driver(db, near, lat=14.61, lng=-61.06, online=True, rating=5.0, trainings=["Rampe PMR fauteuil"])
            # far : loin, en ligne, note moyenne, non formé
            await _seed_driver(db, far, lat=14.90, lng=-61.40, online=True, rating=4.0, trainings=["divers"])
            # offline : très proche mais hors ligne
            await _seed_driver(db, offline, lat=14.601, lng=-61.071, online=False, rating=5.0, trainings=["Rampe PMR"])

            res = await ai.rank_access_drivers(
                {"pickup": pickup, "needs": ["wheelchair_manual"]},  # immédiat (pas de scheduled_at)
                settings={}, limit=10,
            )
            ids = [r["driver_id"] for r in res]
            # Demande immédiate + require_online_for_immediate (défaut True) → l'offline est exclu s'il y a des en-ligne
            assert offline not in ids, ids
            assert near in ids and far in ids
            # near devant far (plus proche + formé)
            assert ids.index(near) < ids.index(far)
            # score décroissant
            scores = [r["score"] for r in res]
            assert scores == sorted(scores, reverse=True)
            # near : besoin fauteuil couvert → needs breakdown 100
            near_row = next(r for r in res if r["driver_id"] == near)
            assert near_row["score_breakdown"]["needs"] == 100.0
            assert near_row["online"] is True
            assert near_row["distance_km"] is not None
        finally:
            await _cleanup_drivers(db, uids)
    run_async(scenario())


def test_rank_scheduled_keeps_offline_drivers():
    async def scenario():
        from core.config import db
        on = f"acc_on_{uuid.uuid4().hex[:6]}"
        off = f"acc_off_{uuid.uuid4().hex[:6]}"
        uids = [on, off]
        try:
            await _seed_driver(db, on, lat=14.61, lng=-61.06, online=True, rating=4.5, trainings=["Rampe PMR"])
            await _seed_driver(db, off, lat=14.605, lng=-61.065, online=False, rating=5.0, trainings=["Rampe PMR"])
            # scheduled_at fourni → PAS de filtre online : les 2 doivent apparaître
            res = await ai.rank_access_drivers(
                {"pickup": {"lat": 14.60, "lng": -61.07}, "needs": ["wheelchair_manual"], "scheduled_at": "2030-01-01T10:00:00+00:00"},
                settings={}, limit=10,
            )
            ids = [r["driver_id"] for r in res]
            assert on in ids and off in ids, ids
        finally:
            await _cleanup_drivers(db, uids)
    run_async(scenario())


def test_rank_empty_when_no_certified_drivers():
    async def scenario():
        # filtre besoin improbable sur pickup absurde : on vérifie surtout que
        # la fonction renvoie une liste (jamais d'exception) même sans pickup.
        res = await ai.rank_access_drivers({"pickup": {}, "needs": []}, settings={}, limit=5)
        assert isinstance(res, list)
    run_async(scenario())


# ───────────── predict_access_demand (DB, deltas robustes) ─────────────
def test_predict_demand_counts_into_matrix_and_peaks():
    async def scenario():
        from core.config import db
        tag = f"pred_{uuid.uuid4().hex[:8]}"
        # 2026-06-08 = lundi (weekday 0), 09h ; on insère 3 réservations sur ce créneau
        slot_iso = "2026-06-08T09:30:00+00:00"
        ids = []
        try:
            base = await ai.predict_access_demand()
            before = base["matrix"][0][9]
            before_total = base["total_bookings"]
            for _ in range(3):
                oid = f"{tag}_{uuid.uuid4().hex[:6]}"
                ids.append(oid)
                await db.access_bookings.insert_one({
                    "id": oid, "matched_driver_id": None,
                    "scheduled_at": slot_iso, "created_at": slot_iso, "trip_type": "wheelchair",
                })
            after = await ai.predict_access_demand()
            assert after["matrix"][0][9] == before + 3
            assert after["total_bookings"] == before_total + 3
            assert after["by_weekday"][0] >= 3
            assert after["by_hour"][9] >= 3
            assert after["by_type"].get("wheelchair", 0) >= 3
            # structure
            assert len(after["matrix"]) == 7 and len(after["matrix"][0]) == 24
            assert len(after["levels"]) == 7 and len(after["levels"][0]) == 24
            assert after["day_labels"][0] == "Lundi"
        finally:
            await db.access_bookings.delete_many({"id": {"$in": ids}})
    run_async(scenario())
