import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { ArrowLeft, CheckCircle, XCircle, Warning, Keyboard, Camera } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { organizerAPI } from '../../../services/api';

const RESULT_META = {
  ok: { bg: 'bg-green-500', Icon: CheckCircle, label: 'Entrée validée' },
  already_used: { bg: 'bg-amber-500', Icon: Warning, label: 'Déjà scanné' },
  cancelled: { bg: 'bg-gray-500', Icon: XCircle, label: 'Billet annulé' },
  wrong_event: { bg: 'bg-red-500', Icon: XCircle, label: 'Autre événement' },
  invalid: { bg: 'bg-red-500', Icon: XCircle, label: 'Billet invalide' },
};

const EventCheckinPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState('');
  const [camError, setCamError] = useState(false);
  const scannerRef = useRef(null);
  const busyRef = useRef(false);
  const lastRef = useRef({ code: '', at: 0 });

  const loadStats = useCallback(() => {
    organizerAPI.checkinStats(id)
      .then((r) => setStats(r.data))
      .catch((e) => { if (e?.response?.status === 403) navigate('/organizer', { replace: true }); });
  }, [id, navigate]);

  const submitCode = useCallback(async (code) => {
    const clean = (code || '').trim();
    if (!clean || busyRef.current) return;
    const now = Date.now();
    if (clean === lastRef.current.code && now - lastRef.current.at < 3000) return; // de-dupe rapid rescans
    lastRef.current = { code: clean, at: now };
    busyRef.current = true;
    try {
      const r = await organizerAPI.checkin(id, clean);
      setResult({ ...r.data, _at: now });
      if (r.data.result === 'ok') loadStats();
    } catch (e) {
      setResult({ result: 'invalid', message: e?.response?.data?.detail || 'Erreur', _at: now });
    } finally {
      setTimeout(() => { busyRef.current = false; }, 1200);
    }
  }, [id, loadStats]);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    const h = new Html5Qrcode('qr-reader');
    scannerRef.current = h;
    h.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } },
      (decoded) => submitCode(decoded), () => {})
      .catch(() => setCamError(true));
    return () => {
      try {
        if (h && h.getState && h.getState() === 2) h.stop().then(() => h.clear()).catch(() => {});
        else h.clear?.();
      } catch { /* noop */ }
    };
  }, [submitCode]);

  const onManual = () => {
    if (!manual.trim()) { toast.error('Entrez un code de billet'); return; }
    submitCode(manual.trim());
    setManual('');
  };

  const rm = result ? (RESULT_META[result.result] || RESULT_META.invalid) : null;

  return (
    <div className="mobile-container min-h-screen" style={{ background: '#111827' }} data-testid="checkin-page">
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => navigate('/organizer/dashboard')} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={18} className="text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-extrabold text-white truncate">{stats?.event?.title || 'Contrôle d\'accès'}</h1>
          <p className="text-[11px] text-white/60">Scannez les billets à l'entrée</p>
        </div>
      </div>

      {/* Live counter */}
      <div className="px-4">
        <div className="bg-white/10 rounded-2xl px-4 py-3 flex items-center justify-around" data-testid="checkin-counter">
          <Counter label="Entrés" value={stats?.checked_in_seats ?? 0} accent="text-green-400" />
          <div className="w-px h-8 bg-white/15" />
          <Counter label="Places vendues" value={stats?.seats ?? 0} accent="text-white" />
          <div className="w-px h-8 bg-white/15" />
          <Counter label="Restant" value={Math.max((stats?.seats ?? 0) - (stats?.checked_in_seats ?? 0), 0)} accent="text-amber-300" />
        </div>
      </div>

      {/* Scanner */}
      <div className="px-4 mt-4">
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-square max-w-sm mx-auto">
          <div id="qr-reader" className="w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full" />
          {camError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 text-white/70" data-testid="cam-error">
              <Camera size={36} className="mb-2 opacity-60" />
              <p className="text-sm">Caméra indisponible. Utilisez la saisie manuelle ci-dessous.</p>
            </div>
          )}
        </div>
      </div>

      {/* Result banner */}
      {result && rm && (
        <div className="px-4 mt-4" key={result._at}>
          <div className={`${rm.bg} rounded-2xl p-4 text-white flex items-center gap-3 animate-[pulse_0.4s_ease-out]`} data-testid="checkin-result" data-result={result.result}>
            <rm.Icon size={32} weight="fill" className="shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-extrabold">{rm.label}</p>
              {result.ticket ? (
                <p className="text-sm text-white/90 truncate">{result.ticket.buyer} • {result.ticket.tier_name} × {result.ticket.quantity}</p>
              ) : (
                <p className="text-sm text-white/90">{result.message}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual entry */}
      <div className="px-4 mt-4 pb-10">
        <div className="bg-white/10 rounded-2xl p-3">
          <p className="text-[11px] text-white/60 mb-2 flex items-center gap-1.5"><Keyboard size={14} /> Saisie manuelle du code billet</p>
          <div className="flex gap-2">
            <input value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onManual()}
              placeholder="SBEVT-..." className="flex-1 bg-white/90 rounded-lg px-3 py-2.5 text-sm font-mono outline-none" data-testid="manual-code-input" />
            <button onClick={onManual} className="bg-[#FF4500] text-white font-bold px-4 rounded-lg text-sm" data-testid="manual-check-btn">Valider</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Counter = ({ label, value, accent }) => (
  <div className="text-center">
    <p className={`text-2xl font-extrabold ${accent}`}>{value}</p>
    <p className="text-[10px] text-white/60">{label}</p>
  </div>
);

export default EventCheckinPage;
