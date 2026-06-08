"""One-off: generate clean vehicle illustrations (Gemini Nano Banana) and store
them as transparent 128px PNG data-URIs on each vehicle_types doc.
Run: python scripts/gen_vehicle_images.py
"""
import asyncio
import os
import base64
import io
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv()
API_KEY = os.getenv("EMERGENT_LLM_KEY")
MODEL = "gemini-3.1-flash-image-preview"

STYLE = (
    "flat modern 3D render, side three-quarter front view, centered, fully isolated "
    "on a pure solid white #FFFFFF background, soft studio lighting, no shadow, no text, "
    "no logo, clean mobile app vehicle icon, vibrant colors"
)

# slug -> subject prompt (avoid white vehicle bodies so the white->alpha keying is clean)
VEHICLES = {
    "confort":    "a comfortable mid-size silver-grey sedan car",
    "luxe":       "a glossy black luxury premium sedan car",
    "moto":       "an orange and black motorbike scooter",
    "suv":        "a dark blue modern SUV 4x4",
    "van":        "a blue passenger minivan",
    "electric":   "a green eco electric car with a small charging plug symbol",
    "tuktuk":     "a yellow and green three-wheeler auto rickshaw tuk-tuk",
    "vtc":        "a sleek black chauffeur VTC sedan car",
    "taxi":       "a classic yellow taxi cab car",
    "airport":    "a navy blue airport shuttle sedan car",
    "pets":       "a teal hatchback car with a happy dog looking out the window",
    "accessible": "a blue wheelchair-accessible van with a white accessibility wheelchair symbol on the side",
    "assist":     "a red roadside assistance support car with a small toolbox",
}


def to_transparent_128(raw_bytes: bytes) -> str:
    im = Image.open(io.BytesIO(raw_bytes)).convert("RGBA")
    # crop to square center, then resize
    px = im.load()
    w, h = im.size
    # white -> transparent (only near-pure white)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r > 244 and g > 244 and b > 244:
                px[x, y] = (r, g, b, 0)
    # trim to bbox of visible content
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    im.thumbnail((128, 128), Image.LANCZOS)
    canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    canvas.paste(im, ((128 - im.width) // 2, (128 - im.height) // 2), im)
    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


async def gen_one(slug: str, subject: str) -> str | None:
    chat = LlmChat(api_key=API_KEY, session_id=f"veh-{slug}", system_message="You are an image generator.")
    chat.with_model("gemini", MODEL).with_params(modalities=["image", "text"])
    msg = UserMessage(text=f"Generate {subject}. {STYLE}.")
    try:
        _text, images = await chat.send_message_multimodal_response(msg)
        if images:
            raw = base64.b64decode(images[0]["data"])
            return to_transparent_128(raw)
    except Exception as e:
        print(f"  [{slug}] ERROR: {e}")
    return None


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    done, failed = [], []
    for slug, subject in VEHICLES.items():
        print(f"Generating {slug}...")
        data_uri = await gen_one(slug, subject)
        if data_uri:
            await db.vehicle_types.update_one(
                {"slug": slug},
                {"$set": {"image_selected": data_uri, "image_unselected": data_uri}},
            )
            done.append(slug)
            print(f"  [{slug}] OK ({data_uri[:24]}... {len(data_uri)} chars)")
        else:
            failed.append(slug)
    print(f"\nDONE: {done}")
    print(f"FAILED: {failed}")


if __name__ == "__main__":
    asyncio.run(main())
