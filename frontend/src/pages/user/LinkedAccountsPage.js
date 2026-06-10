import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LinkSimple, CheckCircle, Trash, PaperPlaneTilt, Clock } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const LinkedAccountsPage = () => {
  const navigate = useNavigate();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ident, setIdent] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/payouts/links`, { credentials: 'include' });
      const d = await r.json();
      setLinks(d.links || []);
    } catch { toast.error('Erreur de chargement'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const requestLink = async () => {
    if (!ident.trim()) return;
    setSending(true);
    try {
      const r = await fetch(`${API}/api/payouts/link/request`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: ident.trim() }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Échec'); }
      toast.success('Demande de jumelage envoyée');
      setIdent(''); load();
    } catch (e) { toast.error(e.message); } finally { setSending(false); }
  };

  const act = async (id, action) => {
    try {
      const r = await fetch(`${API}/api/payouts/link/${id}/${action}`, { method: 'POST', credentials: 'include' });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Échec'); }
      toast.success(action === 'accept' ? 'Compte jumelé' : 'Liaison supprimée');
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="mobile-container bg-gray-50 min-h-screen pb-24" data-testid="linked-accounts-page">
      <div className="sticky top-0 z-50 bg-white border-b p-4 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-1" data-testid="linked-back-btn"><ArrowLeft size={22} /></button>
        <h1 className="text-lg font-bold">Comptes liés</h1>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-start gap-3">
          <LinkSimple size={22} className="text-indigo-600 shrink-0 mt-0.5" />
          <p className="text-[13px] text-indigo-900 leading-snug">Liez un autre compte (ex. votre compte marchand) pour transférer facilement de l'argent entre vous. La liaison doit être confirmée par les deux comptes.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <label className="block text-xs font-semibold text-gray-700 mb-1">E-mail ou téléphone du compte à lier</label>
          <div className="flex gap-2">
            <input value={ident} onChange={(e) => setIdent(e.target.value)} placeholder="email@ex.com ou +33…"
              className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm" data-testid="link-identifier-input" />
            <button onClick={requestLink} disabled={sending || !ident.trim()}
              className="px-4 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-50" data-testid="link-request-btn">Lier</button>
          </div>
        </div>

        {loading ? <p className="text-gray-400 text-sm">Chargement…</p> : links.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6" data-testid="no-links">Aucun compte lié pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {links.map((l) => (
              <div key={l.id} className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3" data-testid={`link-${l.id}`}>
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <LinkSimple size={18} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{l.other_name || l.other_phone} <span className="text-xs font-normal text-gray-400">· {l.other_role}</span></p>
                  <p className="text-xs text-gray-400">
                    {l.status === 'accepted' ? 'Compte lié ✓' : l.direction === 'incoming' ? 'Demande reçue' : 'En attente de confirmation'}
                  </p>
                </div>
                {l.status === 'accepted' ? (
                  <button onClick={() => navigate(`/wallet?action=send&to=${encodeURIComponent(l.other_phone || '')}`)}
                    className="px-3 py-2 rounded-lg bg-orange-50 text-orange-600 text-xs font-bold flex items-center gap-1" data-testid={`link-transfer-${l.id}`}>
                    <PaperPlaneTilt size={14} /> Transférer
                  </button>
                ) : l.direction === 'incoming' ? (
                  <button onClick={() => act(l.id, 'accept')} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1" data-testid={`link-accept-${l.id}`}>
                    <CheckCircle size={14} /> Confirmer
                  </button>
                ) : (
                  <span className="text-amber-500"><Clock size={18} /></span>
                )}
                <button onClick={() => act(l.id, 'remove')} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400" data-testid={`link-remove-${l.id}`}>
                  <Trash size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default LinkedAccountsPage;
