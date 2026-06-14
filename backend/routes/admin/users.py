from routes.admin._common import *  # noqa: F401,F403

# ===== USER DETAIL / EDIT (matches XJekPlus Edit User page) =====

@router.get("/users/{user_id}")
async def admin_get_user(user_id: str, request: Request):
    await require_role(request, ["admin"], permission="users.view")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(404, "User not found")
    wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0, "balance": 1}) or {}
    user["wallet_balance"] = wallet.get("balance", 0)
    return user


@router.post("/users")
async def admin_create_user(request: Request):
    await require_role(request, ["admin"], permission="users.create")
    from core.deps import hash_password
    body = await request.json()
    first_name = (body.get("first_name") or "").strip()
    last_name = (body.get("last_name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    phone_code = (body.get("phone_code") or "").strip()
    if not first_name or not email or not password:
        raise HTTPException(400, "first_name, email et password sont requis")
    await _assert_email_available(email)
    full_phone = _compose_full_phone(body.get("phone"), phone_code)
    await _assert_phone_available(full_phone)
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(password),
        "first_name": first_name,
        "last_name": last_name,
        "name": f"{first_name} {last_name}".strip() or email,
        "phone": full_phone or None,
        "phone_code": phone_code or None,
        "gender": body.get("gender"),
        "country": body.get("country"),
        "language": body.get("language") or "fr",
        "currency": body.get("currency") or "EUR",
        "avatar_url": body.get("avatar_url"),
        "role": "user",
        "is_verified": False,
        "is_suspended": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    await db.wallets.insert_one({"user_id": user_id, "balance": 0.0, "created_at": doc["created_at"]})
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc


@router.put("/users/{user_id}")
async def admin_update_user(user_id: str, request: Request):
    await require_role(request, ["admin"], permission="users.edit")
    body = await request.json()
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(404, "User not found")
    updates = _collect_user_updates(body, user)
    if body.get("email"):
        email = body["email"].strip().lower()
        await _assert_email_available(email, exclude_id=user_id)
        updates["email"] = email
    if body.get("phone") is not None:
        full = _compose_full_phone(body["phone"], body.get("phone_code", user.get("phone_code", "")))
        await _assert_phone_available(full, exclude_id=user_id)
        updates["phone"] = full or None
    if updates:
        await db.users.update_one({"id": user_id}, {"$set": updates})
    # Lifecycle email on suspension state change (skip placeholder emails).
    if "is_suspended" in updates:
        new_suspended = updates["is_suspended"]
        was_suspended = bool(user.get("is_suspended", False))
        email = (user.get("email") or "").strip()
        if new_suspended != was_suspended and email and not email.endswith("@sbdrive.local"):
            from core.email import fire, send_account_suspended, send_account_reactivated
            name = user.get("name") or ""
            if new_suspended:
                reason = (body.get("suspension_reason") or body.get("reason") or "").strip()
                fire(send_account_suspended(email, name, reason))
            else:
                fire(send_account_reactivated(email, name))
    return {"updated": True}


@router.delete("/users/{user_id}")
async def admin_delete_user(user_id: str, request: Request):
    await require_role(request, ["admin"], permission="users.delete")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1, "email": 1, "name": 1})
    if not user:
        raise HTTPException(404, "User not found")
    if user.get("role") == "admin":
        raise HTTPException(400, "Impossible de supprimer un admin via cette route (utilisez /api/acl/admins)")
    await db.users.delete_one({"id": user_id})
    await db.wallets.delete_many({"user_id": user_id})
    email = (user.get("email") or "").strip()
    if email and not email.endswith("@sbdrive.local"):
        from core.email import fire, send_account_deleted
        fire(send_account_deleted(email, user.get("name") or ""))
    return {"deleted": True}

@router.get("/users/{user_id}/documents")
async def admin_get_user_documents(user_id: str, request: Request):
    """Return documents uploaded by the user (or empty list)."""
    await require_role(request, ["admin"], permission="users.view")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1, "email": 1, "first_name": 1, "last_name": 1, "avatar_url": 1})
    if not user:
        raise HTTPException(404, "User not found")
    docs = await db.user_documents.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    if user.get("avatar_url") and not any(d.get("type") == "profile" for d in docs):
        docs.insert(0, {
            "id": f"profile_{user_id}",
            "user_id": user_id,
            "type": "profile",
            "label": "Photo de profil",
            "file_url": user["avatar_url"],
            "mime_type": "image/*",
            "uploaded_at": None,
            "status": "active",
        })
    return {"user": user, "documents": docs, "total": len(docs)}


@router.post("/users/{user_id}/documents")
async def admin_upload_user_document(user_id: str, request: Request):
    """Attach a document on behalf of the user (data-URL or external link)."""
    await require_role(request, ["admin"], permission="users.edit")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1})
    if not user:
        raise HTTPException(404, "User not found")
    body = await request.json()
    file_url = body.get("file_url")
    if not file_url:
        raise HTTPException(400, "file_url requis")
    if isinstance(file_url, str) and len(file_url) > 11_000_000:
        # ~8 MB binary => ~11 MB base64; protects MongoDB 16MB doc limit and prevents DoS
        raise HTTPException(413, "Fichier trop volumineux (max 8 Mo)")
    doc = {
        "id": f"doc_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "type": (body.get("type") or "other").strip(),
        "label": (body.get("label") or "Document").strip(),
        "file_url": file_url,
        "mime_type": body.get("mime_type") or "application/octet-stream",
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "uploaded_by": "admin",
        "status": "pending_review",
    }
    await db.user_documents.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/users/{user_id}/documents/{doc_id}")
async def admin_delete_user_document(user_id: str, doc_id: str, request: Request):
    await require_role(request, ["admin"], permission="users.edit")
    res = await db.user_documents.delete_one({"id": doc_id, "user_id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Document introuvable")
    return {"deleted": True}


@router.put("/users/{user_id}/documents/{doc_id}/status")
async def admin_update_document_status(user_id: str, doc_id: str, request: Request):
    """Approve/reject a KYC document. Sets is_verified=True on user when at least one doc is approved."""
    await require_role(request, ["admin"], permission="users.edit")
    body = await request.json()
    status_value = (body.get("status") or "").strip()
    if status_value not in ("approved", "rejected", "pending_review"):
        raise HTTPException(400, "status doit être approved, rejected ou pending_review")
    reason = (body.get("reason") or "").strip()[:300]
    now = datetime.now(timezone.utc).isoformat()
    updates = {"status": status_value, "reviewed_at": now, "reviewed_by": "admin"}
    if reason:
        updates["review_reason"] = reason
    res = await db.user_documents.update_one({"id": doc_id, "user_id": user_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Document introuvable")
    # If at least one doc approved → mark user verified; if all rejected → unverified
    approved_count = await db.user_documents.count_documents({"user_id": user_id, "status": "approved"})
    await db.users.update_one({"id": user_id}, {"$set": {"is_verified": approved_count > 0}})
    return {"status": status_value, "is_verified": approved_count > 0, "approved_count": approved_count}




@router.post("/users/{user_id}/wallet/credit")
async def admin_credit_user_wallet(user_id: str, request: Request):
    """Manually credit (or debit, with negative amount) a user's wallet from the admin UI."""
    await require_role(request, ["admin"], permission="billing.edit")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "name": 1, "email": 1})
    if not user:
        raise HTTPException(404, "User not found")
    body = await request.json()
    try:
        amount = float(body.get("amount") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "Montant invalide")
    if amount == 0:
        raise HTTPException(400, "Montant requis")
    note = (body.get("note") or "").strip()[:200]
    now = datetime.now(timezone.utc).isoformat()
    await db.wallets.update_one(
        {"user_id": user_id},
        {"$inc": {"balance": amount}, "$setOnInsert": {"user_id": user_id, "created_at": now}},
        upsert=True,
    )
    wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0, "balance": 1})
    new_balance = wallet["balance"] if wallet else amount
    tx_type = "admin_credit" if amount > 0 else "admin_debit"
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "amount": amount,
        "type": tx_type,
        "description": note or ("Crédit administrateur" if amount > 0 else "Débit administrateur"),
        "balance_after": new_balance,
        "created_at": now,
    })
    return {"new_balance": new_balance, "amount": amount, "type": tx_type}


# ===== WALLET RESERVE (SB Pay floors) =====

@router.get("/wallet-reserve-config")
async def get_wallet_reserve_config_admin(request: Request):
    await require_role(request, ["admin"], permission="billing.edit")
    from core.wallet_reserve import get_reserve_config
    return await get_reserve_config()


@router.put("/wallet-reserve-config")
async def update_wallet_reserve_config_admin(request: Request):
    await require_role(request, ["admin"], permission="billing.edit")
    body = await request.json()
    from core.wallet_reserve import RESERVE_CFG_ID, get_reserve_config
    update = {}
    for k in ("driver_europe", "driver_africa", "merchant", "withdraw_min"):
        if body.get(k) is not None:
            try:
                update[k] = max(0.0, float(body[k]))
            except (TypeError, ValueError):
                pass
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.wallet_reserve_config.update_one({"id": RESERVE_CFG_ID}, {"$set": update}, upsert=True)
    return await get_reserve_config()


@router.put("/users/{user_id}/region")
async def set_user_region(user_id: str, request: Request):
    await require_role(request, ["admin"], permission="billing.edit")
    body = await request.json()
    region = body.get("region")
    if region not in ("africa", "europe"):
        raise HTTPException(400, "region doit être 'africa' ou 'europe'")
    res = await db.users.update_one({"id": user_id}, {"$set": {"region": region}})
    if res.matched_count == 0:
        raise HTTPException(404, "User not found")
    return {"user_id": user_id, "region": region}
