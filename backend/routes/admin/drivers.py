from routes.admin._common import *  # noqa: F401,F403

@router.post("/drivers")
async def admin_create_driver(request: Request):
    """Admin manually creates a driver account (user role=driver + driver profile).
    Fleet rule: Taxi/VTC require a company/fleet name; a Particulier driver does not."""
    await require_role(request, ["admin"], permission="drivers.approve")
    body = await request.json()
    password = body.get("password") or ""
    if not password:
        raise HTTPException(400, "Le mot de passe est requis")
    res = await _create_driver_internal(body, password=password)
    return {"driver": res["driver"], "user": res["user"]}


@router.delete("/drivers/{driver_id}")
async def admin_delete_driver(driver_id: str, request: Request):
    await require_role(request, ["admin"], permission="drivers.reject")
    driver = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "user_id": 1})
    if not driver:
        raise HTTPException(404, "Driver not found")
    await db.drivers.delete_one({"id": driver_id})
    uid = driver.get("user_id")
    if uid:
        u = await db.users.find_one({"id": uid}, {"_id": 0, "role": 1})
        # Safety: only delete the linked account if it is actually a driver account.
        if u and u.get("role") == "driver":
            await db.users.delete_one({"id": uid})
            await db.wallets.delete_many({"user_id": uid})
    return {"deleted": True, "driver_id": driver_id}


# ===== PRIORITY DRIVERS (manually boosted by admin) =====

@router.get("/priority-drivers")
async def list_priority_drivers(request: Request):
    """List all drivers with their priority state (manual + computed from points)."""
    await require_role(request, ["admin"], permission="drivers.priority.toggle")
    config = await get_rewards_config()
    palettes = config["points"]["palettes"]

    def resolve_palette(points: int):
        for p in palettes:
            if p["min_points"] <= points <= p["max_points"]:
                return p
        return palettes[0] if palettes else None

    drivers = await db.drivers.find({}, {"_id": 0}).to_list(500)
    result = []
    for d in drivers:
        user_doc = await db.users.find_one({"id": d["user_id"]}, {"_id": 0, "name": 1, "email": 1, "phone": 1})
        points = d.get("points", config["points"]["initial_points"])
        palette = resolve_palette(points)
        result.append({
            "driver_id": d["id"],
            "user_id": d["user_id"],
            "name": (user_doc or {}).get("name", "Chauffeur"),
            "email": (user_doc or {}).get("email", ""),
            "phone": (user_doc or {}).get("phone", ""),
            "vehicle_type": d.get("vehicle_type"),
            "vehicle_number": d.get("vehicle_number"),
            "status": d.get("status"),
            "is_online": d.get("is_online", False),
            "points": points,
            "total_trips": d.get("total_trips", 0),
            "rating": d.get("rating", 5.0),
            "manual_priority": d.get("manual_priority", False),
            "manual_priority_note": d.get("manual_priority_note", ""),
            "acceptance_rate": d.get("acceptance_rate", 100),
            "cancellation_rate": d.get("cancellation_rate", 0),
            "palette_name": palette["name"] if palette else "",
            "palette_color": palette["color"] if palette else "#9CA3AF",
            "has_priority": d.get("manual_priority", False) or (palette["priority_access"] if palette else False),
        })
    # Sort: manual priority first, then by points desc
    result.sort(key=lambda x: (not x["manual_priority"], -x["points"]))
    return result


@router.put("/priority-drivers/{driver_id}")
async def set_priority_driver(driver_id: str, request: Request):
    """Toggle/set manual priority for a specific driver."""
    await require_role(request, ["admin"], permission="drivers.priority.toggle")
    body = await request.json()
    manual_priority = bool(body.get("manual_priority", False))
    note = body.get("note", "")
    result = await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {
            "manual_priority": manual_priority,
            "manual_priority_note": note,
            "manual_priority_updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    return {"driver_id": driver_id, "manual_priority": manual_priority, "note": note}


@router.delete("/priority-drivers/{driver_id}")
async def remove_priority_driver(driver_id: str, request: Request):
    await require_role(request, ["admin"], permission="drivers.priority.toggle")
    result = await db.drivers.update_one(
        {"id": driver_id},
        {"$set": {"manual_priority": False, "manual_priority_note": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    return {"driver_id": driver_id, "manual_priority": False}



# ===== TOP CHAUFFEURS (public ranking + admin manual select) =====

@router.get("/top-drivers-config")
async def get_top_drivers_config(request: Request):
    await require_role(request, ["admin"], permission="drivers.rewards.config")
    doc = await db.service_configs.find_one({"service_key": "top_drivers"}, {"_id": 0})
    if not doc:
        return {"settings": {"mode": "composite", "max_shown": 10, "manual_driver_ids": []}}
    return doc


@router.put("/top-drivers-config")
async def save_top_drivers_config(request: Request):
    await require_role(request, ["admin"], permission="drivers.rewards.config")
    body = await request.json()
    settings = {
        "mode": body.get("mode", "composite"),  # composite | points | manual
        "max_shown": int(body.get("max_shown", 10)),
        "manual_driver_ids": body.get("manual_driver_ids", []),
    }
    await db.service_configs.update_one(
        {"service_key": "top_drivers"},
        {"$set": {"service_key": "top_drivers", "settings": settings,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"message": "Top drivers config saved", "settings": settings}
