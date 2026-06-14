from routes.admin._common import *  # noqa: F401,F403

# ===== REWARDS CONFIG (vehicle regards + revenue guarantees + driver points) =====

@router.get("/rewards/config")
async def get_admin_rewards_config(request: Request, country: str = "", state: str = "", city: str = ""):
    await require_role(request, ["admin"], permission="drivers.rewards.config")
    zone = {"country": country, "state": state, "city": city} if country else None
    return await get_rewards_config(zone)


@router.get("/rewards/config/zones")
async def list_rewards_config_zones(request: Request):
    """List zones that have a per-zone rewards override (admin selector)."""
    await require_role(request, ["admin"], permission="drivers.rewards.config")
    docs = await db.service_configs.find(
        {"service_key": "rewards", "zone_key": {"$exists": True, "$nin": ["", None]}},
        {"_id": 0, "zone_key": 1, "scope": 1},
    ).to_list(300)
    return {"zones": [{"zone_key": d["zone_key"], "scope": d.get("scope", {})} for d in docs]}


@router.delete("/rewards/config/zone")
async def delete_rewards_zone_override(request: Request):
    """Remove a per-zone rewards override (the zone falls back to global)."""
    await require_role(request, ["admin"], permission="drivers.rewards.config")
    from core.geo_scope import clean_scope
    body = await request.json()
    scope = clean_scope(body.get("_zone") or body.get("scope"))
    zk = _rewards_zone_key(scope)
    if not zk:
        raise HTTPException(status_code=400, detail="Zone requise")
    res = await db.service_configs.delete_one({"service_key": "rewards", "zone_key": zk})
    return {"deleted": res.deleted_count, "zone_key": zk}


@router.put("/rewards/config")
async def save_admin_rewards_config(request: Request):
    """Persist the rewards config. An optional `_zone` {country,state,city} in the
    body stores a per-zone override; without it (or empty country) the GLOBAL config."""
    await require_role(request, ["admin"], permission="drivers.rewards.config")
    from core.geo_scope import clean_scope
    body = await request.json()
    zone_raw = body.pop("_zone", None) if isinstance(body, dict) else None
    scope = clean_scope(zone_raw) if zone_raw else {"country": "", "state": "", "city": ""}
    zk = _rewards_zone_key(scope)
    settings = {
        "regard_vehicles": body.get("regard_vehicles", DEFAULT_REWARDS_CONFIG["regard_vehicles"]),
        "guarantees": body.get("guarantees", DEFAULT_REWARDS_CONFIG["guarantees"]),
        "points": body.get("points", DEFAULT_REWARDS_CONFIG["points"]),
        "sub_category_bonus": body.get("sub_category_bonus", DEFAULT_REWARDS_CONFIG["sub_category_bonus"]),
    }
    now = datetime.now(timezone.utc).isoformat()
    if zk:
        await db.service_configs.update_one(
            {"service_key": "rewards", "zone_key": zk},
            {"$set": {"service_key": "rewards", "zone_key": zk, "scope": scope, "settings": settings, "updated_at": now}},
            upsert=True,
        )
    else:
        await db.service_configs.update_one(
            {"service_key": "rewards", "zone_key": {"$exists": False}},
            {"$set": {"service_key": "rewards", "settings": settings, "updated_at": now}},
            upsert=True,
        )
    return {"message": "Rewards config saved", "settings": settings, "zone_key": zk}
