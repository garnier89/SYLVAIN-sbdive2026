"""SB Drive Access — Moteur d'IA d'attribution des chauffeurs PMR + prédiction de la demande.

Le scoring est **déterministe** (zéro hallucination) : on classe les chauffeurs certifiés
Access selon des critères pondérés (proximité, note, adéquation des formations aux besoins
déclarés, fiabilité). L'IA générative (Gemini via Emergent LLM key) sert uniquement à produire
une *narration* lisible de la prédiction de demande pour l'admin — jamais à choisir un chauffeur.

Particularité du module : les chauffeurs Access vivent dans `db.users` (role=driver,
access_certified=True) tandis que leur position / statut en ligne / note vivent dans
`db.drivers` (clé `user_id`). Ce moteur fait la jointure.
"""
import math
import os
from datetime import datetime
from collections import defaultdict

from core.config import db, logger

# Pondérations par défaut (réglables par l'admin via les settings Access).
DEFAULT_AI_CONFIG = {
    "enabled": True,
    "weight_distance": 0.40,
    "weight_rating": 0.25,
    "weight_needs": 0.25,
    "weight_reliability": 0.10,
    "max_radius_km": 25.0,
    "require_online_for_immediate": True,
}

# Mappe chaque besoin déclaré → catégorie d'aptitude attendue chez le chauffeur.
NEED_TO_CATEGORY = {
    "wheelchair_manual": "wheelchair", "wheelchair_electric": "wheelchair",
    "walker": "wheelchair", "cane": "wheelchair", "stairs_difficulty": "wheelchair",
    "low_vision": "visual", "blind": "visual", "guide_animal": "visual",
    "hard_of_hearing": "auditory", "deaf": "auditory",
    "enhanced_assistance": "cognitive", "specific_support": "cognitive",
}

# Mots-clés de formation reconnus par catégorie (recherche insensible à la casse/accents simples).
CATEGORY_KEYWORDS = {
    "wheelchair": ["fauteuil", "pmr", "rampe", "transfert", "ancrage", "plateforme", "mobilite", "mobilité"],
    "visual": ["malvoyant", "non-voyant", "non voyant", "aveugle", "visuel", "guidage", "guide", "braille"],
    "auditory": ["signe", "lsf", "auditif", "malentendant", "sourd"],
    "cognitive": ["cognitif", "accompagnement", "autisme", "secours", "premiers secours", "bientraitance", "assistance"],
}

CATEGORY_LABELS = {
    "wheelchair": "manipulation fauteuil / PMR",
    "visual": "guidage déficience visuelle",
    "auditory": "communication malentendants (LSF)",
    "cognitive": "accompagnement cognitif",
}


def _haversine_km(lat1, lng1, lat2, lng2):
    if None in (lat1, lng1, lat2, lng2):
        return None
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _need_categories(needs: list) -> set:
    return {NEED_TO_CATEGORY[n] for n in (needs or []) if n in NEED_TO_CATEGORY}


def _needs_match_score(needs: list, trainings: list):
    """Fraction des catégories de besoin couvertes par au moins une formation du chauffeur.
    Renvoie (score 0..1, liste des catégories couvertes)."""
    cats = _need_categories(needs)
    if not cats:
        return 1.0, []   # aucun besoin spécifique → neutre/parfait
    blob = " ".join(str(t) for t in (trainings or [])).lower()
    covered = []
    for c in cats:
        if any(kw in blob for kw in CATEGORY_KEYWORDS.get(c, [])):
            covered.append(c)
    return (len(covered) / len(cats)), covered


def _ai_config(settings: dict) -> dict:
    cfg = dict(DEFAULT_AI_CONFIG)
    cfg.update(settings.get("ai_allocation") or {})
    return cfg


def _extract_weights(cfg: dict):
    """Retourne (w_dist, w_rate, w_need, w_rel, wsum) normalisés."""
    w_dist = float(cfg.get("weight_distance", 0.40))
    w_rate = float(cfg.get("weight_rating", 0.25))
    w_need = float(cfg.get("weight_needs", 0.25))
    w_rel = float(cfg.get("weight_reliability", 0.10))
    wsum = (w_dist + w_rate + w_need + w_rel) or 1.0
    return w_dist, w_rate, w_need, w_rel, wsum


async def _load_reliability_counts(ids: list) -> dict:
    """Nb de trajets adaptés déjà attribués par chauffeur (best-effort)."""
    try:
        agg = await db.access_bookings.aggregate([
            {"$match": {"matched_driver_id": {"$in": ids}}},
            {"$group": {"_id": "$matched_driver_id", "n": {"$sum": 1}}},
        ]).to_list(500)
        return {a["_id"]: a["n"] for a in agg}
    except Exception as e:
        logger.error("access_ai trips agg error: %s", e)
        return {}


def _driver_reasons(dist, rating, covered, needs, completed, online) -> list:
    """Raisons lisibles (FR) accompagnant le score d'un chauffeur."""
    reasons = []
    if dist is not None:
        reasons.append(f"À {dist:.1f} km")
    reasons.append(f"Note {rating:.1f}★")
    if covered:
        reasons.append("Formé : " + ", ".join(CATEGORY_LABELS.get(c, c) for c in covered))
    elif _need_categories(needs):
        reasons.append("Formations à confirmer")
    if completed:
        reasons.append(f"{completed} trajet(s) adapté(s) réalisé(s)")
    if online:
        reasons.append("En ligne")
    return reasons


def _score_driver(d: dict, prof: dict, ctx: dict) -> dict:
    """Calcule le score pondéré d'un chauffeur + son détail et ses raisons."""
    online = bool(prof.get("is_online"))
    rating = float(prof.get("rating", 5.0) or 5.0)
    dist = _haversine_km(ctx["plat"], ctx["plng"], prof.get("current_lat"), prof.get("current_lng"))

    # Score de distance : 1 au plus proche, 0 au-delà du rayon ; neutre si position inconnue.
    if dist is None:
        dist_score = 0.45
    else:
        dist_score = max(0.0, 1.0 - min(dist / ctx["max_radius"], 1.0))
    rating_score = max(0.0, min(rating / 5.0, 1.0))
    need_score, covered = _needs_match_score(ctx["needs"], d.get("access_trainings"))
    completed = int(ctx["trips_counts"].get(d["id"], 0))
    rel_score = min(completed / 20.0, 1.0)

    w_dist, w_rate, w_need, w_rel, wsum = ctx["weights"]
    total = (w_dist * dist_score + w_rate * rating_score
             + w_need * need_score + w_rel * rel_score) / wsum
    total = round(total * 100, 1)

    return {
        "driver_id": d["id"],
        "name": d.get("name"),
        "photo": d.get("access_photo"),
        "bio": d.get("access_bio"),
        "trainings": d.get("access_trainings") or [],
        "online": online,
        "rating": round(rating, 1),
        "distance_km": round(dist, 1) if dist is not None else None,
        "completed_trips": completed,
        "score": total,
        "score_breakdown": {
            "distance": round(dist_score * 100, 1),
            "rating": round(rating_score * 100, 1),
            "needs": round(need_score * 100, 1),
            "reliability": round(rel_score * 100, 1),
        },
        "reasons": _driver_reasons(dist, rating, covered, ctx["needs"], completed, online),
    }


async def rank_access_drivers(criteria: dict, settings: dict, limit: int = 5) -> list:
    """Classe les chauffeurs certifiés Access pour une demande donnée.

    criteria: {pickup:{lat,lng}, needs:[...], scheduled_at: str|None}
    Renvoie une liste triée (meilleur d'abord) de dicts avec score + raisons en français.
    """
    cfg = _ai_config(settings)
    pickup = criteria.get("pickup") or {}
    needs = criteria.get("needs") or []
    immediate = not criteria.get("scheduled_at")

    drivers = await db.users.find(
        {"role": "driver", "access_certified": True},
        {"_id": 0, "id": 1, "name": 1, "access_photo": 1, "access_bio": 1, "access_trainings": 1},
    ).to_list(500)
    if not drivers:
        return []

    # Jointure avec db.drivers (position / online / note).
    ids = [d["id"] for d in drivers]
    prof_list = await db.drivers.find(
        {"user_id": {"$in": ids}},
        {"_id": 0, "user_id": 1, "current_lat": 1, "current_lng": 1, "is_online": 1, "rating": 1},
    ).to_list(500)
    profs = {p["user_id"]: p for p in prof_list}

    ctx = {
        "plat": pickup.get("lat"),
        "plng": pickup.get("lng"),
        "needs": needs,
        "max_radius": float(cfg.get("max_radius_km", 25.0)),
        "weights": _extract_weights(cfg),
        "trips_counts": await _load_reliability_counts(ids),
    }
    scored = [_score_driver(d, profs.get(d["id"]) or {}, ctx) for d in drivers]

    # Pour une demande immédiate, on privilégie les chauffeurs en ligne s'il y en a.
    if immediate and cfg.get("require_online_for_immediate", True):
        online_only = [s for s in scored if s["online"]]
        if online_only:
            scored = online_only

    scored.sort(key=lambda s: s["score"], reverse=True)
    return scored[:limit]


# ============================================================
#  PRÉDICTION DE LA DEMANDE
# ============================================================
DAY_LABELS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]


def _parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _build_demand_matrix(docs: list):
    """Agrège les réservations en matrice 7×24 + totaux par jour/heure/type."""
    matrix = [[0] * 24 for _ in range(7)]
    by_weekday = [0] * 7
    by_hour = [0] * 24
    by_type = defaultdict(int)
    total = 0
    for b in docs:
        dt = _parse_dt(b.get("scheduled_at")) or _parse_dt(b.get("created_at"))
        if not dt:
            continue
        wd, hr = dt.weekday(), dt.hour
        matrix[wd][hr] += 1
        by_weekday[wd] += 1
        by_hour[hr] += 1
        by_type[b.get("trip_type") or "standard"] += 1
        total += 1
    return matrix, by_weekday, by_hour, by_type, total


def _top_peaks(matrix: list, top: int = 6):
    """Top créneaux (jour×heure) non vides, triés par fréquence décroissante."""
    flat = []
    for wd in range(7):
        for hr in range(24):
            if matrix[wd][hr] > 0:
                flat.append({"weekday": wd, "hour": hr, "count": matrix[wd][hr],
                             "label": f"{DAY_LABELS_FR[wd]} {hr:02d}h"})
    flat.sort(key=lambda x: x["count"], reverse=True)
    peaks = flat[:top]
    return peaks, (peaks[0]["count"] if peaks else 0)


def _demand_levels(matrix: list, peak_max: int):
    """Niveau 0..3 par créneau (relatif au pic) pour la heatmap."""
    levels = [[0] * 24 for _ in range(7)]
    if peak_max:
        for wd in range(7):
            for hr in range(24):
                c = matrix[wd][hr]
                levels[wd][hr] = 0 if c == 0 else (1 if c <= peak_max / 3 else (2 if c <= 2 * peak_max / 3 else 3))
    return levels


async def predict_access_demand() -> dict:
    """Agrège l'historique des réservations Access par jour de semaine × heure.
    Renvoie une matrice 7×24, les créneaux de pointe et des totaux."""
    docs = await db.access_bookings.find(
        {}, {"_id": 0, "created_at": 1, "scheduled_at": 1, "trip_type": 1}).to_list(5000)
    matrix, by_weekday, by_hour, by_type, total = _build_demand_matrix(docs)
    peaks, peak_max = _top_peaks(matrix)
    levels = _demand_levels(matrix, peak_max)

    busiest_day = max(range(7), key=lambda i: by_weekday[i]) if total else None
    busiest_hour = max(range(24), key=lambda i: by_hour[i]) if total else None

    return {
        "total_bookings": total,
        "matrix": matrix,
        "levels": levels,
        "peaks": peaks,
        "by_weekday": by_weekday,
        "by_hour": by_hour,
        "by_type": dict(by_type),
        "busiest_day": DAY_LABELS_FR[busiest_day] if busiest_day is not None else None,
        "busiest_hour": busiest_hour,
        "day_labels": DAY_LABELS_FR,
    }


async def demand_narrative(forecast: dict, certified_drivers: int) -> str:
    """Courte recommandation FR pour l'admin (Gemini si dispo, sinon repli déterministe)."""
    total = forecast.get("total_bookings", 0)
    peaks = forecast.get("peaks") or []
    if total == 0:
        return ("Pas encore assez de données pour prédire la demande. Les recommandations IA "
                "apparaîtront dès les premières réservations adaptées.")

    peak_txt = ", ".join(p["label"] for p in peaks[:3]) or "—"
    fallback = (f"Demande concentrée sur : {peak_txt}. Jour le plus chargé : "
                f"{forecast.get('busiest_day') or '—'}. Avec {certified_drivers} chauffeur(s) "
                f"certifié(s), positionnez-les en priorité sur ces créneaux pour réduire l'attente PMR.")

    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        return fallback
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        sys = ("Tu es l'analyste opérationnel de SB Drive Access (transport adapté PMR). "
               "À partir des données de demande fournies, rédige 2 à 3 phrases en français, "
               "concrètes et actionnables, pour aider l'admin à positionner les chauffeurs certifiés. "
               "N'invente aucun chiffre : utilise uniquement les données. Pas de listes, pas de markdown.")
        data = (f"Total réservations: {total}. Créneaux de pointe: {peak_txt}. "
                f"Jour le plus chargé: {forecast.get('busiest_day')}. "
                f"Heure la plus chargée: {forecast.get('busiest_hour')}h. "
                f"Répartition par type: {forecast.get('by_type')}. "
                f"Chauffeurs certifiés disponibles: {certified_drivers}.")
        chat = LlmChat(api_key=key, session_id="access-demand", system_message=sys).with_model("gemini", "gemini-3-flash-preview")
        out = await chat.send_message(UserMessage(text=data))
        return (out or "").strip() or fallback
    except Exception as e:
        logger.error("access demand_narrative error: %s", e)
        return fallback
