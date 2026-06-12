"""Iter333 — Email de confirmation de vol (Resend) avec e-billet PDF en pièce jointe.

Vérifie que send_flight_confirmation construit bien un payload Resend incluant
la pièce jointe PDF (encodée base64), sans dépendre d'un envoi réseau réel.
"""
import base64
import asyncio
from unittest.mock import patch

import core.email as email


def test_flight_confirmation_includes_pdf_attachment():
    booking = {
        "pnr": "ABC123", "airline": "Duffel Airways", "flight_number": "ZZ0403",
        "origin_code": "FDF", "destination_code": "ORY",
        "departure_at": "2026-09-20T10:50:00", "arrival_at": "2026-09-20T23:05:00",
        "total_price": 480.0, "currency": "EUR",
        "passengers": [{"name": "Jean Dupont"}],
        "slices": [{"origin_code": "FDF", "destination_code": "ORY",
                    "departing_at": "2026-09-20T10:50:00", "arriving_at": "2026-09-20T23:05:00"}],
    }
    pdf = b"%PDF-1.4 fake eticket bytes"
    captured = {}

    def fake_send(payload):
        captured.update(payload)
        return {"id": "email_test"}

    with patch.object(email, "RESEND_API_KEY", "re_test"), \
         patch.object(email.resend.Emails, "send", side_effect=fake_send):
        asyncio.run(email.send_flight_confirmation("somosylv@gmail.com", "Client", booking, pdf))

    assert captured.get("to") == ["somosylv@gmail.com"]
    assert "ABC123" in captured.get("subject", "")
    assert captured.get("attachments"), "attachment must be present"
    att = captured["attachments"][0]
    assert att["filename"] == "eticket-ABC123.pdf"
    assert base64.b64decode(att["content"]) == pdf
    # PNR + itinéraire présents dans le corps HTML
    assert "PNR ABC123" in captured.get("html", "")
    assert "FDF" in captured["html"] and "ORY" in captured["html"]


def test_flight_confirmation_without_pdf_has_no_attachment():
    booking = {"pnr": "NOPDF1", "airline": "X", "total_price": 100, "currency": "EUR", "passengers": []}
    captured = {}

    with patch.object(email, "RESEND_API_KEY", "re_test"), \
         patch.object(email.resend.Emails, "send", side_effect=lambda p: captured.update(p)):
        asyncio.run(email.send_flight_confirmation("somosylv@gmail.com", "Client", booking, None))

    assert "attachments" not in captured
