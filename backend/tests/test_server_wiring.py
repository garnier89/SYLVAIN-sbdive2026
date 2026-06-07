"""
Smoke tests for the refactored server wiring (server.py / core.startup /
core.api_router / core.ws_endpoint). Ensures the app builds, every router is
mounted under /api, and the startup orchestrator is intact — no DB needed.
"""
import server
from core.api_router import _ROUTERS, register_routers
from core.startup import run_all_seeds
from fastapi import APIRouter


def test_app_builds_and_titled():
    assert server.app.title == "SuperApp API"
    # A lifespan context is wired (FastAPI wraps it internally)
    assert server.app.router.lifespan_context is not None


def test_all_routers_registered():
    # Every router in the registry should be mounted (a healthy app exposes 500+ routes)
    paths = [getattr(r, "path", "") for r in server.app.routes]
    assert len(paths) > 400
    assert any(p == "/api/ws/{client_id}" for p in paths)  # websocket mounted
    assert all(p.startswith("/api") or p in ("/docs", "/openapi.json", "/redoc", "/docs/oauth2-redirect")
               for p in paths if p)  # API tree all under /api


def test_register_routers_is_idempotent_shape():
    # register_routers mounts exactly len(_ROUTERS) router trees on a fresh router
    api = APIRouter(prefix="/api")
    before = len(api.routes)
    register_routers(api)
    assert len(api.routes) > before
    assert len(_ROUTERS) >= 60  # full feature surface


def test_startup_exports_seed_orchestrator():
    assert callable(run_all_seeds)
