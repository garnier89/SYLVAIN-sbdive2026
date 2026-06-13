from fastapi import APIRouter, Request, Response, HTTPException
from fastapi.responses import RedirectResponse
from datetime import datetime, timezone, timedelta
import uuid
import os
import secrets
import hashlib
import httpx

from core.config import db, logger, JWT_SECRET
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


# ===== Email security: verification (OTP + link) & password reset =====
VERIFY_TTL_MIN = 1440      # activation code/link valid 24h
RESET_TTL_MIN = 60         # reset code/link valid 1h
RESEND_COOLDOWN_SEC = 60
MAX_CODE_ATTEMPTS = 5


def _frontend_base() -> str:
    return os.environ.get("FRONTEND_URL", "").rstrip("/")


def _hash_secret(value: str) -> str:
    return hashlib.sha256(f"{JWT_SECRET}:{value}".encode()).hexdigest()


async def _issue_code(user: dict, purpose: str, ttl_min: int):
    """Create a 6-digit OTP + link token for the user/purpose (hashed at rest)."""
    code = f"{secrets.randbelow(900000) + 100000}"
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.auth_codes.delete_many({"user_id": user["id"], "purpose": purpose})
    await db.auth_codes.insert_one({
        "user_id": user["id"],
        "email": user.get("email"),
        "purpose": purpose,
        "code_hash": _hash_secret(code),
        "token_hash": _hash_secret(token),
        "attempts": 0,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=ttl_min)).isoformat(),
    })
    return code, token


async def _send_verification(user: dict) -> None:
    """Issue + email a verification code/link. Skips placeholder/empty emails."""
    email = (user.get("email") or "").strip()
    if not email or email.endswith("@sbdrive.local") or user.get("is_verified"):
        return
    code, token = await _issue_code(user, "verify", VERIFY_TTL_MIN)
    link = f"{_frontend_base()}/api/auth/verify-email?token={token}"
    from core.email import fire, send_verification_email
    fire(send_verification_email(email, user.get("name", ""), code, link))


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
    referral_code = data.get("referral_code", "").strip() if data.get("referral_code") else None

    await _validate_phone_register(phone, password, email)
    referrer_id = await _resolve_referrer(referral_code)

    full_name = f"{first_name} {name}".strip() if first_name or name else phone
    requested_role = data.get("role", "user")
    if requested_role not in ("user", "driver"):
        requested_role = "user"
    from routes.referral import generate_name_code, create_pending_referral
    own_code = await generate_name_code(full_name, requested_role == "driver")
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
        await create_pending_referral(referrer_id, user_doc)

    await _send_verification(user_doc)

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
    import re as _re
    referrer = await db.users.find_one(
        {"referral_code_own": _re.compile(f"^{_re.escape(referral_code)}$", _re.IGNORECASE)},
        {"_id": 0, "id": 1})
    return referrer["id"] if referrer else None


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

    await _send_verification(user_doc)

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


@router.post("/send-verification")
async def send_verification(request: Request):
    """Resend the email verification code/link for the current user (60s cooldown)."""
    user = await get_current_user(request)
    if user.get("is_verified"):
        return {"ok": True, "already_verified": True}
    existing = await db.auth_codes.find_one({"user_id": user["id"], "purpose": "verify"})
    if existing:
        elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(existing["created_at"])).total_seconds()
        if elapsed < RESEND_COOLDOWN_SEC:
            return {"ok": True, "cooldown": int(RESEND_COOLDOWN_SEC - elapsed)}
    full = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    await _send_verification(full)
    return {"ok": True, "cooldown": RESEND_COOLDOWN_SEC}


@router.post("/verify-otp")
async def verify_otp(request: Request):
    """Verify the 6-digit email code for the current user → flips is_verified."""
    user = await get_current_user(request)
    body = await request.json()
    code = str(body.get("code", "")).strip()
    if not code:
        raise HTTPException(status_code=400, detail="Code requis")
    doc = await db.auth_codes.find_one({"user_id": user["id"], "purpose": "verify"})
    if not doc:
        raise HTTPException(status_code=400, detail="Aucun code en attente. Demandez un nouveau code.")
    if datetime.fromisoformat(doc["expires_at"]) < datetime.now(timezone.utc):
        await db.auth_codes.delete_one({"_id": doc["_id"]})
        raise HTTPException(status_code=400, detail="Code expiré. Demandez un nouveau code.")
    if doc.get("attempts", 0) >= MAX_CODE_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Trop de tentatives. Demandez un nouveau code.")
    if _hash_secret(code) != doc["code_hash"]:
        await db.auth_codes.update_one({"_id": doc["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Code incorrect")
    await db.users.update_one({"id": user["id"]}, {"$set": {"is_verified": True}})
    await db.auth_codes.delete_many({"user_id": user["id"], "purpose": "verify"})
    return {"ok": True, "verified": True}


@router.get("/verify-email")
async def verify_email_link(token: str = ""):
    """Activation link target: flips is_verified then redirects to the frontend."""
    base = _frontend_base()
    doc = await db.auth_codes.find_one({"token_hash": _hash_secret(token), "purpose": "verify"}) if token else None
    if not doc:
        return RedirectResponse(url=f"{base}/verifier-email?status=invalid")
    if datetime.fromisoformat(doc["expires_at"]) < datetime.now(timezone.utc):
        await db.auth_codes.delete_one({"_id": doc["_id"]})
        return RedirectResponse(url=f"{base}/verifier-email?status=expired")
    await db.users.update_one({"id": doc["user_id"]}, {"$set": {"is_verified": True}})
    await db.auth_codes.delete_many({"user_id": doc["user_id"], "purpose": "verify"})
    return RedirectResponse(url=f"{base}/verifier-email?status=ok")


# ===== Firebase Phone Auth (OTP SMS) — vérification du numéro de téléphone =====

@router.get("/firebase/status")
async def firebase_status():
    """Indique au frontend si la vérification téléphone Firebase est active."""
    from core.firebase_auth import firebase_enabled
    return {"enabled": firebase_enabled()}


@router.post("/firebase/verify-phone")
async def firebase_verify_phone(request: Request):
    """Vérifie un ID token Firebase pour l'utilisateur connecté → marque le téléphone vérifié."""
    user = await get_current_user(request)
    body = await request.json()
    id_token = str(body.get("id_token", "")).strip()
    if not id_token:
        raise HTTPException(status_code=400, detail="id_token requis")
    from core.firebase_auth import firebase_enabled, verify_id_token, extract_phone
    if not firebase_enabled():
        raise HTTPException(status_code=503, detail="Vérification Firebase non configurée")
    try:
        decoded = verify_id_token(id_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Jeton de vérification invalide")
    phone = extract_phone(decoded)
    if not phone:
        raise HTTPException(status_code=400, detail="Aucun numéro vérifié dans le jeton")
    other = await db.users.find_one({"phone": phone, "id": {"$ne": user["id"]}}, {"_id": 0, "id": 1})
    if other:
        raise HTTPException(status_code=409, detail="Ce numéro est déjà rattaché à un autre compte")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"phone": phone, "phone_verified": True,
                  "phone_verified_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "phone": phone, "phone_verified": True}


@router.post("/firebase/login", response_model=TokenResponse)
async def firebase_phone_login(data: dict, response: Response):
    """Connexion/inscription sans mot de passe via un numéro vérifié par Firebase OTP."""
    from core.firebase_auth import firebase_enabled, verify_id_token, extract_phone
    if not firebase_enabled():
        raise HTTPException(status_code=503, detail="Vérification Firebase non configurée")
    id_token = str(data.get("id_token", "")).strip()
    if not id_token:
        raise HTTPException(status_code=400, detail="id_token requis")
    try:
        decoded = verify_id_token(id_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Jeton de vérification invalide")
    phone = extract_phone(decoded)
    if not phone:
        raise HTTPException(status_code=400, detail="Aucun numéro vérifié dans le jeton")
    now = datetime.now(timezone.utc)
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if user:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"phone_verified": True, "phone_verified_at": now.isoformat()}},
        )
        user["phone_verified"] = True
    else:
        name = str(data.get("name", "")).strip() or phone
        from routes.referral import generate_name_code, create_pending_referral
        referral_code = str(data.get("referral_code", "")).strip() or None
        referrer_id = await _resolve_referrer(referral_code)
        own_code = await generate_name_code(name, False)
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "id": user_id,
            "email": f"{phone.replace('+', '')}@sbdrive.local",
            "password_hash": hash_password(secrets.token_urlsafe(16)),
            "name": name,
            "phone": phone,
            "role": "user",
            "is_verified": False,
            "phone_verified": True,
            "phone_verified_at": now.isoformat(),
            "avatar_url": None,
            "referral_code_own": own_code,
            "referral_code_used": referral_code,
            "referred_by": referrer_id,
            "created_at": now.isoformat(),
        }
        await db.users.insert_one(dict(user))
        await db.wallets.insert_one({"user_id": user_id, "balance": 0.0, "created_at": now.isoformat()})
        if referrer_id:
            await create_pending_referral(referrer_id, user)
    access_token = create_access_token(user["id"], user.get("email", ""), user["role"])
    refresh_token = create_refresh_token(user["id"])
    _set_auth_cookies(response, access_token, refresh_token)
    user.pop("password_hash", None)
    user.pop("_id", None)
    if isinstance(user.get("created_at"), str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    return TokenResponse(access_token=access_token, user=UserResponse(**user))



@router.post("/forgot-password")
async def forgot_password(request: Request):
    """Send a password reset code + link. Always returns 200 (anti-enumeration)."""
    body = await request.json()
    email = (body.get("email", "") or "").strip().lower()
    if email:
        user = await db.users.find_one({"email": email}, {"_id": 0})
        if user and user.get("password_hash"):
            code, token = await _issue_code(user, "reset", RESET_TTL_MIN)
            link = f"{_frontend_base()}/reinitialiser-mot-de-passe?token={token}"
            from core.email import fire, send_password_reset_email
            fire(send_password_reset_email(email, user.get("name", ""), code, link))
    return {"ok": True, "message": "Si un compte existe pour cet email, un code de réinitialisation a été envoyé."}


@router.post("/reset-password")
async def reset_password(request: Request, response: Response):
    """Reset password via either {token,new_password} or {email,code,new_password}."""
    body = await request.json()
    new_password = body.get("new_password", "")
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Nouveau mot de passe trop court (min 6 caractères)")
    token = (body.get("token", "") or "").strip()
    email = (body.get("email", "") or "").strip().lower()
    code = str(body.get("code", "")).strip()

    if token:
        doc = await db.auth_codes.find_one({"token_hash": _hash_secret(token), "purpose": "reset"})
        if not doc:
            raise HTTPException(status_code=400, detail="Lien invalide ou déjà utilisé")
    elif email and code:
        doc = await db.auth_codes.find_one({"email": email, "purpose": "reset"})
        if not doc:
            raise HTTPException(status_code=400, detail="Code invalide ou expiré")
        if doc.get("attempts", 0) >= MAX_CODE_ATTEMPTS:
            raise HTTPException(status_code=429, detail="Trop de tentatives. Demandez un nouveau code.")
        if _hash_secret(code) != doc["code_hash"]:
            await db.auth_codes.update_one({"_id": doc["_id"]}, {"$inc": {"attempts": 1}})
            raise HTTPException(status_code=400, detail="Code incorrect")
    else:
        raise HTTPException(status_code=400, detail="Lien ou code requis")

    if datetime.fromisoformat(doc["expires_at"]) < datetime.now(timezone.utc):
        await db.auth_codes.delete_one({"_id": doc["_id"]})
        raise HTTPException(status_code=400, detail="Lien ou code expiré. Refaites une demande.")

    await db.users.update_one({"id": doc["user_id"]}, {"$set": {"password_hash": hash_password(new_password)}})
    await db.auth_codes.delete_many({"user_id": doc["user_id"], "purpose": "reset"})
    # Invalidate any existing session so the user logs in fresh with the new password.
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True, "message": "Mot de passe réinitialisé. Vous pouvez vous connecter."}



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
