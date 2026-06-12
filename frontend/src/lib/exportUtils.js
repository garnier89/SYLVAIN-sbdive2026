import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Download an array of objects as a CSV file. `columns` = [{key,label}]. */
export const exportCSV = (filename, columns, rows) => {
  const header = columns.map((c) => c.label).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + header + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

/** Export an array of objects as a styled PDF table. `columns` = [{key,label}]. */
export const exportPDF = (title, columns, rows, { orientation = 'landscape' } = {}) => {
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  doc.setFontSize(14);
  doc.text(title, 40, 40);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Généré le ${new Date().toLocaleString('fr-FR')} — ${rows.length} lignes`, 40, 56);
  autoTable(doc, {
    startY: 70,
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => (r[c.key] == null ? '' : String(r[c.key])))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });
  doc.save(`${title.replace(/\s+/g, '-').toLowerCase()}.pdf`);
};
