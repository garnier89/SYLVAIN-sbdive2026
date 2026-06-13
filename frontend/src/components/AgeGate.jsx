import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Warning } from '@phosphor-icons/react';

/**
 * AgeGate — mandatory 18+ confirmation overlay for restricted verticals
 * (alcohol, pharmacy/medicine). Blocks the page until the user confirms.
 * Choice is remembered per device via localStorage (one confirmation per category).
 */
const AgeGate = ({ storageKey, title = "Vérification d'âge", message, accent = '#b45309' }) => {
  const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState(() => {
    try { return localStorage.getItem(storageKey) === '1'; } catch { return false; }
  });

  if (confirmed) return null;

  const accept = () => {
    try { localStorage.setItem(storageKey, '1'); } catch { /* ignore */ }
    setConfirmed(true);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-6" data-testid="age-gate">
      <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
        <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: `${accent}1a` }}>
          <Warning size={32} weight="fill" style={{ color: accent }} />
        </div>
        <h2 className="text-xl font-bold text-gray-900" data-testid="age-gate-title">{title}</h2>
        <p className="text-sm text-gray-500 mt-2 mb-6 leading-relaxed">{message}</p>
        <button
          onClick={accept}
          className="w-full py-3 rounded-xl text-white font-bold mb-2 active:scale-[0.99] transition-transform"
          style={{ background: accent }}
          data-testid="age-gate-confirm"
        >
          Je confirme avoir 18 ans ou plus
        </button>
        <button
          onClick={() => navigate(-1)}
          className="w-full py-3 rounded-xl text-gray-500 font-semibold"
          data-testid="age-gate-decline"
        >
          J'ai moins de 18 ans — Quitter
        </button>
      </div>
    </div>
  );
};

export default AgeGate;
