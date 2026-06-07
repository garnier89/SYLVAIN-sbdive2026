"""Geographic scoping for admin configurations (zone-aware features).

Lets an admin attach a {country, state, city} scope to a config (promo, voucher,
banner, …) so it only applies where it's meant to (e.g. a 40% promo visible only
in Martinique). A config with an EMPTY country scope is GLOBAL (applies everywhere).

Resolution at apply-time matches the request location (derived from the ride
pickup address) against the config scope, most-specific first.

`states`/`cities` aren't in the V3Cube referential (only the 250 countries are),
so we keep a curated region/city dataset for the territories this app operates in
(France + DOM-TOM). It is intentionally extensible — add countries/states/cities
here and both the admin dropdowns and the resolver pick them up automatically.
"""
from typing import Optional, List, Tuple

# country_code -> { name, states: { state_name: [cities...] } }
CURATED = {
    "MQ": {"name": "Martinique", "states": {"Martinique": [
        "Fort-de-France", "Le Lamentin", "Schoelcher", "Sainte-Marie", "Le Robert",
        "Ducos", "Le François", "Sainte-Luce", "Rivière-Pilote", "Saint-Joseph",
        "Le Marin", "La Trinité", "Le Vauclin", "Saint-Esprit",
    ]}},
    "GP": {"name": "Guadeloupe", "states": {"Guadeloupe": [
        "Pointe-à-Pitre", "Les Abymes", "Baie-Mahault", "Le Gosier", "Basse-Terre",
        "Sainte-Anne", "Le Moule", "Petit-Bourg", "Capesterre-Belle-Eau", "Sainte-Rose",
    ]}},
    "GF": {"name": "Guyane", "states": {"Guyane": [
        "Cayenne", "Matoury", "Kourou", "Saint-Laurent-du-Maroni", "Rémire-Montjoly",
        "Macouria", "Mana",
    ]}},
    "RE": {"name": "La Réunion", "states": {"La Réunion": [
        "Saint-Denis", "Saint-Paul", "Saint-Pierre", "Le Tampon", "Saint-André",
        "Saint-Louis", "Le Port", "Saint-Benoît",
    ]}},
    "YT": {"name": "Mayotte", "states": {"Mayotte": ["Mamoudzou", "Koungou", "Dembéni"]}},
    "FR": {"name": "France", "states": {
        "Île-de-France": ["Paris", "Boulogne-Billancourt", "Saint-Denis", "Versailles", "Créteil", "Nanterre"],
        "Provence-Alpes-Côte d'Azur": ["Marseille", "Nice", "Toulon", "Aix-en-Provence", "Cannes"],
        "Auvergne-Rhône-Alpes": ["Lyon", "Grenoble", "Saint-Étienne"],
        "Occitanie": ["Toulouse", "Montpellier", "Nîmes"],
        "Nouvelle-Aquitaine": ["Bordeaux", "Bayonne"],
        "Hauts-de-France": ["Lille"],
        "Grand Est": ["Strasbourg", "Reims"],
        "Pays de la Loire": ["Nantes"],
    }},
}


def list_states(country_code: str):
    c = CURATED.get((country_code or "").upper())
    if not c:
        return []
    return sorted(c["states"].keys())


def list_cities(country_code: str, state: Optional[str] = None) -> List[str]:
    c = CURATED.get((country_code or "").upper())
    if not c:
        return []
    if state:
        return list(c["states"].get(state, []))
    out = []
    for cities in c["states"].values():
        out.extend(cities)
    return sorted(set(out))


def clean_scope(raw) -> dict:
    """Normalize a scope payload to {country, state, city}. Empty country = global."""
    raw = raw if isinstance(raw, dict) else {}
    country = (raw.get("country") or "").strip().upper()
    state = (raw.get("state") or "").strip()
    city = (raw.get("city") or "").strip()
    if not country:
        return {"country": "", "state": "", "city": ""}
    return {"country": country, "state": state if state else "", "city": city if city else ""}


def is_global_scope(scope) -> bool:
    return not (isinstance(scope, dict) and (scope.get("country") or "").strip())


# Pre-build a (city_lower -> (country_code, state, city)) lookup for resolution.
_CITY_INDEX = []
for _cc, _c in CURATED.items():
    for _st, _cities in _c["states"].items():
        for _city in _cities:
            _CITY_INDEX.append((_city.lower(), _cc, _st, _city))
# Longest names first so "Saint-Laurent-du-Maroni" wins over "Saint-Laurent".
_CITY_INDEX.sort(key=lambda t: len(t[0]), reverse=True)
_COUNTRY_NAME_INDEX = sorted(
    [(c["name"].lower(), cc, c["name"]) for cc, c in CURATED.items()],
    key=lambda t: len(t[0]), reverse=True,
)


def resolve_zone_from_text(text: Optional[str]) -> Optional[dict]:
    """Best-effort resolution of a {country, state, city} zone from a free-text
    location (e.g. the ride pickup address). Returns None if nothing matches.

    Strategy: detect the country first (to disambiguate cities that exist in
    several countries, e.g. Saint-Denis), then prefer a city within that country.
    """
    if not text:
        return None
    t = text.lower()
    country_cc = None
    for name_l, cc, _name in _COUNTRY_NAME_INDEX:
        if name_l in t:
            country_cc = cc
            break
    # City match (restricted to detected country when known)
    for city_l, cc, st, city in _CITY_INDEX:
        if country_cc and cc != country_cc:
            continue
        if city_l in t:
            return {"country": cc, "state": st, "city": city}
    if country_cc:
        return {"country": country_cc, "state": "", "city": ""}
    # Fallback: any city match regardless of country
    for city_l, cc, st, city in _CITY_INDEX:
        if city_l in t:
            return {"country": cc, "state": st, "city": city}
    return None


def scope_matches(scope, zone: Optional[dict]) -> bool:
    """Does a config `scope` apply to the resolved request `zone`?

    - Empty/global scope  → matches everything.
    - Country-scoped       → zone must resolve to the same country (and state/city
                             when those are set on the scope).
    - If the zone is unknown (None), only global scopes match.
    """
    if is_global_scope(scope):
        return True
    if not zone:
        return False
    if (scope.get("country") or "").upper() != (zone.get("country") or "").upper():
        return False
    s_state = (scope.get("state") or "").strip().lower()
    if s_state and s_state != (zone.get("state") or "").strip().lower():
        return False
    s_city = (scope.get("city") or "").strip().lower()
    if s_city and s_city != (zone.get("city") or "").strip().lower():
        return False
    return True


# ── Per-vehicle-type ZONE PRICING overrides (V3Cube "Tarifs par zone") ─────
# Vehicle type docs carry `zone_overrides`: [{zone, price_per_km, price_per_min,
# base_fare, min_fare, ...}] where `zone` is a free-text zone name (e.g.
# "Martinique", "Paris"). At fare time we resolve the ride pickup to a zone and
# apply the MOST SPECIFIC matching override (city > state > country) on top of the
# vehicle type's base pricing.
_PRICING_OVERRIDE_FIELDS = (
    "price_per_km", "price_per_min", "base_fare", "min_fare",
    "price_per_hour", "fixed_fare", "pickup_price",
)


def _norm_zone_name(s) -> str:
    return (s or "").strip().lower()


def _zone_override_rank(override_zone: str, city: str, state: str, country_name: str) -> int:
    """Specificity of a zone-override name vs a resolved zone: 3=city, 2=state, 1=country, 0=none."""
    z = _norm_zone_name(override_zone)
    if not z:
        return 0
    if city and (z == city or z in city or city in z):
        return 3
    if state and (z == state or z in state or state in z):
        return 2
    if country_name and (z == country_name or z in country_name or country_name in z):
        return 1
    return 0


def _best_zone_override(overrides: List[dict], zone: dict) -> Optional[dict]:
    """Return the most specific zone override matching `zone`, or None."""
    city = _norm_zone_name(zone.get("city"))
    state = _norm_zone_name(zone.get("state"))
    cc = (zone.get("country") or "").upper()
    country_name = _norm_zone_name(CURATED.get(cc, {}).get("name"))
    best, best_rank = None, 0
    for ov in overrides:
        rank = _zone_override_rank(ov.get("zone"), city, state, country_name)
        if rank > best_rank:
            best, best_rank = ov, rank
    return best


def apply_vehicle_zone_pricing(vtype_doc: Optional[dict], pickup_address: Optional[str]) -> Tuple[Optional[dict], Optional[str]]:
    """Return (doc, applied_zone_label).

    If the vehicle type has `zone_overrides` and the ride pickup resolves to a
    matching zone, return a COPY of `vtype_doc` with that zone's pricing fields
    applied. Most-specific match wins (city > state > country). Otherwise the doc
    is returned unchanged with applied_zone_label = None."""
    if not vtype_doc or not (vtype_doc.get("zone_overrides") or []):
        return vtype_doc, None
    zone = resolve_zone_from_text(pickup_address)
    if not zone:
        return vtype_doc, None
    best = _best_zone_override(vtype_doc["zone_overrides"], zone)
    if not best:
        return vtype_doc, None
    merged = dict(vtype_doc)
    for f in _PRICING_OVERRIDE_FIELDS:
        if f in best and best[f] not in (None, ""):
            try:
                merged[f] = float(best[f])
            except (TypeError, ValueError):
                pass
    return merged, best.get("zone")
