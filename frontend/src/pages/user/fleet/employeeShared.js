// Helpers partagés du Module Employés.
export const fmtMin = (m) => {
  const v = Math.max(0, Math.round(m || 0));
  const h = Math.floor(v / 60);
  const mm = v % 60;
  if (h <= 0) return `${mm} min`;
  return `${h} h ${mm.toString().padStart(2, '0')}`;
};
