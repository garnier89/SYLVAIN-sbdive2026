"""Transactional email via Resend (SB Store onboarding).

Non-blocking, fire-and-forget helpers that NEVER raise into the request path:
if the API key is missing or Resend errors, we log and move on. In Resend
"testing" mode (no verified domain) emails are only delivered to the account
owner's verified address — production delivery requires verifying a domain.
"""
import os
import asyncio
import logging
from datetime import datetime, timezone

import resend

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
FROM = f"SB Store <{SENDER_EMAIL}>"

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


async def _send(to: str, subject: str, html: str) -> None:
    if not RESEND_API_KEY or not to:
        return
    try:
        await asyncio.to_thread(
            resend.Emails.send,
            {"from": FROM, "to": [to], "subject": subject, "html": html},
        )
        logger.info("Resend email sent to %s (%s)", to, subject)
    except Exception as e:
        logger.warning("Resend email failed for %s: %s", to, e)


def _shell(title: str, accent: str, body_html: str) -> str:
    """Minimal table-based, inline-CSS responsive email shell (SB Store brand)."""
    return f"""\
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0e1a;padding:32px 0;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;max-width:520px;width:100%;">
      <tr><td style="background:{accent};padding:28px 32px;">
        <span style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:0.5px;">SB Store</span>
      </td></tr>
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 16px;color:#0a0e1a;font-size:22px;">{title}</h1>
        {body_html}
      </td></tr>
      <tr><td style="padding:20px 32px;background:#f5f6f8;color:#8a909c;font-size:12px;text-align:center;">
        SB Drive VTC · Cet email vous est envoyé suite à votre activité sur SB Store.
      </td></tr>
    </table>
  </td></tr>
</table>"""


def fire(coro) -> None:
    """Schedule an email coroutine without blocking the caller."""
    try:
        asyncio.create_task(coro)
    except RuntimeError:
        # No running loop (e.g. called from sync context) — run it best-effort.
        asyncio.run(coro)


async def send_merchant_signup_received(to: str, owner_name: str, store_name: str) -> None:
    body = f"""\
        <p style="color:#444;font-size:15px;line-height:1.6;">Bonjour {owner_name or ''},</p>
        <p style="color:#444;font-size:15px;line-height:1.6;">
          Nous avons bien reçu votre demande d'ouverture de boutique
          <b>« {store_name} »</b> sur SB Store. 🎉
        </p>
        <p style="color:#444;font-size:15px;line-height:1.6;">
          Notre équipe examine votre boutique. Vous recevrez un email dès qu'elle
          sera <b>validée et mise en ligne</b>. En attendant, vous pouvez déjà
          préparer votre catalogue depuis votre espace marchand.
        </p>
        <p style="margin-top:24px;color:#444;font-size:15px;">À très vite,<br/>L'équipe SB Store</p>"""
    await _send(to, "Votre demande SB Store a bien été reçue", _shell("Demande reçue ✅", "#FF4500", body))


async def send_merchant_approved(to: str, owner_name: str, store_name: str, dashboard_url: str) -> None:
    body = f"""\
        <p style="color:#444;font-size:15px;line-height:1.6;">Bonjour {owner_name or ''},</p>
        <p style="color:#444;font-size:15px;line-height:1.6;">
          Excellente nouvelle ! Votre boutique <b>« {store_name} »</b> est désormais
          <b style="color:#16a34a;">validée et visible des clients</b> sur SB Store. 🚀
        </p>
        <p style="color:#444;font-size:15px;line-height:1.6;">
          Vous pouvez maintenant recevoir des commandes en temps réel, gérer votre
          stock et suivre vos performances.
        </p>
        <p style="text-align:center;margin:28px 0;">
          <a href="{dashboard_url}" style="background:#16a34a;color:#ffffff;text-decoration:none;
             padding:13px 26px;border-radius:999px;font-weight:bold;font-size:15px;display:inline-block;">
            Accéder à mon espace
          </a>
        </p>
        <p style="color:#444;font-size:15px;">Bonnes ventes !<br/>L'équipe SB Store</p>"""
    await _send(to, "🎉 Votre boutique SB Store est validée", _shell("Boutique validée 🎉", "#16a34a", body))


def _money(v) -> str:
    try:
        return f"{float(v):.2f} €"
    except (TypeError, ValueError):
        return "—"


async def send_order_confirmation(to: str, customer_name: str, order: dict, store_name: str, tracking_url: str) -> None:
    """Branded order receipt to the client: items recap + totals + tracking link."""
    rows = ""
    for it in (order.get("items") or []):
        name = it.get("name") or it.get("product_name") or "Article"
        qty = int(it.get("quantity") or 1)
        line = float(it.get("total") or (it.get("price", 0) * qty))
        rows += (f'<tr><td style="padding:8px 0;color:#444;font-size:14px;">{qty}× {name}</td>'
                 f'<td style="padding:8px 0;color:#444;font-size:14px;text-align:right;white-space:nowrap;">{_money(line)}</td></tr>')

    subtotal = order.get("subtotal", 0)
    discount = order.get("discount", 0) or 0
    delivery = order.get("delivery_fee", 0)
    total = order.get("total", 0)
    discount_row = (f'<tr><td style="padding:4px 0;color:#16a34a;font-size:14px;">Réduction</td>'
                    f'<td style="padding:4px 0;color:#16a34a;font-size:14px;text-align:right;">-{_money(discount)}</td></tr>') if discount > 0 else ""
    addr = order.get("delivery_address") or ""
    order_no = f"#{str(order.get('id',''))[-6:]}"

    body = f"""\
        <p style="color:#444;font-size:15px;line-height:1.6;">Bonjour {customer_name or ''},</p>
        <p style="color:#444;font-size:15px;line-height:1.6;">
          Merci pour votre commande chez <b>{store_name}</b> ! Voici votre reçu (commande <b>{order_no}</b>).
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;margin:18px 0;">
          {rows}
        </table>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:4px 0;color:#777;font-size:14px;">Sous-total</td><td style="padding:4px 0;color:#777;font-size:14px;text-align:right;">{_money(subtotal)}</td></tr>
          {discount_row}
          <tr><td style="padding:4px 0;color:#777;font-size:14px;">Livraison</td><td style="padding:4px 0;color:#777;font-size:14px;text-align:right;">{_money(delivery)}</td></tr>
          <tr><td style="padding:10px 0;color:#0a0e1a;font-size:17px;font-weight:bold;border-top:1px solid #eee;">Total</td>
              <td style="padding:10px 0;color:#FF4500;font-size:17px;font-weight:bold;text-align:right;border-top:1px solid #eee;">{_money(total)}</td></tr>
        </table>
        <p style="color:#777;font-size:13px;margin-top:8px;">📍 Livraison à : {addr}</p>
        <p style="text-align:center;margin:26px 0;">
          <a href="{tracking_url}" style="background:#FF4500;color:#ffffff;text-decoration:none;
             padding:13px 26px;border-radius:999px;font-weight:bold;font-size:15px;display:inline-block;">
            Suivre ma commande
          </a>
        </p>
        <p style="color:#444;font-size:14px;">Bon appétit ! 🍽️<br/>L'équipe SB Store</p>"""
    await _send(to, f"Confirmation de commande {order_no} · {store_name}", _shell("Commande confirmée 🧾", "#FF4500", body))


async def send_order_delivered(to: str, customer_name: str, order: dict, store_name: str, review_url: str) -> None:
    """Invoice + review invitation, sent when an order is delivered.
    SB Drive VTC being an intermediation platform, the invoice is issued on
    behalf of the provider (the merchant)."""
    order_no = f"#{str(order.get('id',''))[-6:]}"
    invoice_no = order.get("invoice_number") or order_no
    date_str = datetime.now(timezone.utc).strftime("%d/%m/%Y")
    rows = ""
    for it in (order.get("items") or []):
        name = it.get("name") or it.get("product_name") or "Article"
        qty = int(it.get("quantity") or 1)
        line = float(it.get("total") or (it.get("price", 0) * qty))
        rows += (f'<tr><td style="padding:7px 0;color:#444;font-size:14px;">{qty}× {name}</td>'
                 f'<td style="padding:7px 0;color:#444;font-size:14px;text-align:right;white-space:nowrap;">{_money(line)}</td></tr>')
    subtotal = order.get("subtotal", 0)
    discount = order.get("discount", 0) or 0
    delivery = order.get("delivery_fee", 0)
    total = order.get("total", 0)
    discount_row = (f'<tr><td style="padding:4px 0;color:#16a34a;font-size:14px;">Réduction</td>'
                    f'<td style="padding:4px 0;color:#16a34a;font-size:14px;text-align:right;">-{_money(discount)}</td></tr>') if discount > 0 else ""
    stars = "".join(
        f'<a href="{review_url}&rating={n}" style="text-decoration:none;font-size:28px;color:#FFB400;margin:0 2px;">★</a>'
        for n in range(1, 6)
    )
    body = f"""\
        <p style="color:#444;font-size:15px;line-height:1.6;">Bonjour {customer_name or ''},</p>
        <p style="color:#444;font-size:15px;line-height:1.6;">
          Votre commande <b>{order_no}</b> de chez <b>{store_name}</b> a bien été <b style="color:#16a34a;">livrée</b>. 🎉
          Voici votre facture.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;border-radius:10px;padding:14px 16px;margin:16px 0;">
          <tr><td style="color:#777;font-size:13px;">Facture n°</td><td style="text-align:right;color:#0a0e1a;font-size:13px;font-weight:bold;">{invoice_no}</td></tr>
          <tr><td style="color:#777;font-size:13px;">Date</td><td style="text-align:right;color:#444;font-size:13px;">{date_str}</td></tr>
          <tr><td style="color:#777;font-size:13px;">Prestataire</td><td style="text-align:right;color:#444;font-size:13px;">{store_name}</td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;margin:6px 0 14px;">
          {rows}
        </table>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:3px 0;color:#777;font-size:14px;">Sous-total</td><td style="padding:3px 0;color:#777;font-size:14px;text-align:right;">{_money(subtotal)}</td></tr>
          {discount_row}
          <tr><td style="padding:3px 0;color:#777;font-size:14px;">Livraison</td><td style="padding:3px 0;color:#777;font-size:14px;text-align:right;">{_money(delivery)}</td></tr>
          <tr><td style="padding:9px 0;color:#0a0e1a;font-size:17px;font-weight:bold;border-top:1px solid #eee;">Total payé</td>
              <td style="padding:9px 0;color:#FF4500;font-size:17px;font-weight:bold;text-align:right;border-top:1px solid #eee;">{_money(total)}</td></tr>
        </table>
        <p style="color:#9aa0ac;font-size:11px;line-height:1.5;margin:14px 0 0;">
          SB Drive VTC est une plateforme de mise en relation. La prestation a été réalisée par le prestataire
          « {store_name} » ; cette facture est émise pour son compte.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:22px 0;" />
        <p style="color:#444;font-size:15px;line-height:1.6;text-align:center;">Comment évaluez-vous <b>{store_name}</b> ?</p>
        <p style="text-align:center;margin:8px 0 18px;">{stars}</p>
        <p style="text-align:center;margin:0 0 22px;">
          <a href="{review_url}" style="background:#FF4500;color:#ffffff;text-decoration:none;
             padding:12px 24px;border-radius:999px;font-weight:bold;font-size:15px;display:inline-block;">
            Laisser un avis
          </a>
        </p>
        <p style="color:#444;font-size:14px;text-align:center;">Merci de votre confiance 🧡<br/>L'équipe SB Store</p>"""
    await _send(to, f"Facture {invoice_no} · commande {order_no} livrée — votre avis ⭐",
                _shell("Commande livrée ✅", "#16a34a", body))


_WALLET_META = {
    "recharge":     {"title": "Reçu de rechargement 💳", "accent": "#16a34a", "verb": "Rechargement", "sign": "+", "subject": "Reçu de rechargement SB Pay"},
    "withdraw":     {"title": "Reçu de retrait 🏦",       "accent": "#FF4500", "verb": "Retrait",      "sign": "-", "subject": "Reçu de retrait SB Pay"},
    "transfer_out": {"title": "Transfert envoyé ↗",      "accent": "#FF4500", "verb": "Transfert envoyé", "sign": "-", "subject": "Reçu de transfert SB Pay"},
    "transfer_in":  {"title": "Transfert reçu ↙",        "accent": "#16a34a", "verb": "Transfert reçu",   "sign": "+", "subject": "Vous avez reçu un transfert SB Pay"},
}


async def send_wallet_receipt(to: str, name: str, *, kind: str, amount: float, balance_after: float,
                              ref: str, wallet_url: str, fee: float = 0.0, counterparty: str = "",
                              method: str = "") -> None:
    """Branded financial receipt for an SB Pay wallet operation."""
    meta = _WALLET_META.get(kind)
    if not meta:
        return
    date_str = datetime.now(timezone.utc).strftime("%d/%m/%Y à %H:%M")
    lines = [("Opération", meta["verb"]), ("Référence", ref), ("Date", date_str)]
    if counterparty:
        lines.append(("Bénéficiaire" if kind == "transfer_out" else "Expéditeur", counterparty))
    if method:
        lines.append(("Méthode", method))
    detail = "".join(
        f'<tr><td style="padding:5px 0;color:#777;font-size:13px;">{k}</td>'
        f'<td style="padding:5px 0;color:#0a0e1a;font-size:13px;text-align:right;font-weight:600;">{v}</td></tr>'
        for k, v in lines
    )
    fee_row = (f'<tr><td style="padding:4px 0;color:#777;font-size:14px;">Frais</td>'
               f'<td style="padding:4px 0;color:#777;font-size:14px;text-align:right;">-{_money(fee)}</td></tr>') if fee and fee > 0 else ""
    body = f"""\
        <p style="color:#444;font-size:15px;line-height:1.6;">Bonjour {name or ''},</p>
        <p style="color:#444;font-size:15px;line-height:1.6;">Voici le reçu de votre opération SB Pay.</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;border-radius:10px;padding:14px 16px;margin:16px 0;">
          {detail}
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;">
          <tr><td style="padding:10px 0;color:#0a0e1a;font-size:17px;font-weight:bold;">Montant</td>
              <td style="padding:10px 0;color:{meta['accent']};font-size:17px;font-weight:bold;text-align:right;">{meta['sign']}{_money(amount)}</td></tr>
          {fee_row}
        </table>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:8px 0;color:#777;font-size:14px;">Nouveau solde</td>
              <td style="padding:8px 0;color:#0a0e1a;font-size:15px;font-weight:bold;text-align:right;">{_money(balance_after)}</td></tr>
        </table>
        <p style="text-align:center;margin:24px 0;">
          <a href="{wallet_url}" style="background:{meta['accent']};color:#ffffff;text-decoration:none;
             padding:12px 24px;border-radius:999px;font-weight:bold;font-size:15px;display:inline-block;">Voir mon portefeuille</a>
        </p>
        <p style="color:#9aa0ac;font-size:11px;line-height:1.5;">
          SB Drive VTC — plateforme de mise en relation. Reçu généré automatiquement pour votre opération SB Pay.
          Si vous n'êtes pas à l'origine de cette opération, contactez immédiatement le support.
        </p>"""
    await _send(to, meta["subject"], _shell(meta["title"], meta["accent"], body))


def _fmt_duration(seconds) -> str:
    try:
        s = int(seconds or 0)
    except (TypeError, ValueError):
        return "—"
    m = s // 60
    if m < 60:
        return f"{m} min"
    return f"{m // 60} h {m % 60:02d}"


async def send_ride_invoice(to: str, customer_name: str, *, invoice_no: str, pickup: str, dropoff: str,
                            distance_km, breakdown: dict, total: float, driver_name: str,
                            vehicle_label: str, ride_url: str) -> None:
    """Facture de course taxi terminée : trajet, distance, durée, prix, chauffeur."""
    b = breakdown or {}
    date_str = datetime.now(timezone.utc).strftime("%d/%m/%Y à %H:%M")
    dur = _fmt_duration(b.get("time_seconds"))

    def row(label, value, color="#444"):
        return (f'<tr><td style="padding:4px 0;color:#777;font-size:14px;">{label}</td>'
                f'<td style="padding:4px 0;color:{color};font-size:14px;text-align:right;">{value}</td></tr>')

    breakdown_rows = ""
    if b.get("rental"):
        breakdown_rows += row("Forfait", _money(b.get("package_price", 0)))
        if b.get("overage_fee"):
            breakdown_rows += row("Dépassement", _money(b.get("overage_fee", 0)))
    else:
        breakdown_rows += row("Prise en charge", _money(b.get("base_fare", 0)))
        breakdown_rows += row(f"Distance ({b.get('distance_km', distance_km)} km)", _money(b.get("distance_charge", 0)))
        if b.get("time_charge"):
            breakdown_rows += row(f"Temps ({dur})", _money(b.get("time_charge", 0)))
        if b.get("extra_total"):
            breakdown_rows += row("Frais supplémentaires", _money(b.get("extra_total", 0)))
        if b.get("loyalty_discount"):
            breakdown_rows += row("Réduction fidélité", f"-{_money(b.get('loyalty_discount', 0))}", "#16a34a")

    body = f"""\
        <p style="color:#444;font-size:15px;line-height:1.6;">Bonjour {customer_name or ''},</p>
        <p style="color:#444;font-size:15px;line-height:1.6;">
          Merci d'avoir voyagé avec SB Drive ! Voici la facture de votre course.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;border-radius:10px;padding:14px 16px;margin:16px 0;">
          <tr><td style="color:#777;font-size:13px;">Facture n°</td><td style="text-align:right;color:#0a0e1a;font-size:13px;font-weight:bold;">{invoice_no}</td></tr>
          <tr><td style="color:#777;font-size:13px;">Date</td><td style="text-align:right;color:#444;font-size:13px;">{date_str}</td></tr>
          <tr><td style="color:#777;font-size:13px;">Chauffeur</td><td style="text-align:right;color:#444;font-size:13px;">{driver_name or '—'}</td></tr>
          <tr><td style="color:#777;font-size:13px;">Véhicule</td><td style="text-align:right;color:#444;font-size:13px;">{vehicle_label or '—'}</td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 14px;">
          <tr><td style="padding:2px 0;color:#16a34a;font-size:13px;">● Départ</td></tr>
          <tr><td style="padding:0 0 8px 12px;color:#444;font-size:14px;">{pickup or '—'}</td></tr>
          <tr><td style="padding:2px 0;color:#FF4500;font-size:13px;">● Arrivée</td></tr>
          <tr><td style="padding:0 0 4px 12px;color:#444;font-size:14px;">{dropoff or '—'}</td></tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0;">
          <tr>
            <td style="text-align:center;padding:8px;background:#f7f8fa;border-radius:8px;"><span style="display:block;color:#0a0e1a;font-weight:bold;font-size:15px;">{b.get('distance_km', distance_km) or '—'} km</span><span style="color:#9aa0ac;font-size:11px;">Distance</span></td>
            <td width="10"></td>
            <td style="text-align:center;padding:8px;background:#f7f8fa;border-radius:8px;"><span style="display:block;color:#0a0e1a;font-weight:bold;font-size:15px;">{dur}</span><span style="color:#9aa0ac;font-size:11px;">Durée</span></td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;margin-top:12px;">
          {breakdown_rows}
          <tr><td style="padding:10px 0;color:#0a0e1a;font-size:17px;font-weight:bold;border-top:1px solid #eee;">Total payé</td>
              <td style="padding:10px 0;color:#FF4500;font-size:17px;font-weight:bold;text-align:right;border-top:1px solid #eee;">{_money(total)}</td></tr>
        </table>
        <p style="color:#9aa0ac;font-size:11px;line-height:1.5;margin:14px 0 0;">
          SB Drive VTC est une plateforme de mise en relation. La course a été réalisée par le chauffeur partenaire
          « {driver_name or '—'} » ; cette facture est émise pour son compte.
        </p>
        <p style="text-align:center;margin:22px 0 8px;">
          <a href="{ride_url}" style="background:#FF4500;color:#ffffff;text-decoration:none;
             padding:12px 24px;border-radius:999px;font-weight:bold;font-size:15px;display:inline-block;">Voir ma course</a>
        </p>
        <p style="color:#444;font-size:14px;text-align:center;">Bonne route ! 🚗</p>"""
    await _send(to, f"Facture course {invoice_no} · SB Drive", _shell("Course terminée 🏁", "#0a0e1a", body))


def _code_block(code: str) -> str:
    digits = "".join(
        f'<span style="display:inline-block;min-width:34px;margin:0 3px;padding:10px 0;'
        f'background:#0a0e1a;color:#ffffff;font-size:24px;font-weight:bold;border-radius:8px;'
        f'text-align:center;font-family:monospace;">{d}</span>'
        for d in str(code)
    )
    return f'<div style="text-align:center;margin:18px 0;">{digits}</div>'


async def send_verification_email(to: str, name: str, code: str, link: str) -> None:
    """Email verification: 6-digit OTP code + clickable activation link."""
    body = f"""\
        <p style="color:#444;font-size:15px;line-height:1.6;">Bonjour {name or ''},</p>
        <p style="color:#444;font-size:15px;line-height:1.6;">
          Bienvenue sur <b>SB Drive</b> ! Pour sécuriser votre compte et activer toutes
          les fonctionnalités, confirmez votre adresse email.
        </p>
        <p style="color:#444;font-size:14px;margin-top:18px;">Votre code de vérification :</p>
        {_code_block(code)}
        <p style="color:#9aa0ac;font-size:12px;text-align:center;margin:0 0 18px;">Ce code expire dans 24 heures.</p>
        <p style="color:#444;font-size:14px;text-align:center;">Ou cliquez simplement sur le bouton ci-dessous :</p>
        <p style="text-align:center;margin:14px 0 22px;">
          <a href="{link}" style="background:#FF4500;color:#ffffff;text-decoration:none;
             padding:13px 26px;border-radius:999px;font-weight:bold;font-size:15px;display:inline-block;">
            Vérifier mon email
          </a>
        </p>
        <p style="color:#9aa0ac;font-size:11px;line-height:1.5;">
          Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email.
        </p>"""
    await _send(to, "Vérifiez votre email — SB Drive", _shell("Vérifiez votre email ✉️", "#FF4500", body))


async def send_password_reset_email(to: str, name: str, code: str, link: str) -> None:
    """Password reset: 6-digit OTP code + clickable reset link to a dedicated page."""
    body = f"""\
        <p style="color:#444;font-size:15px;line-height:1.6;">Bonjour {name or ''},</p>
        <p style="color:#444;font-size:15px;line-height:1.6;">
          Vous avez demandé la réinitialisation de votre mot de passe SB Drive.
          Utilisez le code ci-dessous ou cliquez sur le bouton.
        </p>
        <p style="color:#444;font-size:14px;margin-top:18px;">Votre code de réinitialisation :</p>
        {_code_block(code)}
        <p style="color:#9aa0ac;font-size:12px;text-align:center;margin:0 0 18px;">Ce code expire dans 1 heure.</p>
        <p style="text-align:center;margin:14px 0 22px;">
          <a href="{link}" style="background:#0a0e1a;color:#ffffff;text-decoration:none;
             padding:13px 26px;border-radius:999px;font-weight:bold;font-size:15px;display:inline-block;">
            Réinitialiser mon mot de passe
          </a>
        </p>
        <p style="color:#9aa0ac;font-size:11px;line-height:1.5;">
          Si vous n'avez pas demandé cette réinitialisation, ignorez cet email — votre mot de passe
          reste inchangé. Ne communiquez jamais ce code à qui que ce soit.
        </p>"""
    await _send(to, "Réinitialisation de votre mot de passe — SB Drive", _shell("Mot de passe oublié 🔐", "#0a0e1a", body))
