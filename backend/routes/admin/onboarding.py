from routes.admin._common import (
    HTTPException,
    Request,
    datetime,
    db,
    os,
    require_role,
    router,
    timezone,
)

@router.get("/onboarding")
async def admin_onboarding(request: Request):
    """Onboarding funnel for admin-created (invited) drivers & merchants.
    'Activated' = first business action done (driver: total_trips>0 ; merchant: total_orders>0)."""
    await require_role(request, ["admin"])

    async def _build(collection, *, activated_field, label_field):
        docs = await collection.find({"created_by": "admin"}, {
            "_id": 0, "id": 1, "user_id": 1, activated_field: 1, label_field: 1,
            "created_at": 1, "last_reminded_at": 1, "company_name": 1, "service_types": 1,
        }).sort("created_at", -1).to_list(5000)
        uids = [d["user_id"] for d in docs if d.get("user_id")]
        users = {}
        if uids:
            for u in await db.users.find({"id": {"$in": uids}}, {"_id": 0, "id": 1, "email": 1, "name": 1}).to_list(5000):
                users[u["id"]] = u
        activated, pending = 0, []
        for d in docs:
            is_active = (d.get(activated_field) or 0) > 0
            if is_active:
                activated += 1
                continue
            u = users.get(d.get("user_id"), {})
            pending.append({
                "id": d["id"], "user_id": d.get("user_id"),
                "name": u.get("name") or d.get(label_field) or "—",
                "email": u.get("email") or "", "store_name": d.get(label_field) if label_field == "store_name" else None,
                "company_name": d.get("company_name"), "service_types": d.get("service_types"),
                "created_at": d.get("created_at"), "last_reminded_at": d.get("last_reminded_at"),
            })
        total = len(docs)
        return {"total": total, "activated": activated, "pending": total - activated,
                "activation_rate": round(activated / total * 100, 1) if total else 0.0,
                "pending_list": pending}

    drivers = await _build(db.drivers, activated_field="total_trips", label_field="company_name")
    merchants = await _build(db.merchants, activated_field="total_orders", label_field="store_name")
    return {"drivers": drivers, "merchants": merchants}


@router.post("/onboarding/remind")
async def admin_onboarding_remind(request: Request):
    """Relance (best-effort) by email of invited accounts that aren't activated yet.
    Body: {kind: 'driver'|'merchant', ids?: [..], all?: bool}. Returns {sent, failed}."""
    await require_role(request, ["admin"])
    body = await request.json()
    kind = (body.get("kind") or "").strip().lower()
    if kind not in {"driver", "merchant"}:
        raise HTTPException(400, "kind doit être 'driver' ou 'merchant'")
    collection = db.drivers if kind == "driver" else db.merchants
    activated_field = "total_trips" if kind == "driver" else "total_orders"
    role_label = "Chauffeur" if kind == "driver" else "Marchand"

    if body.get("all"):
        docs = await collection.find({"created_by": "admin", "$or": [
            {activated_field: {"$lte": 0}}, {activated_field: {"$exists": False}},
        ]}, {"_id": 0, "id": 1, "user_id": 1}).to_list(5000)
    else:
        ids = body.get("ids") or []
        if not ids:
            raise HTTPException(400, "Aucun compte sélectionné")
        docs = await collection.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "user_id": 1}).to_list(5000)

    from core.email import fire, send_account_reminder
    frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
    sent, failed = 0, 0
    now = datetime.now(timezone.utc).isoformat()
    for d in docs:
        u = await db.users.find_one({"id": d.get("user_id")}, {"_id": 0, "email": 1, "name": 1})
        email = (u or {}).get("email")
        if not email or email.endswith("@sbdrive.local"):
            failed += 1
            continue
        try:
            fire(send_account_reminder(email, (u or {}).get("name") or "", role_label=role_label,
                                       login_email=email, login_url=f"{frontend}/login"))
            await collection.update_one({"id": d["id"]}, {"$set": {"last_reminded_at": now}})
            sent += 1
        except Exception:
            failed += 1
    return {"sent": sent, "failed": failed, "total": len(docs)}
