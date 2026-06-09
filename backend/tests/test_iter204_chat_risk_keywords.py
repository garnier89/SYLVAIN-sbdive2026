"""Iter 204 — risky-keyword detection in driver↔client ride chat."""
from routes.dispatch_admin import scan_risky_text


def test_clean_message_has_no_reasons():
    assert scan_risky_text("Bonjour, je suis devant l'immeuble bleu") == []
    assert scan_risky_text("") == []
    assert scan_risky_text(None) == []


def test_cash_terms_detected():
    assert "espèces" in scan_risky_text("Vous payez en espèces ?")
    assert "espèces" in scan_risky_text("c'est du cash uniquement")
    assert "espèces" in scan_risky_text("payez en liquide svp")


def test_cancellation_intent_detected():
    assert "annulation" in scan_risky_text("je vais annuler la course")
    assert "annulation" in scan_risky_text("annule de ton côté")


def test_offapp_terms_detected():
    assert "hors-app" in scan_risky_text("on fait ça hors app")
    assert "hors-app" in scan_risky_text("contacte moi sur WhatsApp")
    assert "hors-app" in scan_risky_text("tu peux faire un virement directement")
    assert "hors-app" in scan_risky_text("appelle-moi plutôt")


def test_phone_number_detected():
    assert "numéro de téléphone" in scan_risky_text("mon num 06 12 34 56 78")
    assert "numéro de téléphone" in scan_risky_text("+33 6 12 34 56 78")
    assert "numéro de téléphone" in scan_risky_text("0612345678")
    # short numbers (price/amount) should NOT trigger
    assert "numéro de téléphone" not in scan_risky_text("ça fait 25 euros")


def test_multiple_reasons_combined():
    r = scan_risky_text("Payez en especes, appelez-moi au 0612345678, on fait hors app")
    assert set(r) >= {"espèces", "hors-app", "numéro de téléphone"}
