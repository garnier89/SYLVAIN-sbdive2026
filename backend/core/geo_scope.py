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
from typing import Optional

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


def list_cities(country_code: str, state: Optional[str] = None):
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
