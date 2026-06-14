// Helpers partagés du Module Employés.
export const fmtMin = (m) => {
  const v = Math.max(0, Math.round(m || 0));
  const h = Math.floor(v / 60);
  const mm = v % 60;
  if (h <= 0) return `${mm} min`;
  return `${h} h ${mm.toString().padStart(2, '0')}`;
};

/** Trigger a browser download from an axios blob response. */
export const downloadBlob = (res, filename) => {
  const blob = new Blob([res.data], { type: res.data?.type || 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};
