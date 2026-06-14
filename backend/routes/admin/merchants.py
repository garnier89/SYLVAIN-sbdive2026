from routes.admin._common import *  # noqa: F401,F403

@router.get("/merchants")
async def admin_list_merchants(request: Request, status: str = "all"):
    """Admin merchant list INCLUDING pending applications (the public list hides
    pending/inactive). Filter by status: all | pending | approved | rejected."""
    await require_role(request, ["admin"], permission="merchants.activate")
    query = {}
    if status == "pending":
        query["approval_status"] = "pending"
    elif status == "approved":
        query["approval_status"] = {"$in": ["approved", None]}
    elif status == "rejected":
        query["approval_status"] = "rejected"
    merchants = await db.merchants.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    # Attach owner email for context.
    uids = [m.get("user_id") for m in merchants if m.get("user_id")]
    owners = {u["id"]: u async for u in db.users.find({"id": {"$in": uids}}, {"_id": 0, "id": 1, "email": 1, "name": 1, "phone": 1})}
    for m in merchants:
        o = owners.get(m.get("user_id"), {})
        m["approval_status"] = m.get("approval_status", "approved")
        m["owner_email"] = o.get("email")
        m["owner_name"] = o.get("name")
        m["owner_phone"] = o.get("phone")
    pending_count = await db.merchants.count_documents({"approval_status": "pending"})
    return {"merchants": merchants, "pending_count": pending_count}


@router.post("/merchants/{merchant_id}/approval")
async def set_merchant_approval(merchant_id: str, request: Request):
    """Approve or reject a self-service merchant application.
    Body: {action: 'approve' | 'reject'}."""
    await require_role(request, ["admin"], permission="merchants.activate")
    body = await request.json()
    action = body.get("action")
    merchant = await db.merchants.find_one({"id": merchant_id}, {"_id": 0})
    if not merchant:
        raise HTTPException(status_code=404, detail="Merchant not found")
    if action == "approve":
        update = {"approval_status": "approved", "is_active": True}
        msg, title, body_txt = "approved", "Boutique validée ✅", "Félicitations ! Votre boutique SB Store est validée et désormais visible des clients."
    elif action == "reject":
        update = {"approval_status": "rejected", "is_active": False}
        msg, title, body_txt = "rejected", "Demande refusée", "Votre demande d'ouverture de boutique SB Store n'a pas été validée. Contactez le support pour plus d'informations."
    else:
        raise HTTPException(status_code=400, detail="action doit être 'approve' ou 'reject'")
    await db.merchants.update_one({"id": merchant_id}, {"$set": update})
    try:
        from core.notifications import create_notification
        if merchant.get("user_id"):
            await create_notification(merchant["user_id"], "merchant_approval", title, body_txt,
                                      data={"url": "/merchant"}, push=True)
    except Exception:
        pass
    # On approval, send the branded "store approved" email (non-blocking).
    if action == "approve" and merchant.get("user_id"):
        try:
            owner = await db.users.find_one({"id": merchant["user_id"]}, {"_id": 0, "email": 1, "name": 1})
            if owner and owner.get("email"):
                from core.email import fire, send_merchant_approved
                frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
                fire(send_merchant_approved(owner["email"], owner.get("name", ""),
                                            merchant.get("store_name", "votre boutique"),
                                            f"{frontend}/merchant"))
        except Exception:
            pass
    return {"merchant_id": merchant_id, "approval_status": update["approval_status"]}


@router.post("/merchants/{merchant_id}/status")
async def update_merchant_status(merchant_id: str, request: Request):
    await require_role(request, ["admin"], permission="merchants.activate")
    body = await request.json()
    new_status = body.get("status", "active")
    result = await db.merchants.update_one({"id": merchant_id}, {"$set": {"status": new_status}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Merchant not found")
    return {"message": f"Merchant status updated to {new_status}"}


@router.put("/merchants/{merchant_id}")
async def update_merchant_settings(merchant_id: str, request: Request):
    """Admin edit of a merchant's storefront settings (cuisine, discount, delivery)."""
    await require_role(request, ["admin"], permission="merchants.activate")
    body = await request.json()
    update = {}
    if "cuisine" in body:
        update["cuisine"] = str(body["cuisine"]).strip()
    if "discount_pct" in body:
        try:
            update["discount_pct"] = max(0.0, min(90.0, round(float(body["discount_pct"]), 2)))
        except (TypeError, ValueError):
            pass
    if "delivery_fee" in body:
        try:
            update["delivery_fee"] = max(0.0, round(float(body["delivery_fee"]), 2))
        except (TypeError, ValueError):
            pass
    if "eta_min" in body:
        try:
            update["eta_min"] = max(1, int(body["eta_min"]))
        except (TypeError, ValueError):
            pass
    if "flash_discount" in body:
        from routes.merchants import validate_flash_discount
        update["flash_discount"] = validate_flash_discount(body["flash_discount"])
    if "image_url" in body:
        update["image_url"] = str(body["image_url"]).strip()
    if "gallery" in body and isinstance(body["gallery"], list):
        update["gallery"] = [str(g) for g in body["gallery"]][:12]
    if not update:
        raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour")
    result = await db.merchants.update_one({"id": merchant_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Merchant not found")
    return {"message": "Merchant updated", "updated": update}


@router.post("/merchants")
async def admin_create_merchant(request: Request):
    """Admin manually creates a merchant account (user role=merchant + store), active immediately."""
    await require_role(request, ["admin"], permission="merchants.activate")
    body = await request.json()
    password = body.get("password") or ""
    if not password:
        raise HTTPException(400, "Le mot de passe est requis")
    res = await _create_merchant_internal(body, password=password)
    return res["merchant"]


@router.delete("/merchants/{merchant_id}")
async def admin_delete_merchant(merchant_id: str, request: Request):
    await require_role(request, ["admin"], permission="merchants.activate")
    m = await db.merchants.find_one({"id": merchant_id}, {"_id": 0, "user_id": 1})
    if not m:
        raise HTTPException(404, "Merchant not found")
    await db.merchants.delete_one({"id": merchant_id})
    uid = m.get("user_id")
    if uid:
        u = await db.users.find_one({"id": uid}, {"_id": 0, "role": 1})
        if u and u.get("role") == "merchant":
            await db.users.delete_one({"id": uid})
            await db.wallets.delete_many({"user_id": uid})
    return {"deleted": True, "merchant_id": merchant_id}
