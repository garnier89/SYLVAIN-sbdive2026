"""Shared billing helpers — atomic sequential document/reference numbers."""
from datetime import datetime, timezone

from core.config import db


async def next_number(prefix: str, with_year: bool = True) -> str:
    """Atomic, gap-free sequence per prefix (and year). E.g. SB-W-2026-000042."""
    year = datetime.now(timezone.utc).year
    key = f"{prefix}_{year}" if with_year else prefix
    doc = await db.counters.find_one_and_update(
        {"id": key}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
    )
    seq = (doc or {}).get("seq", 1)
    mid = f"{year}-" if with_year else ""
    return f"{prefix}-{mid}{seq:06d}"
