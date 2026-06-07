"""One-off: auto-translate the i18n base bundle into all requested languages.

Reuses the exact tested helpers from routes/i18n.py (_llm_translate, _flatten,
_unflatten, BASE_FLAT_FR). Stores each bundle in db.i18n_app_bundles and marks
the language active. Idempotent: only translates MISSING keys unless --overwrite.

Run: python -m scripts.translate_langs
"""
import asyncio
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv()

from core.config import db  # noqa: E402
from routes.i18n import (  # noqa: E402
    _llm_translate, _flatten, _unflatten, _get_bundle,
    BASE_FLAT_FR, BASE_TOTAL,
)

# Descriptive English names → better LLM translation quality for minority langs.
TRANSLATE_NAME = {
    "es": "Spanish", "pt": "Portuguese", "de": "German", "it": "Italian",
    "nl": "Dutch", "tr": "Turkish", "ro": "Romanian", "ru": "Russian",
    "ar": "Arabic", "zh": "Simplified Chinese", "ja": "Japanese",
    "hi": "Hindi", "ha": "Hausa", "el": "Greek", "sv": "Swedish",
    "sl": "Slovenian",
    "gcf": "Guadeloupean Creole (Antillean French-based creole)",
    "gcf-mq": "Martinican Creole (Antillean French-based creole)",
    "ht": "Haitian Creole (Kreyòl Ayisyen)",
    "rcf": "Réunion Creole (French-based creole of Réunion island)",
    "gcr": "French Guianese Creole (Kriyòl of French Guiana)",
    "ln": "Lingala", "wo": "Wolof",
    "bci": "Baoulé (Akan language spoken in Côte d'Ivoire)",
    "dyu": "Dioula / Jula (Manding language of West Africa)",
}

TARGETS = list(TRANSLATE_NAME.keys())
OVERWRITE = "--overwrite" in sys.argv
BATCH = 64


async def translate_one(code: str) -> int:
    name = TRANSLATE_NAME[code]
    existing_flat = _flatten(await _get_bundle(code))
    todo = dict(BASE_FLAT_FR) if OVERWRITE else {k: v for k, v in BASE_FLAT_FR.items() if not existing_flat.get(k)}
    if not todo:
        print(f"  [{code}] already complete ({len(existing_flat)}/{BASE_TOTAL}) — skip")
        return sum(1 for k in BASE_FLAT_FR if existing_flat.get(k))
    translated = dict(existing_flat)
    keys = list(todo.keys())
    for i in range(0, len(keys), BATCH):
        chunk = {k: todo[k] for k in keys[i:i + BATCH]}
        result = await _llm_translate(chunk, name, code)
        translated.update(result)
    bundle = _unflatten(translated)
    coverage = sum(1 for k in BASE_FLAT_FR if translated.get(k))
    await db.i18n_app_bundles.update_one(
        {"lang": code},
        {"$set": {"lang": code, "bundle": bundle, "coverage": coverage,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    await db.i18n_languages.update_one({"code": code}, {"$set": {"is_active": True}})
    return coverage


async def main():
    print(f"Translating {len(TARGETS)} languages (overwrite={OVERWRITE}, total={BASE_TOTAL} keys)")
    for code in TARGETS:
        try:
            cov = await translate_one(code)
            print(f"  [{code}] OK — coverage {cov}/{BASE_TOTAL}", flush=True)
        except Exception as e:
            print(f"  [{code}] FAILED: {e}", flush=True)
    print("DONE")


if __name__ == "__main__":
    asyncio.run(main())
