"""Tests du helper SMS Twilio (core/sms) — comportement feature-flag + normalisation E.164."""
import asyncio

import core.sms as sms


def test_to_e164_variants():
    assert sms.to_e164("+15551234567") == "+15551234567"
    assert sms.to_e164("0612345678") == "+33612345678"            # FR national -> +33
    assert sms.to_e164("0033612345678") == "+33612345678"          # 00 -> +
    assert sms.to_e164("+33 6 12 34 56 78") == "+33612345678"      # espaces nettoyés
    assert sms.to_e164("") == ""
    assert sms.to_e164("abc") == ""


def test_sms_disabled_by_default(monkeypatch):
    # Sans clés, le service est désactivé.
    monkeypatch.setattr(sms, "ACCOUNT_SID", "")
    monkeypatch.setattr(sms, "AUTH_TOKEN", "")
    monkeypatch.setattr(sms, "FROM_NUMBER", "")
    assert sms.sms_enabled() is False
    # send_sms ne lève pas et renvoie False quand désactivé.
    assert asyncio.get_event_loop().run_until_complete(sms.send_sms("+33612345678", "x")) is False
    assert asyncio.get_event_loop().run_until_complete(sms.send_sms_to_many(["+33612345678"], "x")) == 0


def test_sms_enabled_flag(monkeypatch):
    monkeypatch.setattr(sms, "ACCOUNT_SID", "AC_test")
    monkeypatch.setattr(sms, "AUTH_TOKEN", "tok")
    monkeypatch.setattr(sms, "FROM_NUMBER", "+15550000000")
    assert sms.sms_enabled() is True
