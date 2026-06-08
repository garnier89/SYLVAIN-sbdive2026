from fastapi import APIRouter, Request, Response, HTTPException
from datetime import datetime, timezone, timedelta
import uuid
import httpx

from core.config import db, logger
from core.deps import (
    hash_password, verify_password, create_access_token,
    create_refresh_token, get_current_user
)
from models.schemas import (
    UserRegister, UserLogin, UserResponse, TokenResponse,
    AddressCreate, Address
)
from typing import List

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/check-phone")
async def check_phone(data: dict):
    """Check if a phone number is already registered."""
    phone = data.get("phone", "").strip().replace(" ", "")
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number required")
    user = await db.users.find_one({"phone": phone}, {"_id": 0, "id": 1, "name": 1, "phone": 1})
    return {"exists": user is not None}


@router.post("/phone-login", response_model=TokenResponse)
async def phone_login(data: dict, request: Request, response: Response):
    """Login with phone + password."""
    phone = data.get("phone", "").strip().replace(" ", "")
    password = data.get("password", "")
    if not phone or not password:
        raise HTTPException(status_code=400, detail="Phone and password required")

    identifier = f"{request.client.host}:{phone}"
    attempts = await db.login_attempts.find_one({"identifier": identifier})
    if attempts and attempts.get("count", 0) >= 5:
        lockout_until = datetime.fromisoformat(attempts["lockout_until"]) if attempts.get("lockout_until") else None
        if lockout_until and datetime.now(timezone.utc) < lockout_until:
            raise HTTPException(status_code=429, detail="Trop de tentatives. Réessayez plus tard.")
        else:
            await db.login_attempts.delete_one({"identifier": identifier})

    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if not user or not verify_password(password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"lockout_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}},
            upsert=True
        )
        raise HTTPException(status_code=401, detail="Mot de passe incorrect")

    await db.login_attempts.delete_one({"identifier": identifier})
    access_token = create_access_token(user["id"], user.get("email", ""), user["role"])
    refresh_token = create_refresh_token(user["id"])
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")

    user.pop("password_hash", None)
    if isinstance(user.get("created_at"), str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    return TokenResponse(access_token=access_token, user=UserResponse(**user))


@router.post("/phone-register", response_model=TokenResponse)
async def phone_register(data: dict, response: Response):
    """Register with phone + password + optional profile info."""
    phone = data.get("phone", "").strip().replace(" ", "")
    password = data.get("password", "")
    name = data.get("name", "").strip()
    first_name = data.get("first_name", "").strip()
    email = data.get("email", "").strip().lower() if data.get("email") else None
    referral_code = data.get("referral_code", "").strip().upper() if data.get("referral_code") else None

    await _validate_phone_register(phone, password, email)
    referrer_id = await _resolve_referrer(referral_code)
    own_code = await _generate_unique_referral_code()

    full_name = f"{first_name} {name}".strip() if first_name or name else phone
    requested_role = data.get("role", "user")
    if requested_role not in ("user", "driver"):
        requested_role = "user"
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "id": user_id,
        "email": email or f"{phone.replace('+', '')}@sbdrive.local",
        "password_hash": hash_password(password),
        "name": full_name,
        "phone": phone,
        "role": requested_role,
        "is_verified": False,
        "avatar_url": None,
        "referral_code_own": own_code,
        "referral_code_used": referral_code,
        "referred_by": referrer_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    await db.wallets.insert_one({"user_id": user_id, "balance": 0.0, "created_at": datetime.now(timezone.utc).isoformat()})

    if referrer_id:
        await _apply_referral_bonus(referrer_id, user_id, full_name, referral_code)

    access_token = create_access_token(user_id, user_doc["email"], "user")
    refresh_token = create_refresh_token(user_id)
    _set_auth_cookies(response, access_token, refresh_token)

    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    return TokenResponse(access_token=access_token, user=UserResponse(**user_doc))


async def _validate_phone_register(phone: str, password: str, email):
    if not phone or not password:
        raise HTTPException(status_code=400, detail="Phone and password required")
    if await db.users.find_one({"phone": phone}):
        raise HTTPException(status_code=400, detail="Ce numéro est déjà inscrit")
    if email and await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")


async def _resolve_referrer(referral_code):
    if not referral_code:
        return None
    referrer = await db.users.find_one({"referral_code_own": referral_code}, {"_id": 0, "id": 1})
    return referrer["id"] if referrer else None


async def _generate_unique_referral_code():
    import secrets
    import string
    own_code = None
    for _ in range(10):
        own_code = f"SB-{''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))}"
        if not await db.users.find_one({"referral_code_own": own_code}):
            break
    return own_code


async def _apply_referral_bonus(referrer_id: str, new_user_id: str, full_name: str, referral_code: str):
    from routes.referral import REFERRAL_AMOUNT
    now = datetime.now(timezone.utc).isoformat()
    await db.referrals.insert_one({
        "id": f"ref_{uuid.uuid4().hex[:12]}",
        "referrer_id": referrer_id,
        "referred_id": new_user_id,
        "referred_name": full_name,
        "code": referral_code,
        "amount_earned": REFERRAL_AMOUNT,
        "currency": "EUR",
        "status": "completed",
        "created_at": now,
    })
    await db.wallets.update_one({"user_id": referrer_id}, {"$inc": {"balance": REFERRAL_AMOUNT}}, upsert=False)
    ref_wallet = await db.wallets.find_one({"user_id": referrer_id}, {"_id": 0})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": referrer_id,
        "amount": REFERRAL_AMOUNT,
        "type": "referral_credit",
        "description": f"Bonus parrainage - {full_name} a rejoint avec votre code",
        "balance_after": ref_wallet["balance"] if ref_wallet else REFERRAL_AMOUNT,
        "created_at": now,
    })
    await db.wallets.update_one({"user_id": new_user_id}, {"$inc": {"balance": REFERRAL_AMOUNT}})
    await db.wallet_transactions.insert_one({
        "id": f"tx_{uuid.uuid4().hex[:12]}",
        "user_id": new_user_id,
        "amount": REFERRAL_AMOUNT,
        "type": "referral_bonus",
        "description": f"Bonus de bienvenue - Code {referral_code}",
        "balance_after": REFERRAL_AMOUNT,
        "created_at": now,
    })


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str):
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")


@router.post("/register", response_model=TokenResponse)
async def register(data: UserRegister, response: Response):
    email = data.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(data.password),
        "name": data.name,
        "phone": data.phone,
        "role": data.role if data.role in ["user", "driver", "merchant"] else "user",
        "is_verified": False,
        "avatar_url": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    await db.wallets.insert_one({"user_id": user_id, "balance": 0.0, "created_at": datetime.now(timezone.utc).isoformat()})

    access_token = create_access_token(user_id, email, user_doc["role"])
    refresh_token = create_refresh_token(user_id)
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")

    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)
    user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    return TokenResponse(access_token=access_token, user=UserResponse(**user_doc))


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, request: Request, response: Response):
    email = data.email.lower()
    identifier = f"{request.client.host}:{email}"

    attempts = await db.login_attempts.find_one({"identifier": identifier})
    if attempts and attempts.get("count", 0) >= 5:
        lockout_until = datetime.fromisoformat(attempts["lockout_until"]) if attempts.get("lockout_until") else None
        if lockout_until and datetime.now(timezone.utc) < lockout_until:
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")
        else:
            await db.login_attempts.delete_one({"identifier": identifier})

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"lockout_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}},
            upsert=True
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await db.login_attempts.delete_one({"identifier": identifier})
    access_token = create_access_token(user["id"], email, user["role"])
    refresh_token = create_refresh_token(user["id"])
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")

    user.pop("password_hash", None)
    if isinstance(user.get("created_at"), str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    return TokenResponse(access_token=access_token, user=UserResponse(**user))


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def get_me(request: Request):
    user = await get_current_user(request)
    if isinstance(user.get("created_at"), str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    return UserResponse(**user)


@router.post("/refresh")
async def refresh_token(request: Request, response: Response):
    import jwt as pyjwt
    from core.config import JWT_SECRET, JWT_ALGORITHM
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        access_token = create_access_token(user["id"], user["email"], user["role"])
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
        return {"access_token": access_token}
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


@router.post("/google/session")
async def google_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    # role_hint lets a brand-new Google account land as a CLIENT or a CHAUFFEUR
    # depending on which login screen they came from. Existing accounts keep their role.
    role_hint = body.get("role_hint", "user")
    if role_hint not in ("user", "driver"):
        role_hint = "user"
    if not session_id:
        raise HTTPException(status_code=400, detail="Session ID required")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session")
            google_data = resp.json()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Google auth error: {e}")
        raise HTTPException(status_code=500, detail="Authentication failed")

    email = google_data["email"].lower()
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})

    if existing_user:
        user = existing_user
        await db.users.update_one(
            {"email": email},
            {"$set": {"avatar_url": google_data.get("picture"), "name": google_data.get("name", existing_user["name"])}}
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "id": user_id, "email": email, "password_hash": "",
            "name": google_data.get("name", "User"), "phone": None, "role": role_hint,
            "is_verified": True, "avatar_url": google_data.get("picture"),
            "auth_provider": "google",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user)
        await db.wallets.insert_one({"user_id": user_id, "balance": 0.0, "created_at": datetime.now(timezone.utc).isoformat()})

    access_token = create_access_token(user["id"], email, user["role"])
    refresh_token = create_refresh_token(user["id"])
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")

    user.pop("password_hash", None)
    if isinstance(user.get("created_at"), str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    return TokenResponse(access_token=access_token, user=UserResponse(**user))


@router.post("/change-password")
async def change_password(request: Request):
    """Change the current user's password (requires current password)."""
    user = await get_current_user(request)
    body = await request.json()
    current_password = body.get("current_password", "")
    new_password = body.get("new_password", "")
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Nouveau mot de passe trop court (min 6 caractères)")
    full_user = await db.users.find_one({"id": user["id"]})
    if not full_user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if full_user.get("password_hash") and not verify_password(current_password, full_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(new_password)}})
    return {"ok": True, "message": "Mot de passe modifié avec succès"}



# === User Addresses ===
users_router = APIRouter(prefix="/users", tags=["users"])

@users_router.post("/push-token")
async def register_user_push_token(request: Request):
    """Store the Expo push token for the current user (and mirror to driver doc if any)."""
    user = await get_current_user(request)
    body = await request.json()
    token = body.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="Token requis")
    ts = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": user["id"]}, {"$set": {"push_token": token, "push_token_updated_at": ts}})
    await db.drivers.update_one({"user_id": user["id"]}, {"$set": {"push_token": token, "push_token_updated_at": ts}})
    return {"ok": True}


@users_router.put("/profile")
async def update_user_profile(request: Request):
    """Update the current user's editable profile fields (name, phone, avatar)."""
    user = await get_current_user(request)
    body = await request.json()
    updates = {}
    if isinstance(body.get("name"), str) and body["name"].strip():
        updates["name"] = body["name"].strip()
    if "phone" in body:
        updates["phone"] = (body.get("phone") or "").strip() or None
    if isinstance(body.get("avatar_url"), str):
        updates["avatar_url"] = body["avatar_url"]
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune donnée à mettre à jour")
    await db.users.update_one({"id": user["id"]}, {"$set": updates})
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return fresh


@users_router.put("/language")
async def update_user_language(request: Request):
    """Persist the current user's UI language (and optional currency) preference,
    so it follows them across devices."""
    user = await get_current_user(request)
    body = await request.json()
    updates = {}
    lang = body.get("language")
    if isinstance(lang, str) and 1 <= len(lang.strip()) <= 10:
        updates["language"] = lang.strip()
    curr = body.get("currency")
    if isinstance(curr, str) and 1 <= len(curr.strip()) <= 6:
        updates["currency"] = curr.strip()
    if not updates:
        raise HTTPException(status_code=400, detail="Aucune préférence à mettre à jour")
    await db.users.update_one({"id": user["id"]}, {"$set": updates})
    return {"ok": True, **updates}


@users_router.get("/addresses", response_model=List[Address])
async def get_addresses(request: Request):
    user = await get_current_user(request)
    addresses = await db.addresses.find({"user_id": user["id"]}, {"_id": 0}).to_list(100)
    return addresses

@users_router.post("/addresses", response_model=Address)
async def add_address(data: AddressCreate, request: Request):
    user = await get_current_user(request)
    if data.is_default:
        await db.addresses.update_many({"user_id": user["id"]}, {"$set": {"is_default": False}})
    address = {"id": f"addr_{uuid.uuid4().hex[:12]}", "user_id": user["id"], **data.model_dump()}
    await db.addresses.insert_one(address)
    address.pop("user_id", None)
    return Address(**address)

@users_router.delete("/addresses/{address_id}")
async def delete_address(address_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.addresses.delete_one({"id": address_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Address not found")
    return {"message": "Address deleted"}
