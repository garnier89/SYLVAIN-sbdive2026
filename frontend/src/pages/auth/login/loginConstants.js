// Country dial codes for the phone-auth step.
export const COUNTRIES = [
  { code: '+33', flag: '🇫🇷', name: 'France' },
  { code: '+1', flag: '🇺🇸', name: 'USA' },
  { code: '+44', flag: '🇬🇧', name: 'UK' },
  { code: '+49', flag: '🇩🇪', name: 'Allemagne' },
  { code: '+34', flag: '🇪🇸', name: 'Espagne' },
  { code: '+39', flag: '🇮🇹', name: 'Italie' },
  { code: '+32', flag: '🇧🇪', name: 'Belgique' },
  { code: '+41', flag: '🇨🇭', name: 'Suisse' },
  { code: '+212', flag: '🇲🇦', name: 'Maroc' },
  { code: '+237', flag: '🇨🇲', name: 'Cameroun' },
  { code: '+225', flag: '🇨🇮', name: "Côte d'Ivoire" },
  { code: '+221', flag: '🇸🇳', name: 'Sénégal' },
];

// Maps a FastAPI error `detail` (string OR 422 array of {msg}) to a safe string.
export const formatApiErrorDetail = (detail) => {
  if (detail == null) return '';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((e) => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e))).filter(Boolean).join(' ');
  if (detail && typeof detail.msg === 'string') return detail.msg;
  return String(detail);
};

export const Fab = ({ onClick, loading, Icon }) => (
  <button
    onClick={onClick}
    disabled={loading}
    className="w-14 h-14 rounded-full bg-[#FF5000] hover:bg-[#E54800] flex items-center justify-center shadow-lg shadow-orange-500/30 transition-all disabled:opacity-60"
    data-testid="submit-btn"
  >
    {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Icon size={22} className="text-white" weight="bold" />}
  </button>
);

export const BackBtn = ({ onClick }) => (
  <div className="px-4 pt-5">
    <button onClick={onClick} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center" data-testid="back-btn">
      <span className="sr-only">Retour</span>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
    </button>
  </div>
);
