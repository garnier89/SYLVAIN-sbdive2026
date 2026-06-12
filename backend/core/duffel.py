"""Client Duffel (API de vols en temps réel).

Encapsule les appels HTTP vers l'API Duffel (mode test via `duffel_test_...`).
Toute la logique Duffel reste côté backend ; le frontend ne parle qu'à nos
endpoints `/api/flights/live/...`.
"""
import os
import logging

import httpx

logger = logging.getLogger(__name__)

DUFFEL_API_KEY = os.environ.get("DUFFEL_API_KEY", "")
DUFFEL_BASE_URL = "https://api.duffel.com"
DUFFEL_VERSION = "v2"


def duffel_enabled() -> bool:
    return bool(DUFFEL_API_KEY)


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {DUFFEL_API_KEY}",
        "Duffel-Version": DUFFEL_VERSION,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


class DuffelError(Exception):
    """Erreur renvoyée par l'API Duffel (message lisible pour l'utilisateur)."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _extract_error(resp: httpx.Response) -> str:
    try:
        data = resp.json()
        errs = data.get("errors") or []
        if errs:
            first = errs[0]
            return first.get("message") or first.get("title") or "Erreur Duffel"
    except Exception:
        pass
    return f"Erreur Duffel ({resp.status_code})"


async def _request(method: str, path: str, *, json_body=None, params=None) -> dict:
    if not duffel_enabled():
        raise DuffelError("API vols (Duffel) non configurée", status_code=503)
    url = f"{DUFFEL_BASE_URL}{path}"
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.request(method, url, headers=_headers(), json=json_body, params=params)
        except httpx.RequestError as e:
            logger.error("Duffel network error: %s", e)
            raise DuffelError("Service de vols indisponible, réessayez", status_code=502)
    if resp.status_code >= 400:
        msg = _extract_error(resp)
        logger.warning("Duffel %s %s -> %s: %s", method, path, resp.status_code, msg)
        raise DuffelError(msg, status_code=resp.status_code)
    return resp.json()


async def create_offer_request(slices: list, passengers: list, cabin_class: str = "economy", max_connections: int = 1) -> dict:
    """Crée une demande d'offres ; renvoie l'offer_request avec ses offres incluses."""
    payload = {
        "slices": slices,
        "passengers": passengers,
        "cabin_class": cabin_class,
        "max_connections": max_connections,
    }
    data = await _request(
        "POST", "/air/offer_requests",
        json_body={"data": payload},
        params={"return_offers": "true", "supplier_timeout": "20000"},
    )
    return data.get("data", {})


async def get_offer(offer_id: str) -> dict:
    data = await _request("GET", f"/air/offers/{offer_id}", params={"return_available_services": "false"})
    return data.get("data", {})


async def create_order(offer_id: str, passengers: list, amount: str, currency: str) -> dict:
    payload = {
        "type": "instant",
        "selected_offers": [offer_id],
        "passengers": passengers,
        "payments": [{"type": "balance", "amount": amount, "currency": currency}],
    }
    data = await _request("POST", "/air/orders", json_body={"data": payload})
    return data.get("data", {})


async def create_hold_order(offer_id: str, passengers: list) -> dict:
    """Crée une commande « hold » (tarif bloqué, sans paiement immédiat)."""
    payload = {
        "type": "hold",
        "selected_offers": [offer_id],
        "passengers": passengers,
    }
    data = await _request("POST", "/air/orders", json_body={"data": payload})
    return data.get("data", {})


async def create_payment(order_id: str, amount: str, currency: str) -> dict:
    """Paie une commande « hold » avec le solde Duffel (mode test)."""
    payload = {
        "order_id": order_id,
        "payment": {"type": "balance", "amount": amount, "currency": currency},
    }
    data = await _request("POST", "/air/payments", json_body={"data": payload})
    return data.get("data", {})


async def get_order(order_id: str) -> dict:
    data = await _request("GET", f"/air/orders/{order_id}")
    return data.get("data", {})
