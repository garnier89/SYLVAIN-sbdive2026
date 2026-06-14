from routes.admin._common import *  # noqa: F401,F403

@router.get("/vehicle-types")
async def admin_list_vehicle_types(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    types = await db.vehicle_types.find({}, {"_id": 0}).sort("display_order", 1).to_list(100)
    return types


@router.post("/vehicle-types")
async def create_vehicle_type(request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    slug = body.get("slug")
    if not slug:
        raise HTTPException(status_code=400, detail="slug is required")
    existing = await db.vehicle_types.find_one({"slug": slug})
    if existing:
        raise HTTPException(status_code=409, detail="Vehicle type already exists")
    doc = {**VT_DEFAULTS, "slug": slug, "status": "active",
           "created_at": datetime.now(timezone.utc).isoformat()}
    for field in VT_FIELDS:
        if field in body:
            doc[field] = body[field]
    await db.vehicle_types.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/vehicle-types/{slug}")
async def update_vehicle_type(slug: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    update = {}
    for field in VT_FIELDS + ["status"]:
        if field in body:
            update[field] = body[field]
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.vehicle_types.update_one({"slug": slug}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    return {"message": f"Vehicle type '{slug}' updated"}


@router.post("/vehicle-types/translate")
async def translate_vehicle_type_name(request: Request):
    """Auto-translate a vehicle type name into all supported languages via LLM."""
    await require_role(request, ["admin"], permission="server.settings.edit")
    import os
    import json as _json
    body = await request.json()
    text = (body.get("text") or "").strip()
    langs = body.get("langs") or []
    if not text or not langs:
        raise HTTPException(status_code=400, detail="text et langs requis")
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Service de traduction indisponible")
    lang_list = ", ".join(langs)
    prompt = (
        "Translate the following vehicle category name into these languages "
        f"(ISO codes): {lang_list}. Keep it short (1-3 words), natural for a ride-hailing app. "
        'Reply ONLY with a JSON object mapping each ISO code to its translation, no markdown.\n'
        f'Name: "{text}"'
    )
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = (
            LlmChat(api_key=api_key, session_id=f"vt-translate-{uuid.uuid4().hex[:8]}",
                    system_message="You are a professional localization assistant. Output strict JSON only.")
            .with_model("anthropic", "claude-sonnet-4-6")
        )
        raw = await chat.send_message(UserMessage(text=prompt))
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1].replace("json", "", 1).strip()
        translations = _json.loads(cleaned)
        return {"translations": {k: v for k, v in translations.items() if k in langs}}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Échec de la traduction: {e}")


@router.delete("/vehicle-types/{slug}")
async def delete_vehicle_type(slug: str, request: Request):
    await require_role(request, ["admin"], permission="server.settings.edit")
    result = await db.vehicle_types.delete_one({"slug": slug})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    return {"message": f"Vehicle type '{slug}' deleted"}


@router.post("/vehicle-types/reorder")
async def reorder_vehicle_types(request: Request):
    """Body: {ordered_slugs: [...]} — sets display_order by index (reflected in the client app)."""
    await require_role(request, ["admin"], permission="server.settings.edit")
    body = await request.json()
    slugs = body.get("ordered_slugs", [])
    for i, slug in enumerate(slugs):
        await db.vehicle_types.update_one({"slug": slug}, {"$set": {"display_order": i + 1}})
    return {"message": "reordered", "count": len(slugs)}
