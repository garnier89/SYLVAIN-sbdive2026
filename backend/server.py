"""
SuperApp API — application entry point.

Thin wiring layer: builds the FastAPI app, mounts the /api router tree,
registers the WebSocket endpoint and CORS. Startup/seeding lives in
core.startup, router registration in core.api_router.
"""
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from core.config import CORS_ORIGINS
from core.startup import lifespan
from core.api_router import register_routers
from core.ws_endpoint import register_websocket

app = FastAPI(title="SuperApp API", lifespan=lifespan)

api_router = APIRouter(prefix="/api")
register_routers(api_router)
app.include_router(api_router)

# WebSocket — mounted under /api so it passes through the ingress
register_websocket(app)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS.split(",") if CORS_ORIGINS != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
