"""PDF generation for SB Tracking reports (employees timesheets + fleet activity).

Uses ReportLab (already a project dependency). Each builder returns raw PDF bytes
so routes can stream them with a `Response(media_type="application/pdf")`.
"""
import io
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

BRAND = colors.HexColor("#0369a1")
BRAND_DARK = colors.HexColor("#0c4a6e")
LIGHT = colors.HexColor("#e0f2fe")


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("SBTitle", parent=ss["Title"], textColor=BRAND_DARK, fontSize=20, spaceAfter=2))
    ss.add(ParagraphStyle("SBSub", parent=ss["Normal"], textColor=colors.HexColor("#64748b"), fontSize=10))
    ss.add(ParagraphStyle("SBH2", parent=ss["Heading2"], textColor=BRAND_DARK, fontSize=13, spaceBefore=10, spaceAfter=4))
    ss.add(ParagraphStyle("SBNote", parent=ss["Normal"], textColor=colors.HexColor("#94a3b8"), fontSize=8))
    return ss


def _fmt_min(m):
    v = max(0, int(round(m or 0)))
    return f"{v // 60} h {v % 60:02d}"


def _stamp():
    return datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")


def employees_report_pdf(org_name: str, day_keys: list, rows: list) -> bytes:
    """Weekly team timesheet: one row per employee, one column per day + total."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=14 * mm, rightMargin=14 * mm,
                            topMargin=14 * mm, bottomMargin=14 * mm)
    st = _styles()
    el = [Paragraph("Rapport d'heures — Employés", st["SBTitle"]),
          Paragraph(f"{org_name} · Période 7 jours · Généré le {_stamp()}", st["SBSub"]),
          Spacer(1, 8)]

    day_labels = []
    for k in day_keys:
        try:
            d = datetime.strptime(k, "%Y-%m-%d")
            day_labels.append(d.strftime("%a %d/%m"))
        except Exception:
            day_labels.append(k)

    header = ["Employé", "Poste"] + day_labels + ["Total", "Services"]
    data = [header]
    grand = 0
    for r in rows:
        grand += r.get("total_min", 0)
        data.append([
            r.get("name", ""), r.get("role", ""),
            *[_fmt_min(m) for m in r.get("days", [])],
            _fmt_min(r.get("total_min", 0)), str(r.get("shifts_count", 0)),
        ])
    if not rows:
        data.append(["—", "Aucun employé", *["" for _ in day_keys], "0 h 00", "0"])
    else:
        data.append(["", "TOTAL ÉQUIPE", *["" for _ in day_keys], _fmt_min(grand), ""])

    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("ALIGN", (2, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, LIGHT]),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f1f5f9")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    el.append(table)
    el.append(Spacer(1, 10))
    el.append(Paragraph("Heures calculées à partir des pointages (clock-in / clock-out) et services en cours. "
                        "SB Tracking — Document généré automatiquement.", st["SBNote"]))
    doc.build(el)
    return buf.getvalue()


def fleet_report_pdf(fleet_name: str, vehicles: list, alert_counts: dict, total_alerts: int) -> bytes:
    """Fleet activity snapshot: vehicles + status + alert summary."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm)
    st = _styles()
    el = [Paragraph("Rapport d'activité — Flotte", st["SBTitle"]),
          Paragraph(f"{fleet_name} · Généré le {_stamp()}", st["SBSub"]),
          Spacer(1, 8), Paragraph("Véhicules", st["SBH2"])]

    status_fr = {"moving": "En route", "stopped": "Arrêté", "parked": "Stationné", "offline": "Hors ligne", "working": "Actif"}
    vdata = [["Véhicule", "Plaque", "Type", "Conducteur", "Statut", "Vitesse"]]
    for v in vehicles:
        live = v.get("live") or {}
        vdata.append([
            v.get("name", ""), v.get("plate", "") or "—", v.get("vtype", ""),
            v.get("driver_name") or "—", status_fr.get(live.get("status"), live.get("status", "—")),
            f"{int(live.get('speed', 0) or 0)} km/h",
        ])
    if len(vdata) == 1:
        vdata.append(["—", "Aucun véhicule", "", "", "", ""])
    vt = Table(vdata, repeatRows=1, colWidths=[40 * mm, 26 * mm, 22 * mm, 34 * mm, 26 * mm, 22 * mm])
    vt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    el.append(vt)
    el.append(Paragraph("Alertes (synthèse)", st["SBH2"]))
    labels = {"speeding": "Excès de vitesse", "geofence_exit": "Sorties de zone", "geofence_enter": "Entrées en zone",
              "unauthorized_start": "Démarrages non autorisés", "low_battery": "Batterie faible",
              "crash": "Chocs détectés", "command": "Commandes"}
    adata = [["Type d'alerte", "Occurrences"]]
    for k, label in labels.items():
        if alert_counts.get(k):
            adata.append([label, str(alert_counts[k])])
    if len(adata) == 1:
        adata.append(["Aucune alerte", "0"])
    adata.append(["TOTAL", str(total_alerts)])
    at = Table(adata, colWidths=[120 * mm, 40 * mm])
    at.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f1f5f9")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    el.append(at)
    el.append(Spacer(1, 10))
    el.append(Paragraph("SB Tracking — Document généré automatiquement.", st["SBNote"]))
    doc.build(el)
    return buf.getvalue()
