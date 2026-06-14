"""SB Tracking — Module Famille (localisation des proches).

Un utilisateur crée son cercle familial, ajoute des proches (membres) qui
partagent leur position via le téléphone (POST /family/share-ping, JWT) après
avoir rejoint avec un code d'invitation. Zones (maison/école/travail) avec
alertes d'arrivée/départ, bouton SOS, et flux d'alertes.
Des membres « démo » suivent un trajet simulé dérivé du temps (sans appareil).
"""
import math
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException

from core.config import db
from core.deps import get_current_user
from core.notifications import create_notification

router = APIRouter(prefix="/family", tags=["family-tracking"])

DEFAULT_CENTER = {"lat": 14.6036, "lng": -61.0667}
PLACE_KINDS = {"home", "school", "work", "other"}
MEMBER_COLORS = ["#EF4444", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _haversine_m(a_lat, a_lng, b_lat, b_lng) -> float:
    r = 6371000.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat); dl = math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


async def _get_or_create_circle(user: dict) -> dict:
    c = await db.family_circles.find_one({"owner_id": user["id"]}, {"_id": 0})
    if c:
        return c
    c = {
        "id": f"fam_{uuid.uuid4().hex[:12]}",
        "owner_id": user["id"],
        "name": "Ma famille",
        "center": DEFAULT_CENTER,
        "created_at": _now(),
    }
    await db.family_circles.insert_one(c)
    c.pop("_id", None)
    return c


async def _require_circle(request: Request):
    user = await get_current_user(request)
    circle = await _get_or_create_circle(user)
    return user, circle


async def _circle_recipients(circle_id: str, exclude_user_id: str = None) -> set:
    """User ids who should be notified for a circle: its owner + every linked member."""
    recipients = set()
    circle = await db.family_circles.find_one({"id": circle_id}, {"_id": 0, "owner_id": 1})
    if circle and circle.get("owner_id"):
        recipients.add(circle["owner_id"])
    async for m in db.family_members.find({"circle_id": circle_id, "user_id": {"$ne": None}}, {"_id": 0, "user_id": 1}):
        if m.get("user_id"):
            recipients.add(m["user_id"])
    recipients.discard(exclude_user_id)
    return recipients


async def _notify_circle(circle_id: str, ntype: str, title: str, body: str, exclude_user_id: str = None):
    """Push a real notification (DB + WebSocket + Web Push PWA + Expo) to every circle member."""
    for uid in await _circle_recipients(circle_id, exclude_user_id):
        try:
            await create_notification(uid, ntype, title, body,
                                      {"url": "/famille/alertes", "circle_id": circle_id})
        except Exception:
            pass


async def _users_phones(user_ids: set) -> list:
    """Retourne les numéros de téléphone (non vides) des utilisateurs donnés."""
    phones = []
    if not user_ids:
        return phones
    async for u in db.users.find({"id": {"$in": list(user_ids)}}, {"_id": 0, "phone": 1}):
        if u.get("phone"):
            phones.append(u["phone"])
    return phones


async def notify_user_circles(user: dict, ntype: str, title: str, body: str,
                              lat=None, lng=None, alert_type: str = None,
                              sms: bool = False, sms_body: str = None) -> dict:
    """Notifie tous les proches des cercles auxquels appartient l'utilisateur (le sien + ceux
    où il est membre relié). Réutilisé par SB Urgences pour alerter les contacts d'urgence.
    Joint un deep-link Google Maps si une position est fournie. Best-effort.
    Si `sms=True` (urgences), envoie aussi un VRAI SMS Twilio aux proches ayant un numéro.
    Retourne {"notified": n_push, "sms_sent": n_sms}."""
    circle_ids = set()
    own = await db.family_circles.find_one({"owner_id": user["id"]}, {"_id": 0, "id": 1})
    if own:
        circle_ids.add(own["id"])
    async for m in db.family_members.find({"user_id": user["id"]}, {"_id": 0, "circle_id": 1}):
        circle_ids.add(m["circle_id"])
    maps = f"https://maps.google.com/?q={lat},{lng}" if lat is not None and lng is not None else None
    url = maps or "/famille/alertes"
    notified = set()
    for cid in circle_ids:
        if alert_type:
            try:
                await _add_alert(cid, alert_type, body)
            except Exception:
                pass
        for uid in await _circle_recipients(cid, exclude_user_id=user["id"]):
            if uid in notified:
                continue
            notified.add(uid)
            try:
                await create_notification(uid, ntype, title, body,
                                          {"url": url, "circle_id": cid, "lat": lat, "lng": lng})
            except Exception:
                pass
    sms_sent = 0
    if sms:
        try:
            from core.sms import send_sms_to_many, sms_enabled
            if sms_enabled():
                phones = await _users_phones(notified)
                text = sms_body or body
                if maps:
                    text = f"{text} Position : {maps}"
                sms_sent = await send_sms_to_many(phones, text)
        except Exception:
            sms_sent = 0
    return {"notified": len(notified), "sms_sent": sms_sent}


def _live(m: dict) -> dict:
    """Live position of a member: simulated (demo) or last shared ping."""
    sim = m.get("sim") or {}
    if sim.get("enabled"):
        c = sim.get("center") or DEFAULT_CENTER
        period = float(sim.get("period_s", 360))
        phase = ((time.time() + float(sim.get("offset", 0))) % period) / period * 2 * math.pi
        r = float(sim.get("radius", 0.008))
        return {"lat": round(c["lat"] + r * math.sin(phase), 6),
                "lng": round(c["lng"] + r * math.cos(phase) * 1.4, 6),
                "speed": int(sim.get("speed_kmh", 5)), "battery": sim.get("battery", 80),
                "status": "online", "ts": _now()}
    last = m.get("last") or {}
    if not last.get("ts"):
        return {"lat": None, "lng": None, "speed": 0, "battery": last.get("battery"), "status": "offline", "ts": None}
    try:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(last["ts"])).total_seconds()
    except Exception:
        age = 0
    return {**last, "status": "online" if age < 300 else "offline"}


def _member_out(m: dict) -> dict:
    return {
        "id": m["id"], "name": m.get("name"), "relation": m.get("relation", "Proche"),
        "color": m.get("color", "#3B82F6"), "invite_code": m.get("invite_code"),
        "linked": bool(m.get("user_id")), "is_self": bool(m.get("is_self")),
        "live": _live(m), "created_at": m.get("created_at"),
    }


# ----------------------------------------------------------------- context
@router.get("/context")
async def family_context(request: Request):
    user, circle = await _require_circle(request)
    members = await db.family_members.count_documents({"circle_id": circle["id"]})
    places = await db.family_places.count_documents({"circle_id": circle["id"]})
    unread = await db.family_alerts.count_documents({"circle_id": circle["id"], "read": False})
    # Is this user a shared member of someone else's circle?
    shared = await db.family_members.count_documents({"user_id": user["id"]})
    return {"circle": circle, "counts": {"members": members, "places": places, "unread_alerts": unread, "sharing_for": shared}}


# ----------------------------------------------------------------- members
@router.get("/members")
async def list_members(request: Request):
    _user, circle = await _require_circle(request)
    ms = await db.family_members.find({"circle_id": circle["id"]}, {"_id": 0}).sort("created_at", 1).to_list(100)
    return {"members": [_member_out(m) for m in ms]}


@router.post("/members")
async def add_member(request: Request):
    user, circle = await _require_circle(request)
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nom requis")
    count = await db.family_members.count_documents({"circle_id": circle["id"]})
    is_self = bool(body.get("is_self"))
    m = {
        "id": f"mem_{uuid.uuid4().hex[:10]}",
        "circle_id": circle["id"],
        "name": name,
        "relation": (body.get("relation") or "Proche").strip(),
        "color": MEMBER_COLORS[count % len(MEMBER_COLORS)],
        "invite_code": f"FAM{uuid.uuid4().hex[:5].upper()}",
        "user_id": user["id"] if is_self else None,
        "is_self": is_self,
        "sim": {"enabled": False},
        "last": {}, "geo_state": {},
        "created_at": _now(),
    }
    await db.family_members.insert_one(m)
    m.pop("_id", None)
    return _member_out(m)


@router.delete("/members/{mid}")
async def delete_member(mid: str, request: Request):
    _user, circle = await _require_circle(request)
    res = await db.family_members.delete_one({"id": mid, "circle_id": circle["id"]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    return {"message": "Membre retiré"}


# ----------------------------------------------------------------- join & share (member side)
@router.post("/join")
async def join_member(request: Request):
    """An invited person links their account to a member slot via the code."""
    user = await get_current_user(request)
    body = await request.json()
    code = (body.get("code") or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Code requis")
    m = await db.family_members.find_one({"invite_code": code}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Code invalide")
    await db.family_members.update_one({"id": m["id"]}, {"$set": {"user_id": user["id"]}})
    circle = await db.family_circles.find_one({"id": m["circle_id"]}, {"_id": 0})
    return {"message": "Partage activé", "circle_name": (circle or {}).get("name"), "member_name": m.get("name")}


async def _eval_places(circle_id: str, member: dict, lat: float, lng: float):
    geo_state = dict(member.get("geo_state") or {})
    places = await db.family_places.find({"circle_id": circle_id}, {"_id": 0}).to_list(100)
    for p in places:
        inside = _haversine_m(lat, lng, p["lat"], p["lng"]) <= p["radius_m"]
        was = geo_state.get(p["id"])
        if was is not None and inside != was:
            verb = "est arrivé(e) à" if inside else "a quitté"
            msg = f"{member.get('name')} {verb} « {p['name']} »"
            await _add_alert(circle_id, "place", msg, member)
            await _notify_circle(circle_id, "family_place", "📍 Famille", msg,
                                 exclude_user_id=member.get("user_id"))
        geo_state[p["id"]] = inside
    return geo_state


@router.post("/share-ping")
async def share_ping(request: Request):
    """The current user pushes their phone position to every member slot they fill."""
    user = await get_current_user(request)
    body = await request.json()
    try:
        lat = float(body["lat"]); lng = float(body["lng"])
    except Exception:
        raise HTTPException(status_code=400, detail="lat/lng requis")
    speed = float(body.get("speed", 0) or 0)
    battery = body.get("battery")
    members = await db.family_members.find({"user_id": user["id"]}, {"_id": 0}).to_list(50)
    if not members:
        return {"message": "Aucun partage actif", "updated": 0}
    last = {"lat": lat, "lng": lng, "speed": speed, "ts": _now()}
    if battery is not None:
        last["battery"] = battery
    for m in members:
        geo_state = await _eval_places(m["circle_id"], m, lat, lng)
        await db.family_members.update_one({"id": m["id"]}, {"$set": {"last": last, "geo_state": geo_state}})
    return {"message": "ok", "updated": len(members)}


# ----------------------------------------------------------------- places
@router.get("/places")
async def list_places(request: Request):
    _user, circle = await _require_circle(request)
    ps = await db.family_places.find({"circle_id": circle["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"places": ps}


@router.post("/places")
async def create_place(request: Request):
    _user, circle = await _require_circle(request)
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name or body.get("lat") is None or body.get("lng") is None:
        raise HTTPException(status_code=400, detail="Nom et position requis")
    kind = body.get("kind") if body.get("kind") in PLACE_KINDS else "other"
    p = {
        "id": f"plc_{uuid.uuid4().hex[:10]}", "circle_id": circle["id"], "name": name, "kind": kind,
        "lat": float(body["lat"]), "lng": float(body["lng"]), "radius_m": int(body.get("radius_m", 200) or 200),
        "created_at": _now(),
    }
    await db.family_places.insert_one(p)
    p.pop("_id", None)
    return p


@router.delete("/places/{pid}")
async def delete_place(pid: str, request: Request):
    _user, circle = await _require_circle(request)
    res = await db.family_places.delete_one({"id": pid, "circle_id": circle["id"]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Lieu introuvable")
    return {"message": "Lieu supprimé"}


# ----------------------------------------------------------------- SOS & alerts
async def _add_alert(circle_id: str, atype: str, message: str, member=None):
    a = {
        "id": f"famalert_{uuid.uuid4().hex[:12]}", "circle_id": circle_id,
        "member_id": (member or {}).get("id"), "member_name": (member or {}).get("name"),
        "type": atype, "message": message, "read": False, "ts": _now(),
    }
    await db.family_alerts.insert_one(a)
    return a


@router.post("/sos")
async def trigger_sos(request: Request):
    """A member/owner raises an SOS. Alerts every circle they belong to (+ own)."""
    user = await get_current_user(request)
    body = await request.json()
    lat, lng = body.get("lat"), body.get("lng")
    loc = f" (lat {round(float(lat),4)}, lng {round(float(lng),4)})" if lat is not None and lng is not None else ""
    circle_ids = set()
    own = await db.family_circles.find_one({"owner_id": user["id"]}, {"_id": 0})
    if own:
        circle_ids.add(own["id"])
    member_name = user.get("name") or "Un proche"
    async for m in db.family_members.find({"user_id": user["id"]}, {"_id": 0}):
        circle_ids.add(m["circle_id"])
        member_name = m.get("name") or member_name
    if not circle_ids:
        circle = await _get_or_create_circle(user)
        circle_ids.add(circle["id"])
    for cid in circle_ids:
        msg = f"🆘 SOS de {member_name}{loc}"
        await _add_alert(cid, "sos", msg)
        # Maps deep-link so a parent can locate the sender instantly from the push.
        url = f"https://maps.google.com/?q={lat},{lng}" if lat is not None and lng is not None else "/famille/alertes"
        for uid in await _circle_recipients(cid, exclude_user_id=user["id"]):
            try:
                await create_notification(uid, "family_sos", "🆘 SOS Famille", msg,
                                          {"url": url, "circle_id": cid, "lat": lat, "lng": lng})
            except Exception:
                pass
    # Vrai SMS Twilio aux proches (urgences uniquement).
    sms_sent = 0
    try:
        from core.sms import send_sms_to_many, sms_enabled
        if sms_enabled():
            recipients = set()
            for cid in circle_ids:
                recipients |= await _circle_recipients(cid, exclude_user_id=user["id"])
            phones = await _users_phones(recipients)
            text = f"SB Famille : SOS de {member_name}."
            if lat is not None and lng is not None:
                text += f" Position : https://maps.google.com/?q={lat},{lng}"
            sms_sent = await send_sms_to_many(phones, text)
    except Exception:
        sms_sent = 0
    return {"message": "SOS envoyé", "circles": len(circle_ids), "sms_sent": sms_sent}


@router.get("/alerts")
async def list_alerts(request: Request):
    _user, circle = await _require_circle(request)
    alerts = await db.family_alerts.find({"circle_id": circle["id"]}, {"_id": 0}).sort("ts", -1).to_list(200)
    return {"alerts": alerts, "unread": sum(1 for a in alerts if not a.get("read"))}


@router.post("/alerts/{aid}/read")
async def read_alert(aid: str, request: Request):
    _user, circle = await _require_circle(request)
    await db.family_alerts.update_one({"id": aid, "circle_id": circle["id"]}, {"$set": {"read": True}})
    return {"message": "ok"}


@router.post("/alerts/read-all")
async def read_all_alerts(request: Request):
    _user, circle = await _require_circle(request)
    await db.family_alerts.update_many({"circle_id": circle["id"]}, {"$set": {"read": True}})
    return {"message": "ok"}


# ----------------------------------------------------------------- demo seed
@router.post("/seed-demo")
async def seed_demo(request: Request):
    _user, circle = await _require_circle(request)
    center = circle.get("center") or DEFAULT_CENTER
    existing = await db.family_members.count_documents({"circle_id": circle["id"]})
    demo = [("Maman", "Mère"), ("Léa (école)", "Fille")]
    created = []
    for i, (name, rel) in enumerate(demo):
        m = {
            "id": f"mem_{uuid.uuid4().hex[:10]}", "circle_id": circle["id"], "name": name, "relation": rel,
            "color": MEMBER_COLORS[(existing + i) % len(MEMBER_COLORS)], "invite_code": f"FAM{uuid.uuid4().hex[:5].upper()}",
            "user_id": None, "is_self": False,
            "sim": {"enabled": True, "center": {"lat": center["lat"] + i * 0.006, "lng": center["lng"] + i * 0.006},
                    "radius": 0.006 + i * 0.003, "period_s": 300 + i * 120, "offset": i * 90, "speed_kmh": 4 + i * 30, "battery": 82 - i * 15},
            "last": {}, "geo_state": {}, "created_at": _now(),
        }
        await db.family_members.insert_one(m)
        m.pop("_id", None); created.append(m)
    for name, kind, dlat, dlng in [("Maison", "home", 0.0, 0.0), ("École", "school", 0.006, 0.006)]:
        await db.family_places.insert_one({
            "id": f"plc_{uuid.uuid4().hex[:10]}", "circle_id": circle["id"], "name": name, "kind": kind,
            "lat": center["lat"] + dlat, "lng": center["lng"] + dlng, "radius_m": 250, "created_at": _now(),
        })
    if created:
        await _add_alert(circle["id"], "place", "Léa (école) est arrivé(e) à « École »", created[-1])
    return {"message": "Démo créée", "members": len(created)}
