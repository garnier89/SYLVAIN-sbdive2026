"""Complete home sections to mirror the XJEKPLUS reference service lists.
Idempotent: inserts a home_categories item only if its (section, key) is absent.
Run: python scripts/add_xjekplus_items.py
"""
import os
import asyncio
import uuid
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

# section -> route + list of (key, label_fr, icon_name, bg_class, icon_color_class)
ADDITIONS = {
    "ondemand": ("/services", [
        ("menage", "Ménage", "Broom", "bg-teal-50", "text-teal-600"),
        ("jardinage", "Jardinage", "Tree", "bg-green-50", "text-green-600"),
        ("tutorat", "Tutorat", "GraduationCap", "bg-blue-50", "text-blue-500"),
        ("avocats", "Avocats", "Scales", "bg-slate-50", "text-slate-600"),
        ("astrologue", "Astrologue", "Moon", "bg-indigo-50", "text-indigo-600"),
    ]),
    "carcare": ("/car-care", [
        ("shop-pieces", "Boutique\nPièces", "Storefront", "bg-amber-50", "text-amber-600"),
        ("moto-wash", "Lavage\nMoto", "Motorcycle", "bg-orange-50", "text-orange-500"),
    ]),
    "nearby": ("/nearby", [
        ("musees", "Musées", "Bank", "bg-purple-50", "text-purple-500"),
        ("attractions", "Attractions", "Confetti", "bg-pink-50", "text-pink-500"),
        ("bibliotheques", "Bibliothèques", "BookOpen", "bg-blue-50", "text-blue-500"),
        ("vie-nocturne", "Vie\nNocturne", "MusicNotes", "bg-fuchsia-50", "text-fuchsia-500"),
        ("hotels", "Hôtels", "Bed", "bg-rose-50", "text-rose-500"),
        ("parking", "Parking", "MapPin", "bg-sky-50", "text-sky-500"),
        ("garage", "Garage", "Wrench", "bg-slate-50", "text-slate-600"),
    ]),
    "beauty": ("/beauty", [
        ("spa-massage", "Spa &\nMassage", "Sparkle", "bg-fuchsia-50", "text-fuchsia-500"),
    ]),
}


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    added, skipped = [], []
    for section, (route, items) in ADDITIONS.items():
        existing = await db.home_categories.find({"section": section}, {"_id": 0, "key": 1, "display_order": 1}).to_list(200)
        keys = {e["key"] for e in existing}
        order = max([e.get("display_order", 0) for e in existing], default=-1) + 1
        for key, label, icon, bg, col in items:
            if key in keys:
                skipped.append(f"{section}/{key}")
                continue
            doc = {
                "id": f"hcat_{uuid.uuid4().hex[:10]}",
                "section": section,
                "key": key,
                "label_fr": label,
                "label_en": label,
                "subtitle_fr": "",
                "icon_name": icon,
                "image_url": None,
                "bg_class": bg,
                "icon_color_class": col,
                "target_route": route,
                "display_order": order,
                "visible_home": True,
                "status": "active",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.home_categories.insert_one(doc)
            added.append(f"{section}/{key}")
            order += 1
    print("ADDED:", added)
    print("SKIPPED (already present):", skipped)


if __name__ == "__main__":
    asyncio.run(main())
