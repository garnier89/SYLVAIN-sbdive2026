"""SB Pro Services — moteur générique de marketplace de services à la demande.

Réutilisable par verticale (Phase 1 = `beauty`, Phase 2 = `trades`, …). Chaque
verticale a son catalogue (catégories + prestations), ses prestataires (espace
pro avec KYC), ses réservations (paiement SB Pay débité à la réservation OU
espèces sur place), et ses avis clients. Commission plateforme à la complétion.

Collections (scopées par champ `vertical`) :
  - pro_providers  : profils prestataires (réels, espace pro + KYC) + démo seedés
  - pro_bookings   : réservations (cycle pending→confirmed→in_progress→completed)
  - pro_reviews    : avis clients (recalculent la note du prestataire)
  - pro_settings   : config par verticale (commission_pct), id = vertical
"""
from fastapi import APIRouter, Request, HTTPException
import uuid
from datetime import datetime, timezone, timedelta

from core.config import db
from core.deps import get_current_user, require_role
from core.notifications import create_notification

router = APIRouter(prefix="/pro-services", tags=["pro-services"])
admin_router = APIRouter(prefix="/admin/pro-services", tags=["admin-pro-services"])

DEFAULT_COMMISSION_PCT = 0.15
BOOKING_STATUSES = ["pending", "confirmed", "in_progress", "completed", "cancelled"]
PAYMENT_METHODS = ["sbpay", "cash"]


# ── Verticale : Beauté ───────────────────────────────────────────────────────
def _svc(sid, category, name, price, duration, online_only=False):
    return {"id": sid, "category": category, "name": name, "price": float(price),
            "duration_min": duration, "online_only": online_only}


BEAUTY = {
    "label": "Services Beauté",
    "accent": "pink",
    "home_surcharge": 15.0,
    "categories": [
        {"id": "coiffure", "label": "Coiffure", "icon": "Scissors"},
        {"id": "visage", "label": "Soins du visage", "icon": "Sparkle"},
        {"id": "corps", "label": "Soins du corps & massage", "icon": "HandSoap"},
        {"id": "epilation", "label": "Épilation", "icon": "Drop"},
        {"id": "onglerie", "label": "Onglerie", "icon": "PaintBrush"},
        {"id": "maquillage", "label": "Maquillage", "icon": "PaintBrushHousehold"},
        {"id": "regard", "label": "Beauté du regard", "icon": "Eye"},
    ],
    "services": [
        _svc("b_coupe_femme", "coiffure", "Coupe femme", 35, 45),
        _svc("b_coupe_homme", "coiffure", "Coupe homme", 22, 30),
        _svc("b_coupe_enfant", "coiffure", "Coupe enfant", 18, 30),
        _svc("b_brushing", "coiffure", "Brushing", 28, 30),
        _svc("b_coloration", "coiffure", "Coloration", 55, 90),
        _svc("b_balayage", "coiffure", "Mèches & balayage", 85, 120, online_only=True),
        _svc("b_coiffure_event", "coiffure", "Coiffure événementielle", 90, 90, online_only=True),
        _svc("b_nettoyage_peau", "visage", "Nettoyage de peau", 45, 45),
        _svc("b_hydra_antiage", "visage", "Hydratation & anti-âge", 60, 60),
        _svc("b_anti_acne", "visage", "Soin anti-acné", 50, 45),
        _svc("b_gommage_masque", "visage", "Gommage & masque", 40, 40),
        _svc("b_soin_eclat", "visage", "Soin éclat & fermeté", 65, 60),
        _svc("b_gommage_corps", "corps", "Gommage corporel", 50, 45),
        _svc("b_enveloppement", "corps", "Enveloppement", 65, 60),
        _svc("b_massage_relax", "corps", "Massage relaxant", 60, 60),
        _svc("b_massage_thera", "corps", "Massage thérapeutique", 75, 60),
        _svc("b_amincissant", "corps", "Soin amincissant", 70, 60),
        _svc("b_hydra_corps", "corps", "Hydratation du corps", 45, 45),
        _svc("b_cire_jambes", "epilation", "Épilation cire (jambes)", 35, 30),
        _svc("b_cire_visage", "epilation", "Épilation cire (visage)", 18, 20),
        _svc("b_epil_fil", "epilation", "Épilation au fil", 20, 20),
        _svc("b_epil_laser", "epilation", "Épilation au laser", 90, 45, online_only=True),
        _svc("b_epil_definitive", "epilation", "Épilation définitive", 150, 60, online_only=True),
        _svc("b_manucure", "onglerie", "Manucure", 25, 40),
        _svc("b_pedicure", "onglerie", "Pédicure", 30, 45),
        _svc("b_vernis_semi", "onglerie", "Vernis semi-permanent", 35, 45),
        _svc("b_gel_resine", "onglerie", "Pose gel & résine", 45, 60),
        _svc("b_nail_art", "onglerie", "Nail art", 15, 30),
        _svc("b_maq_jour", "maquillage", "Maquillage de jour", 40, 45),
        _svc("b_maq_soiree", "maquillage", "Maquillage de soirée", 55, 60),
        _svc("b_maq_mariage", "maquillage", "Maquillage de mariage", 150, 90, online_only=True),
        _svc("b_maq_pro", "maquillage", "Maquillage pro événement", 120, 90, online_only=True),
        _svc("b_teinture", "regard", "Teinture cils & sourcils", 25, 30),
        _svc("b_rehaussement", "regard", "Rehaussement de cils", 45, 60),
        _svc("b_extensions", "regard", "Extensions de cils", 70, 90, online_only=True),
        _svc("b_microblading", "regard", "Microblading sourcils", 180, 120, online_only=True),
    ],
}

VERTICALS = {"beauty": BEAUTY}

SLOTS = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00"]


# ── Verticale : Métiers & Réparation ─────────────────────────────────────────
TRADES = {
    "label": "SB Métiers & Réparation",
    "accent": "amber",
    "home_surcharge": 0.0,  # l'intervention est par nature au domicile/sur site
    "categories": [
        {"id": "plomberie", "label": "Plomberie", "icon": "Wrench"},
        {"id": "electricite", "label": "Électricité", "icon": "Lightning"},
        {"id": "maconnerie", "label": "Maçonnerie", "icon": "Bank"},
        {"id": "menuiserie", "label": "Menuiserie", "icon": "Hammer"},
        {"id": "peinture", "label": "Peinture", "icon": "PaintRoller"},
        {"id": "bricolage", "label": "Bricolage", "icon": "Toolbox"},
        {"id": "menage", "label": "Ménage à domicile", "icon": "Broom"},
        {"id": "jardinage", "label": "Espaces verts", "icon": "Plant"},
        {"id": "cuisine", "label": "Cuisinier", "icon": "CookingPot"},
        {"id": "mecanique", "label": "Mécanique", "icon": "Gear"},
    ],
    "services": [
        _svc("t_fuite", "plomberie", "Réparation de fuite", 60, 60),
        _svc("t_debouchage", "plomberie", "Débouchage canalisation", 80, 60),
        _svc("t_sanitaire", "plomberie", "Installation sanitaire", 120, 120),
        _svc("t_chauffe_eau", "plomberie", "Chauffe-eau (pose/dépannage)", 150, 120),
        _svc("t_depannage_elec", "electricite", "Dépannage électrique", 70, 60),
        _svc("t_prise", "electricite", "Pose prise / interrupteur", 50, 45),
        _svc("t_tableau", "electricite", "Tableau électrique", 180, 180, online_only=True),
        _svc("t_eclairage", "electricite", "Installation éclairage", 60, 60),
        _svc("t_petits_travaux", "maconnerie", "Petits travaux de maçonnerie", 120, 120),
        _svc("t_cloison", "maconnerie", "Mur / cloison", 250, 240, online_only=True),
        _svc("t_carrelage", "maconnerie", "Pose de carrelage", 200, 240, online_only=True),
        _svc("t_ragreage", "maconnerie", "Ragréage de sol", 180, 180),
        _svc("t_pose_porte", "menuiserie", "Pose de porte", 130, 120),
        _svc("t_sur_mesure", "menuiserie", "Meuble sur-mesure", 300, 240, online_only=True),
        _svc("t_repar_menuiserie", "menuiserie", "Réparation menuiserie", 80, 90),
        _svc("t_parquet", "menuiserie", "Pose de parquet", 220, 240, online_only=True),
        _svc("t_peinture_piece", "peinture", "Peinture d'une pièce", 180, 240),
        _svc("t_facade", "peinture", "Peinture de façade", 400, 480, online_only=True),
        _svc("t_enduit", "peinture", "Enduit & rebouchage", 150, 180),
        _svc("t_papier_peint", "peinture", "Pose de papier peint", 160, 180),
        _svc("t_montage_meuble", "bricolage", "Montage de meuble", 45, 60),
        _svc("t_fixation", "bricolage", "Fixation / étagère", 40, 45),
        _svc("t_tv_murale", "bricolage", "Pose TV murale", 60, 60),
        _svc("t_divers", "bricolage", "Petits travaux divers", 50, 60),
        _svc("t_menage_dom", "menage", "Ménage à domicile", 35, 120),
        _svc("t_grand_menage", "menage", "Grand ménage", 70, 240),
        _svc("t_vitres", "menage", "Nettoyage de vitres", 40, 90),
        _svc("t_repassage", "menage", "Repassage", 30, 90),
        _svc("t_tonte", "jardinage", "Tonte de pelouse", 45, 90),
        _svc("t_taille_haie", "jardinage", "Taille de haie", 60, 120),
        _svc("t_entretien_jardin", "jardinage", "Entretien de jardin", 80, 180),
        _svc("t_debroussaillage", "jardinage", "Débroussaillage", 70, 120),
        _svc("t_chef_domicile", "cuisine", "Chef à domicile", 120, 180, online_only=True),
        _svc("t_repas_event", "cuisine", "Repas événementiel", 200, 300, online_only=True),
        _svc("t_cours_cuisine", "cuisine", "Cours de cuisine", 90, 120),
        _svc("t_vidange", "mecanique", "Vidange", 70, 60),
        _svc("t_diagnostic", "mecanique", "Diagnostic auto", 50, 45),
        _svc("t_freins", "mecanique", "Plaquettes / freins", 120, 120),
        _svc("t_batterie_meca", "mecanique", "Batterie (test/remplacement)", 60, 45),
    ],
}

VERTICALS["trades"] = TRADES

# Demo providers per vertical (idempotent seed; no user_id = not loggable).
_AV = "https://images.unsplash.com/"
_BEAUTY_PROVIDERS = [
    ("Studio Élégance", ["coiffure", "maquillage"], 4.8, 214, "photo-1560066984-138dadb4c035?w=400", "Salon de coiffure & maquillage au cœur de Paris."),
    ("L'Atelier Beauté", ["visage", "corps"], 4.7, 168, "photo-1570172619644-dfd03ed5d881?w=400", "Soins du visage et du corps, esthéticiennes diplômées."),
    ("Nails & Co", ["onglerie"], 4.9, 302, "photo-1604654894610-df63bc536371?w=400", "Onglerie experte : manucure, gel, nail art."),
    ("Wax Expert", ["epilation"], 4.6, 121, "photo-1596178060810-72660ee8d4a8?w=400", "Épilation cire, fil et laser en toute douceur."),
    ("Regard Sublime", ["regard", "maquillage"], 4.8, 96, "photo-1512496015851-a90fb38ba796?w=400", "Spécialiste cils & sourcils : extensions, microblading."),
    ("Zen Spa & Massage", ["corps"], 4.9, 188, "photo-1544161515-4ab6ce6db874?w=400", "Massages relaxants et thérapeutiques, cadre zen."),
]

_TRADES_PROVIDERS = [
    ("Dépann'Plomberie", ["plomberie"], 4.7, 142, "photo-1607472586893-edb57bdc0e39?w=400", "Plombier réactif, dépannage et installations."),
    ("Élec Pro Services", ["electricite"], 4.8, 176, "photo-1621905251189-08b45d6a269e?w=400", "Électricien certifié, mise aux normes et dépannage."),
    ("BâtiMaçon", ["maconnerie", "peinture"], 4.6, 88, "photo-1581094794329-c8112a89af12?w=400", "Maçonnerie, carrelage et peinture intérieure/extérieure."),
    ("L'Atelier Bois", ["menuiserie", "bricolage"], 4.9, 121, "photo-1504148455328-c376907d081c?w=400", "Menuisier & bricoleur : pose, sur-mesure, réparations."),
    ("Maison Net", ["menage"], 4.8, 264, "photo-1581578731548-c64695cc6952?w=400", "Ménage à domicile, vitres et repassage soignés."),
    ("Vert Jardin", ["jardinage"], 4.7, 97, "photo-1416879595882-3373a0480b5b?w=400", "Entretien d'espaces verts, tonte et taille."),
    ("Chef à la Maison", ["cuisine"], 4.9, 64, "photo-1556910103-1c02745aae4d?w=400", "Chef à domicile pour vos repas et événements."),
    ("Méca Express", ["mecanique"], 4.6, 153, "photo-1486262715619-67b85e0b08d3?w=400", "Mécanicien : vidange, freins, diagnostic."),
]

_DEMO_PROVIDERS = {"beauty": _BEAUTY_PROVIDERS, "trades": _TRADES_PROVIDERS}


def _now():
    return datetime.now(timezone.utc).isoformat()


def _vcfg(vertical: str) -> dict:
    cfg = VERTICALS.get(vertical)
    if not cfg:
        raise HTTPException(status_code=404, detail="Verticale inconnue")
    return cfg


async def _commission_pct(vertical: str) -> float:
    doc = await db.pro_settings.find_one({"id": vertical}, {"_id": 0})
    if doc and doc.get("commission_pct") is not None:
        return float(doc["commission_pct"])
    return DEFAULT_COMMISSION_PCT


def _svc_by_id(vertical: str, sid: str) -> dict:
    for s in _vcfg(vertical)["services"]:
        if s["id"] == sid:
            return s
    return None


async def _ensure_seed(vertical: str):
    providers = _DEMO_PROVIDERS.get(vertical)
    if not providers:
        return
    if await db.pro_providers.count_documents({"vertical": vertical, "is_demo": True}) > 0:
        return
    docs = []
    for i, (name, cats, rating, reviews, photo, bio) in enumerate(providers):
        docs.append({
            "id": f"prov_{vertical}_{i+1:03d}", "vertical": vertical, "user_id": None,
            "name": name, "categories": cats, "rating": rating, "reviews_count": reviews,
            "photo": f"{_AV}{photo}", "bio": bio, "city": "Paris", "phone": "",
            "is_demo": True, "is_available": True, "verification_status": "approved",
            "documents": {}, "created_at": _now(),
        })
    if docs:
        await db.pro_providers.insert_many(docs)


def _provider_pub(p: dict) -> dict:
    out = dict(p or {})
    out.pop("_id", None)
    return out


def _booking_pub(b: dict) -> dict:
    out = dict(b or {})
    out.pop("_id", None)
    return out


# ── Public : catalogue & prestataires ───────────────────────────────────────
@router.get("/{vertical}/config")
async def get_config(vertical: str):
    cfg = _vcfg(vertical)
    return {
        "vertical": vertical, "label": cfg["label"], "accent": cfg["accent"],
        "home_surcharge": cfg["home_surcharge"], "categories": cfg["categories"],
        "services": cfg["services"], "payment_methods": PAYMENT_METHODS,
    }


@router.get("/{vertical}/providers")
async def list_providers(vertical: str, category: str = None):
    _vcfg(vertical)
    await _ensure_seed(vertical)
    query = {"vertical": vertical, "verification_status": "approved"}
    if category:
        query["categories"] = category
    providers = await db.pro_providers.find(query, {"_id": 0, "documents": 0}).sort("rating", -1).to_list(200)
    return providers


@router.get("/{vertical}/providers/{provider_id}")
async def get_provider(vertical: str, provider_id: str):
    p = await db.pro_providers.find_one({"id": provider_id, "vertical": vertical}, {"_id": 0, "documents": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Prestataire introuvable")
    reviews = await db.pro_reviews.find({"provider_id": provider_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {**p, "reviews": reviews}


@router.get("/{vertical}/providers/{provider_id}/next-slots")
async def provider_next_slots(vertical: str, provider_id: str):
    """3 prochains créneaux libres du prestataire (7 jours), pour rassurer le client."""
    _vcfg(vertical)
    booked = await db.pro_bookings.find(
        {"vertical": vertical, "provider_id": provider_id,
         "status": {"$in": ["pending", "confirmed", "in_progress"]}},
        {"_id": 0, "scheduled_date": 1, "scheduled_time": 1}).to_list(1000)
    taken = {(b.get("scheduled_date"), b.get("scheduled_time")) for b in booked}
    out = []
    today = datetime.now(timezone.utc).date()
    for d in range(0, 7):
        day = today + timedelta(days=d)
        ds = day.isoformat()
        for t in SLOTS:
            if (ds, t) in taken:
                continue
            lbl = "Aujourd'hui" if d == 0 else ("Demain" if d == 1 else day.strftime("%d/%m"))
            out.append({"date": ds, "time": t, "label": f"{lbl} · {t}"})
            if len(out) >= 3:
                return {"slots": out}
    return {"slots": out}


@router.post("/{vertical}/estimate")
async def estimate(vertical: str, request: Request):
    cfg = _vcfg(vertical)
    body = await request.json()
    svc = _svc_by_id(vertical, body.get("service_id"))
    if not svc:
        raise HTTPException(status_code=400, detail="Prestation invalide")
    at_home = bool(body.get("at_home"))
    surcharge = cfg["home_surcharge"] if at_home else 0.0
    total = round(float(svc["price"]) + surcharge, 2)
    return {"service_id": svc["id"], "service_name": svc["name"], "base_price": svc["price"],
            "at_home": at_home, "home_surcharge": surcharge, "total": total,
            "online_only": svc["online_only"], "currency": "EUR"}


# ── Réservations (client) ────────────────────────────────────────────────────
@router.post("/{vertical}/bookings")
async def create_booking(vertical: str, request: Request):
    cfg = _vcfg(vertical)
    user = await get_current_user(request)
    body = await request.json()
    svc = _svc_by_id(vertical, body.get("service_id"))
    if not svc:
        raise HTTPException(status_code=400, detail="Prestation invalide")
    if not (body.get("scheduled_date") and body.get("scheduled_time")):
        raise HTTPException(status_code=400, detail="Choisissez une date et un créneau")

    at_home = bool(body.get("at_home"))
    if at_home and not (body.get("address") or "").strip():
        raise HTTPException(status_code=400, detail="Indiquez l'adresse pour une prestation à domicile")

    payment_method = body.get("payment_method", "sbpay")
    if payment_method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Mode de paiement invalide")
    if svc["online_only"] and payment_method != "sbpay":
        raise HTTPException(status_code=400, detail="Cette prestation doit être payée en ligne (SB Pay)")

    surcharge = cfg["home_surcharge"] if at_home else 0.0
    total = round(float(svc["price"]) + surcharge, 2)

    # Resolve chosen provider (optional). null = "premier prestataire disponible".
    provider_id = body.get("provider_id")
    provider = None
    if provider_id:
        provider = await db.pro_providers.find_one(
            {"id": provider_id, "vertical": vertical, "verification_status": "approved"}, {"_id": 0})
        if not provider:
            raise HTTPException(status_code=400, detail="Prestataire indisponible")
    status = "confirmed" if provider else "pending"

    # Payment: SB Pay debited now (refundable on cancel); cash paid on site.
    new_balance, payment_status = None, "on_site"
    if payment_method == "sbpay" and total > 0:
        res = await db.wallets.update_one(
            {"user_id": user["id"], "balance": {"$gte": total}}, {"$inc": {"balance": -total}})
        if res.modified_count == 0:
            raise HTTPException(status_code=400, detail="Solde SB Pay insuffisant. Rechargez votre portefeuille.")
        wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
        new_balance = round((wallet or {}).get("balance", 0), 2)
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Booking",
            "amount": -total, "balance_after": new_balance,
            "description": f"{cfg['label']} · {svc['name']}", "status": "completed", "created_at": _now()})
        payment_status = "paid"
        try:
            from core.cashback import award_cashback
            await award_cashback(user["id"], total, "sbpay", "pro_services", ref_id=None)
        except Exception:
            pass

    booking = {
        "id": f"psb_{uuid.uuid4().hex[:12]}", "vertical": vertical,
        "user_id": user["id"], "user_name": user.get("name", ""),
        "service_id": svc["id"], "service_name": svc["name"], "category": svc["category"],
        "provider_id": provider_id, "provider_name": (provider or {}).get("name"),
        "provider_user_id": (provider or {}).get("user_id"),
        "at_home": at_home, "address": body.get("address", ""),
        "scheduled_date": body.get("scheduled_date"), "scheduled_time": body.get("scheduled_time"),
        "notes": body.get("notes", ""), "base_price": svc["price"], "home_surcharge": surcharge,
        "total": total, "payment_method": payment_method, "payment_status": payment_status,
        "status": status, "reviewed": False, "created_at": _now(),
    }
    await db.pro_bookings.insert_one(dict(booking))

    # Notify: chosen real provider, or all approved real providers serving the category.
    try:
        if provider and provider.get("user_id"):
            await create_notification(provider["user_id"], "pro_booking_new",
                                      "🗓️ Nouvelle réservation", f"{svc['name']} · {booking['scheduled_date']}",
                                      {"booking_id": booking["id"], "url": f"/pro/{vertical}"})
        elif not provider:
            pros = await db.pro_providers.find(
                {"vertical": vertical, "verification_status": "approved", "is_available": True,
                 "user_id": {"$ne": None}, "categories": svc["category"]}, {"_id": 0, "user_id": 1}).to_list(100)
            for pr in pros:
                await create_notification(pr["user_id"], "pro_booking_new",
                                          "🔔 Nouvelle demande de prestation", f"{svc['name']} · {booking['scheduled_date']}",
                                          {"booking_id": booking["id"], "url": f"/pro/{vertical}"})
    except Exception:
        pass

    return {**_booking_pub(booking), "balance": new_balance}


@router.get("/{vertical}/bookings")
async def list_bookings(vertical: str, request: Request):
    user = await get_current_user(request)
    docs = await db.pro_bookings.find({"vertical": vertical, "user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    upcoming = [b for b in docs if b["status"] in ("pending", "confirmed", "in_progress")]
    past = [b for b in docs if b["status"] in ("completed", "cancelled")]
    return {"upcoming": upcoming, "past": past}


@router.get("/{vertical}/bookings/{booking_id}")
async def get_booking(vertical: str, booking_id: str, request: Request):
    user = await get_current_user(request)
    b = await db.pro_bookings.find_one({"id": booking_id, "vertical": vertical, "user_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    return b


@router.post("/{vertical}/bookings/{booking_id}/cancel")
async def cancel_booking(vertical: str, booking_id: str, request: Request):
    user = await get_current_user(request)
    b = await db.pro_bookings.find_one({"id": booking_id, "vertical": vertical, "user_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if b["status"] in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Réservation déjà terminée ou annulée")
    # Refund SB Pay if it was paid online.
    if b.get("payment_method") == "sbpay" and b.get("payment_status") == "paid":
        total = round(float(b.get("total", 0) or 0), 2)
        await db.wallets.update_one({"user_id": user["id"]}, {"$inc": {"balance": total}}, upsert=True)
        wallet = await db.wallets.find_one({"user_id": user["id"]}, {"_id": 0})
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": user["id"], "type": "Refund",
            "amount": total, "balance_after": round((wallet or {}).get("balance", 0), 2),
            "description": f"Remboursement · {b.get('service_name', '')}", "status": "completed", "created_at": _now()})
    await db.pro_bookings.update_one({"id": booking_id}, {"$set": {"status": "cancelled", "cancelled_at": _now()}})
    return {"ok": True}


@router.post("/{vertical}/bookings/{booking_id}/complete")
async def client_complete(vertical: str, booking_id: str, request: Request):
    """The client confirms the service was delivered (works for demo providers too)."""
    user = await get_current_user(request)
    b = await db.pro_bookings.find_one({"id": booking_id, "vertical": vertical, "user_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if b["status"] in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Réservation déjà clôturée")
    await _settle_completion(vertical, b)
    return {"ok": True, "status": "completed"}


@router.post("/{vertical}/bookings/{booking_id}/review")
async def review_booking(vertical: str, booking_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    rating = int(body.get("rating") or 0)
    if not (1 <= rating <= 5):
        raise HTTPException(status_code=400, detail="Note invalide (1 à 5)")
    b = await db.pro_bookings.find_one({"id": booking_id, "vertical": vertical, "user_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if b["status"] != "completed":
        raise HTTPException(status_code=400, detail="Vous pourrez noter après la prestation")
    if b.get("reviewed"):
        raise HTTPException(status_code=400, detail="Avis déjà déposé")
    await db.pro_reviews.insert_one({
        "id": f"rev_{uuid.uuid4().hex[:12]}", "vertical": vertical, "booking_id": booking_id,
        "provider_id": b.get("provider_id"), "user_id": user["id"], "user_name": user.get("name", ""),
        "rating": rating, "comment": (body.get("comment") or "").strip(), "created_at": _now()})
    await db.pro_bookings.update_one({"id": booking_id}, {"$set": {"reviewed": True}})
    # Recompute provider rating from reviews.
    if b.get("provider_id"):
        revs = await db.pro_reviews.find({"provider_id": b["provider_id"]}, {"_id": 0, "rating": 1}).to_list(1000)
        if revs:
            avg = round(sum(r["rating"] for r in revs) / len(revs), 1)
            await db.pro_providers.update_one({"id": b["provider_id"]},
                                              {"$set": {"rating": avg, "reviews_count": len(revs)}})
    return {"ok": True}


async def _settle_completion(vertical: str, b: dict):
    """Mark completed + commission split. Credits real provider's wallet (sbpay)."""
    if b["status"] == "completed":
        return
    total = round(float(b.get("total", 0) or 0), 2)
    pct = await _commission_pct(vertical)
    commission = round(total * pct, 2)
    provider_earning = round(total - commission, 2)
    await db.pro_bookings.update_one(
        {"id": b["id"]},
        {"$set": {"status": "completed", "completed_at": _now(), "commission_pct": pct,
                  "commission": commission, "provider_earning": provider_earning,
                  "payment_status": "paid" if b.get("payment_method") == "sbpay" else b.get("payment_status")}})
    op_id = b.get("provider_user_id")
    if op_id and b.get("payment_method") == "sbpay" and provider_earning > 0:
        await db.wallets.update_one({"user_id": op_id}, {"$inc": {"balance": provider_earning}}, upsert=True)
        w = await db.wallets.find_one({"user_id": op_id}, {"_id": 0})
        await db.wallet_transactions.insert_one({
            "id": f"tx_{uuid.uuid4().hex[:12]}", "user_id": op_id, "type": "Earning",
            "amount": provider_earning, "balance_after": round((w or {}).get("balance", 0), 2),
            "description": f"{VERTICALS[vertical]['label']} · {b.get('service_name', '')} (net)",
            "status": "completed", "created_at": _now()})
    await db.pro_revenue.insert_one({
        "id": f"prev_{uuid.uuid4().hex[:12]}", "vertical": vertical, "booking_id": b["id"],
        "provider_user_id": op_id, "total": total, "commission": commission,
        "provider_earning": provider_earning, "commission_pct": pct,
        "collected": b.get("payment_method") == "sbpay", "created_at": _now()})
    try:
        await create_notification(b["user_id"], "pro_booking_done", "✨ Prestation terminée",
                                  f"{b.get('service_name', '')} — laissez un avis !",
                                  {"booking_id": b["id"], "url": f"/{ 'beauty' if vertical=='beauty' else 'pro/'+vertical}"})
    except Exception:
        pass


# ── Espace prestataire ───────────────────────────────────────────────────────
@router.get("/{vertical}/provider/me")
async def provider_me(vertical: str, request: Request):
    user = await get_current_user(request)
    p = await db.pro_providers.find_one({"vertical": vertical, "user_id": user["id"]}, {"_id": 0})
    if not p:
        return {"registered": False, "categories": _vcfg(vertical)["categories"]}
    jobs = await db.pro_bookings.find(
        {"vertical": vertical, "provider_user_id": user["id"]},
        {"_id": 0, "status": 1, "total": 1, "provider_earning": 1, "payment_method": 1}).to_list(500)
    completed = [j for j in jobs if j.get("status") == "completed"]
    pct = await _commission_pct(vertical)
    earnings = round(sum(float(j.get("provider_earning", round(float(j.get("total", 0) or 0) * (1 - pct), 2)) or 0)
                         for j in completed if j.get("payment_method") == "sbpay"), 2)
    return {"registered": True, "provider": p, "commission_pct": pct,
            "categories": _vcfg(vertical)["categories"], "stats": {
                "completed": len(completed),
                "active": len([j for j in jobs if j.get("status") in ("confirmed", "in_progress")]),
                "earnings": earnings,
            }}


@router.post("/{vertical}/provider/register")
async def provider_register(vertical: str, request: Request):
    _vcfg(vertical)
    user = await get_current_user(request)
    body = await request.json()
    cats = [c for c in (body.get("categories") or []) if c in {c2["id"] for c2 in _vcfg(vertical)["categories"]}]
    if not cats:
        raise HTTPException(status_code=400, detail="Choisissez au moins une spécialité")
    existing = await db.pro_providers.find_one({"vertical": vertical, "user_id": user["id"]}, {"_id": 0})
    doc = {
        "id": (existing or {}).get("id") or f"prov_{vertical}_{uuid.uuid4().hex[:8]}",
        "vertical": vertical, "user_id": user["id"],
        "name": body.get("name") or user.get("name", ""), "categories": cats,
        "bio": body.get("bio", ""), "city": body.get("city", ""), "phone": body.get("phone", ""),
        "photo": body.get("photo", ""),
        "rating": (existing or {}).get("rating", 5.0), "reviews_count": (existing or {}).get("reviews_count", 0),
        "is_demo": False, "is_available": (existing or {}).get("is_available", False),
        "verification_status": (existing or {}).get("verification_status", "pending"),
        "documents": (existing or {}).get("documents", {}),
        "rejection_reason": (existing or {}).get("rejection_reason"),
        "created_at": (existing or {}).get("created_at") or _now(), "updated_at": _now(),
    }
    await db.pro_providers.update_one({"vertical": vertical, "user_id": user["id"]}, {"$set": doc}, upsert=True)
    return _provider_pub(doc)


@router.post("/{vertical}/provider/documents")
async def provider_documents(vertical: str, request: Request):
    user = await get_current_user(request)
    p = await db.pro_providers.find_one({"vertical": vertical, "user_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=400, detail="Inscrivez-vous comme prestataire d'abord")
    body = await request.json()
    documents = dict(p.get("documents") or {})
    for k in ("id_card", "diploma", "insurance"):
        if body.get(k):
            documents[k] = body[k]
    await db.pro_providers.update_one(
        {"vertical": vertical, "user_id": user["id"]},
        {"$set": {"documents": documents, "verification_status": "pending", "rejection_reason": None, "updated_at": _now()}})
    return {"ok": True, "documents": documents, "verification_status": "pending"}


@router.post("/{vertical}/provider/availability")
async def provider_availability(vertical: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    p = await db.pro_providers.find_one({"vertical": vertical, "user_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=400, detail="Inscrivez-vous comme prestataire d'abord")
    available = bool(body.get("available", True))
    if available and p.get("verification_status") != "approved":
        raise HTTPException(status_code=403, detail="Votre compte doit être validé avant d'accepter des réservations")
    await db.pro_providers.update_one({"vertical": vertical, "user_id": user["id"]},
                                      {"$set": {"is_available": available, "updated_at": _now()}})
    return {"ok": True, "is_available": available}


@router.get("/{vertical}/provider/feed")
async def provider_feed(vertical: str, request: Request):
    user = await get_current_user(request)
    p = await db.pro_providers.find_one({"vertical": vertical, "user_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=400, detail="Inscrivez-vous comme prestataire d'abord")
    docs = await db.pro_bookings.find(
        {"vertical": vertical, "status": "pending", "provider_id": None,
         "category": {"$in": p.get("categories", [])}}).sort("created_at", -1).to_list(50)
    return [_booking_pub(d) for d in docs]


@router.get("/{vertical}/provider/jobs")
async def provider_jobs(vertical: str, request: Request):
    user = await get_current_user(request)
    docs = await db.pro_bookings.find({"vertical": vertical, "provider_user_id": user["id"]}).sort("created_at", -1).to_list(100)
    return [_booking_pub(d) for d in docs]


@router.post("/{vertical}/bookings/{booking_id}/accept")
async def provider_accept(vertical: str, booking_id: str, request: Request):
    from pymongo import ReturnDocument
    user = await get_current_user(request)
    p = await db.pro_providers.find_one({"vertical": vertical, "user_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=400, detail="Inscrivez-vous comme prestataire d'abord")
    if p.get("verification_status") != "approved":
        raise HTTPException(status_code=403, detail="Votre compte doit être validé")
    b = await db.pro_bookings.find_one_and_update(
        {"id": booking_id, "vertical": vertical, "status": "pending", "provider_id": None},
        {"$set": {"provider_id": p["id"], "provider_name": p.get("name"), "provider_user_id": user["id"],
                  "status": "confirmed", "accepted_at": _now()}},
        return_document=ReturnDocument.AFTER)
    if not b:
        raise HTTPException(status_code=409, detail="Réservation déjà prise ou indisponible")
    try:
        await create_notification(b["user_id"], "pro_booking_accepted", "✅ Réservation confirmée",
                                  f"{p.get('name')} a accepté votre {b.get('service_name')}.",
                                  {"booking_id": booking_id, "url": "/beauty"})
    except Exception:
        pass
    return _booking_pub(b)


@router.post("/{vertical}/bookings/{booking_id}/provider-status")
async def provider_update_status(vertical: str, booking_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    new_status = body.get("status")
    if new_status not in ("in_progress", "completed"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    b = await db.pro_bookings.find_one(
        {"id": booking_id, "vertical": vertical, "provider_user_id": user["id"]}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    if b["status"] in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Réservation déjà clôturée")
    if new_status == "completed":
        await _settle_completion(vertical, b)
    else:
        await db.pro_bookings.update_one({"id": booking_id}, {"$set": {"status": "in_progress", "updated_at": _now()}})
        try:
            await create_notification(b["user_id"], "pro_booking_status", "💼 Prestation en cours",
                                      b.get("service_name", ""), {"booking_id": booking_id, "url": "/beauty"})
        except Exception:
            pass
    return {"ok": True, "status": new_status}


# ── Admin : validation (KYC) + commission + revenus ─────────────────────────
@admin_router.get("/{vertical}/providers")
async def admin_providers(vertical: str, request: Request):
    await require_role(request, ["admin"])
    _vcfg(vertical)
    await _ensure_seed(vertical)
    ops = await db.pro_providers.find({"vertical": vertical}).sort("created_at", -1).to_list(500)
    out = []
    for op in ops:
        op.pop("_id", None)
        op["completed_jobs"] = await db.pro_bookings.count_documents(
            {"vertical": vertical, "provider_user_id": op.get("user_id"), "status": "completed"})
        out.append(op)
    counts = {
        "pending": sum(1 for o in out if o.get("verification_status") == "pending"),
        "approved": sum(1 for o in out if o.get("verification_status") == "approved"),
        "rejected": sum(1 for o in out if o.get("verification_status") == "rejected"),
        "total": len(out),
    }
    return {"providers": out, "counts": counts}


@admin_router.post("/{vertical}/providers/{provider_id}/verify")
async def admin_verify(vertical: str, provider_id: str, request: Request):
    admin = await require_role(request, ["admin"])
    body = await request.json()
    action = body.get("action")
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="Action invalide")
    p = await db.pro_providers.find_one({"id": provider_id, "vertical": vertical}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Prestataire introuvable")
    status = "approved" if action == "approve" else "rejected"
    upd = {"verification_status": status, "verified_at": _now(), "verified_by": admin.get("id"), "updated_at": _now()}
    if action == "reject":
        upd["rejection_reason"] = body.get("reason", "")
        upd["is_available"] = False
    else:
        upd["rejection_reason"] = None
    await db.pro_providers.update_one({"id": provider_id, "vertical": vertical}, {"$set": upd})
    if p.get("user_id"):
        title = "✅ Compte prestataire validé" if action == "approve" else "❌ Compte prestataire refusé"
        msg = "Vous pouvez maintenant recevoir des réservations." if action == "approve" \
            else f"Motif : {body.get('reason', 'documents non conformes')}"
        try:
            await create_notification(p["user_id"], "pro_verification", title, msg, {"url": f"/pro/{vertical}"})
        except Exception:
            pass
    return {"ok": True, "verification_status": status}


@admin_router.get("/{vertical}/settings")
async def admin_get_settings(vertical: str, request: Request):
    await require_role(request, ["admin"])
    _vcfg(vertical)
    return {"commission_pct": await _commission_pct(vertical)}


@admin_router.put("/{vertical}/settings")
async def admin_set_settings(vertical: str, request: Request):
    await require_role(request, ["admin"])
    _vcfg(vertical)
    body = await request.json()
    try:
        pct = float(body.get("commission_pct"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Commission invalide")
    if not (0 <= pct <= 0.9):
        raise HTTPException(status_code=400, detail="La commission doit être entre 0 et 90%")
    await db.pro_settings.update_one({"id": vertical}, {"$set": {"id": vertical, "commission_pct": pct}}, upsert=True)
    return {"ok": True, "commission_pct": pct}


@admin_router.get("/{vertical}/revenue")
async def admin_revenue(vertical: str, request: Request):
    await require_role(request, ["admin"])
    rows = await db.pro_revenue.find({"vertical": vertical}, {"_id": 0}).to_list(5000)
    gmv = round(sum(float(r.get("total", 0) or 0) for r in rows), 2)
    commission = round(sum(float(r.get("commission", 0) or 0) for r in rows), 2)
    payout = round(sum(float(r.get("provider_earning", 0) or 0) for r in rows if r.get("collected")), 2)
    return {"count": len(rows), "gmv": gmv, "commission": commission,
            "provider_payout": payout, "commission_pct": await _commission_pct(vertical)}
