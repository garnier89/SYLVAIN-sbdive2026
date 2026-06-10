"""Transactional email via Resend (SB Store onboarding).

Non-blocking, fire-and-forget helpers that NEVER raise into the request path:
if the API key is missing or Resend errors, we log and move on. In Resend
"testing" mode (no verified domain) emails are only delivered to the account
owner's verified address — production delivery requires verifying a domain.
"""
import os
import asyncio
import logging

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
