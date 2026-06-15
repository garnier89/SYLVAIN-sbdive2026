from routes.admin._common import (
    HTTPException,
    Request,
    _crud_col,
    datetime,
    db,
    require_role,
    router,
    timezone,
    uuid,
)

@router.get("/stats")
async def get_admin_stats(request: Request):
    await require_role(request, ["admin"])
    users_count = await db.users.count_documents({})
    drivers_count = await db.drivers.count_documents({})
    rides_count = await db.rides.count_documents({})
    orders_count = await db.orders.count_documents({})
    merchants_count = await db.merchants.count_documents({})
    return {
        "users": users_count,
        "drivers": drivers_count,
        "rides": rides_count,
        "orders": orders_count,
        "merchants": merchants_count,
    }


# ===== ADMIN GENERAL SETTINGS =====

@router.get("/settings")
async def get_admin_general_settings(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    doc = await db.service_configs.find_one({"service_key": "general"}, {"_id": 0})
    if not doc:
        return {"settings": {}}
    return doc


@router.put("/settings")
async def save_admin_general_settings(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    settings = body.get("settings", body)
    await db.service_configs.update_one(
        {"service_key": "general"},
        {"$set": {
            "service_key": "general",
            "settings": settings,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": "Settings saved", "settings": settings}


# ===== SERVICE CONFIGS =====

@router.get("/service-config/{service_key}")
async def get_service_config(service_key: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    config = await db.service_configs.find_one({"service_key": service_key}, {"_id": 0})
    if not config:
        return {"service_key": service_key, "settings": {}}
    return config


@router.put("/service-config/{service_key}")
async def save_service_config(service_key: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    settings = body.get("settings", {})
    await db.service_configs.update_one(
        {"service_key": service_key},
        {"$set": {
            "service_key": service_key,
            "settings": settings,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"message": f"Config '{service_key}' saved"}


@router.get("/crud/{collection}")
async def list_crud_items(collection: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    col = _crud_col(collection)
    items = await col.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@router.post("/crud/{collection}")
async def create_crud_item(collection: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    col = _crud_col(collection)
    body = await request.json()
    body["id"] = f"{collection[:3]}_{uuid.uuid4().hex[:8]}"
    body["created_at"] = datetime.now(timezone.utc).isoformat()
    await col.insert_one(body)
    body.pop("_id", None)
    return body


@router.put("/crud/{collection}/{item_id}")
async def update_crud_item(collection: str, item_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    col = _crud_col(collection)
    body = await request.json()
    body.pop("id", None)
    body.pop("_id", None)
    result = await col.update_one({"id": item_id}, {"$set": body})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Updated"}


@router.delete("/crud/{collection}/{item_id}")
async def delete_crud_item(collection: str, item_id: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    col = _crud_col(collection)
    result = await col.delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Deleted"}


# ===== DB BACKUP (simple collection dump list) =====

@router.get("/db-backup")
async def db_backup_status(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    names = await db.list_collection_names()
    stats = []
    for n in names:
        try:
            count = await db[n].count_documents({})
            stats.append({"collection": n, "count": count})
        except Exception:
            pass
    stats.sort(key=lambda x: -x["count"])
    return {"collections": stats, "total": len(stats), "checked_at": datetime.now(timezone.utc).isoformat()}
