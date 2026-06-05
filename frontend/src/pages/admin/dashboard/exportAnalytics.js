import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const PERIOD_LABEL = {
  today: "Aujourd'hui",
  week: '7 derniers jours',
  month: '30 derniers jours',
  all: 'Total',
};

const fmtMoney = (n) => `${Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const periodLabel = (p) => PERIOD_LABEL[p] || p;

const triggerDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const exportAnalyticsCSV = (breakdown, period) => {
  if (!breakdown) return;
  const services = breakdown.revenue_by_service || [];
  const zones = breakdown.top_zones || [];
  const lines = [];
  lines.push(`SB Drive VTC - Rapport analytics`);
  lines.push(`Periode;${periodLabel(period)}`);
  lines.push(`Genere le;${new Date().toLocaleString('fr-FR')}`);
  lines.push('');
  lines.push('Revenus par service');
  lines.push('Service;Revenu (EUR);Commandes');
  services.forEach((s) => lines.push(`${s.service};${Number(s.revenue || 0).toFixed(2)};${s.count || 0}`));
  lines.push(`Total;${Number(breakdown.total_revenue || 0).toFixed(2)};`);
  lines.push('');
  lines.push('Top zones / villes');
  lines.push('Rang;Ville;Courses;Revenu (EUR)');
  zones.forEach((z, i) => lines.push(`${i + 1};${z.city};${z.rides || 0};${Number(z.revenue || 0).toFixed(2)}`));

  // BOM for Excel UTF-8 compatibility
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `sb-drive-analytics-${period}-${new Date().toISOString().slice(0, 10)}.csv`);
};

export const exportAnalyticsPDF = (breakdown, period) => {
  if (!breakdown) return;
  const services = breakdown.revenue_by_service || [];
  const zones = breakdown.top_zones || [];
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  doc.setFontSize(18);
  doc.setTextColor(33, 37, 41);
  doc.text('SB Drive VTC — Rapport analytics', 40, 50);
  doc.setFontSize(11);
  doc.setTextColor(107, 114, 128);
  doc.text(`Période : ${periodLabel(period)}`, 40, 70);
  doc.text(`Généré le : ${new Date().toLocaleString('fr-FR')}`, 40, 86);
  doc.setFontSize(13);
  doc.setTextColor(59, 130, 246);
  doc.text(`Revenu total : ${fmtMoney(breakdown.total_revenue)}`, 40, 110);

  autoTable(doc, {
    startY: 130,
    head: [['Service', 'Revenu', 'Commandes']],
    body: services.map((s) => [s.service, fmtMoney(s.revenue), String(s.count || 0)]),
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  });

  const afterServices = doc.lastAutoTable.finalY + 24;
  doc.setFontSize(13);
  doc.setTextColor(33, 37, 41);
  doc.text('Top zones / villes', 40, afterServices);

  autoTable(doc, {
    startY: afterServices + 12,
    head: [['#', 'Ville', 'Courses', 'Revenu']],
    body: zones.map((z, i) => [String(i + 1), z.city, String(z.rides || 0), fmtMoney(z.revenue)]),
    headStyles: { fillColor: [16, 185, 129] },
    styles: { fontSize: 10, cellPadding: 6 },
    columnStyles: { 0: { cellWidth: 30 }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  });

  doc.save(`sb-drive-analytics-${period}-${new Date().toISOString().slice(0, 10)}.pdf`);
};
