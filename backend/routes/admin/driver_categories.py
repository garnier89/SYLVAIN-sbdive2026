from routes.admin._common import *  # noqa: F401,F403

@router.get("/driver-categories")
async def admin_list_driver_categories(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    cats = await db.driver_categories.find({}, {"_id": 0}).sort("order", 1).to_list(200)
    return cats


@router.post("/driver-categories")
async def admin_create_driver_category(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    clean = _clean_driver_category(body)
    explicit_id = (body.get("id") or "").strip().lower().replace(" ", "_")
    if explicit_id:
        if await db.driver_categories.find_one({"id": explicit_id}):
            raise HTTPException(status_code=409, detail="Une catégorie avec cet identifiant existe déjà")
        cid = explicit_id
    else:  # derive a stable id; auto-suffix on collision
        parts = [clean["service"], clean["vehicle_class"]]
        if clean["taxi_sub"]:
            parts.append(clean["taxi_sub"])
        base_id = "_".join(parts)
        cid = base_id
        n = 2
        while await db.driver_categories.find_one({"id": cid}):
            cid = f"{base_id}_{n}"
            n += 1
    doc = {"id": cid, **clean}
    await db.driver_categories.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/driver-categories/{cid}")
async def admin_update_driver_category(cid: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    existing = await db.driver_categories.find_one({"id": cid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    body = await request.json()
    doc = _clean_driver_category(body, existing)
    await db.driver_categories.update_one({"id": cid}, {"$set": doc})
    return {"id": cid, **doc}


@router.delete("/driver-categories/{cid}")
async def admin_delete_driver_category(cid: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    result = await db.driver_categories.delete_one({"id": cid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    return {"message": f"Catégorie '{cid}' supprimée"}


@router.post("/driver-categories/reorder")
async def admin_reorder_driver_categories(request: Request):
    """Body: {ordered_ids: [...]} — sets `order` by index (reflected at driver registration)."""
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    ids = body.get("ordered_ids", [])
    for i, cid in enumerate(ids):
        await db.driver_categories.update_one({"id": cid}, {"$set": {"order": i + 1}})
    return {"message": "reordered", "count": len(ids)}
