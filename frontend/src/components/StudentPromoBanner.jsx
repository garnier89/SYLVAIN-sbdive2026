/**
 * StudentPromoBanner — booking-screen nudge for non-verified students.
 * Self-contained: fetches /student/me, renders nothing if the module is
 * disabled, the user is already a verified student, or the user dismissed it.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, CaretRight, X } from '@phosphor-icons/react';
import { studentAPI } from '../services/api';

const DISMISS_KEY = 'sb_student_promo_dismissed';

const StudentPromoBanner = () => {
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    let alive = true;
    studentAPI.me().then((r) => { if (alive) setInfo(r.data); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (hidden || !info) return null;
  const cfg = info.config || {};
  const pct = cfg.ride_discount_pct || 0;
  if (info.is_student || cfg.enabled === false || pct <= 0) return null;

  const dismiss = (e) => {
    e.stopPropagation();
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setHidden(true);
  };

  return (
    <button
      onClick={() => navigate('/sb-student')}
      data-testid="student-promo-banner"
      className="w-full mb-3 rounded-2xl p-3 flex items-center gap-3 text-left shadow-sm relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #5B21B6, #7C3AED)' }}
    >
      <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
        <GraduationCap size={22} weight="fill" className="text-white" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-white font-black text-sm block leading-tight">Étudiant ? Économisez -{pct}% 🎓</span>
        <span className="text-white/80 text-xs block leading-tight">Vérifiez votre statut en 2 min et débloquez les tarifs SB Student.</span>
      </span>
      <CaretRight size={18} className="text-white shrink-0" />
      <span
        role="button"
        tabIndex={0}
        onClick={dismiss}
        data-testid="student-promo-dismiss"
        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/15 flex items-center justify-center"
      >
        <X size={12} className="text-white" />
      </span>
    </button>
  );
};

export default StudentPromoBanner;
