"""Seed an initial set of GLOBAL trending services so 'Tendances près de vous'
shows useful data before real traffic accumulates. Real /track pings then take over.
Idempotent: re-running resets the seeded counts (does not duplicate)."""
import os
import asyncio
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

# (section, key) -> seed count (descending = more "trending")
SEED = [
    ("delivery", None, 60),   # first delivery item
    ("beauty", None, 52),
    ("ondemand", None, 44),
    ("nearby", "hotels", 38),
    ("carcare", None, 31),
    ("nearby", "musees", 26),
    ("beauty", "spa-massage", 21),
    ("carcare", "shop-pieces", 17),
]


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    seeded = []
    for section, key, count in SEED:
        q = {"section": section, "visible_home": True}
        if key:
            q["key"] = key
        doc = await db.home_categories.find_one(q, sort=[("display_order", 1)])
        if not doc:
            continue
        sid = doc["id"]
        await db.service_trends.update_one(
            {"sid": sid, "zone": "global"},
            {"$set": {
                "sid": sid, "zone": "global", "count": count,
                "name": doc.get("label_fr"), "path": doc.get("target_route"),
                "icon_name": doc.get("icon_name"), "image_url": doc.get("image_url"),
                "bg_class": doc.get("bg_class"), "icon_color_class": doc.get("icon_color_class"),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
        seeded.append((doc.get("label_fr"), count))
    print("seeded global trends:", seeded)


if __name__ == "__main__":
    asyncio.run(main())
