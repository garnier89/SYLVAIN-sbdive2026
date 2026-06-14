/**
 * TowingOperatorPage — "Espace dépanneur": real partners register, go online,
 * receive live requests, accept, navigate, share position, mark arrived.
 * Reuses the existing user JWT auth (a tow_operators profile on top).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Truck, MapPin, Phone, NavigationArrow, CheckCircle, Star,
  Wallet, ClipboardText, Power, Crosshair,
} from '@phosphor-icons/react';
import TowingMap from '../../components/TowingMap';
import { useLocale } from '../../contexts/LocaleContext';

const API = process.env.REACT_APP_BACKEND_URL;
const PROBLEM_LABELS = {
  battery: 'Batterie à plat', tire: 'Pneu crevé', fuel: 'Panne de carburant',
  lockout: 'Ouverture de porte', nostart: 'Ne démarre pas', towing: 'Remorquage', accident: 'Accident',
};

const getPos = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
    () => resolve(null), { enableHighAccuracy: true, timeout: 8000 });
});

const TowingOperatorPage = () => {
  const { money } = useLocale();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState({ company: '', phone: '', plate: '', truck_type: '', city: '' });
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(false);
  const [feed, setFeed] = useState([]);
  const [active, setActive] = useState(null);
  const [commissionPct, setCommissionPct] = useState(0.15);
  const [uploading, setUploading] = useState('');
  const pollRef = useRef(null);

  const loadMe = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/towing/operator/me`, { credentials: 'include' });
      const d = await r.json();
      if (d.registered) {
        setProfile(d.operator); setStats(d.stats); setOnline(!!d.operator.is_online);
        setCommissionPct(d.commission_pct ?? 0.15);
        setForm({ company: d.operator.company || '', phone: d.operator.phone || '', plate: d.operator.plate || '', truck_type: d.operator.truck_type || '', city: d.operator.city || '' });
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadMe(); }, [loadMe]);

  const vstatus = profile?.verification_status || 'pending';
  const approved = vstatus === 'approved';
  const documents = profile?.documents || {};

  const uploadDoc = async (key, fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    setUploading(key);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const up = await fetch(`${API}/api/uploads/image`, { method: 'POST', credentials: 'include', body: fd });
      const ud = await up.json();
      if (!up.ok) { toast.error(ud.detail || 'Échec de l\'upload'); return; }
      const r = await fetch(`${API}/api/towing/operator/documents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ [key]: ud.url }),
      });
      if (r.ok) { toast.success('Document envoyé'); await loadMe(); }
    } catch { toast.error('Erreur réseau'); }
    finally { setUploading(''); }
  };

  // Load active job + feed (poll while online/has active)
  const refresh = useCallback(async () => {
    try {
      const jr = await fetch(`${API}/api/towing/operator/jobs`, { credentials: 'include' });
      const jobs = await jr.json();
      const act = Array.isArray(jobs) ? jobs.find((j) => ['en_route', 'arrived'].includes(j.status)) : null;
      setActive(act || null);
      if (!act && online) {
        const fr = await fetch(`${API}/api/towing/operator/feed`, { credentials: 'include' });
        setFeed(await fr.json());
      } else { setFeed([]); }
    } catch { /* ignore */ }
  }, [online]);

  useEffect(() => {
    if (!profile) return;
    refresh();
    pollRef.current = setInterval(refresh, 4000);
    return () => clearInterval(pollRef.current);
  }, [profile, refresh]);

  const register = async () => {
    if (!form.company.trim()) { toast.error('Indiquez le nom de votre société'); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/towing/operator/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(form),
      });
      if (r.ok) { toast.success('Espace dépanneur créé !'); await loadMe(); }
      else toast.error('Échec de l\'inscription');
    } catch { toast.error('Erreur réseau'); }
    finally { setSaving(false); }
  };

  const toggleOnline = async () => {
    const next = !online;
    if (next && !approved) { toast.error('Votre compte doit être validé avant de passer en ligne'); return; }
    const pos = next ? await getPos() : null;
    try {
      const r = await fetch(`${API}/api/towing/operator/online`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ online: next, ...(pos || {}) }),
      });
      if (r.ok) { setOnline(next); toast.success(next ? 'Vous êtes en ligne' : 'Vous êtes hors ligne'); refresh(); }
    } catch { toast.error('Erreur réseau'); }
  };

  const accept = async (id) => {
    try {
      const r = await fetch(`${API}/api/towing/requests/${id}/accept`, { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (r.ok) { toast.success('Demande acceptée !'); setActive(d); setFeed([]); }
      else toast.error(d.detail || 'Demande indisponible');
    } catch { toast.error('Erreur réseau'); }
  };

  const setStatus = async (status) => {
    try {
      const r = await fetch(`${API}/api/towing/requests/${active.id}/operator-status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ status }),
      });
      if (r.ok) { setActive(await r.json()); toast.success(status === 'arrived' ? 'Sur place' : 'En route'); }
    } catch { toast.error('Erreur réseau'); }
  };

  const sharePosition = async () => {
    const pos = await getPos();
    if (!pos) { toast.error('Position indisponible'); return; }
    try {
      const r = await fetch(`${API}/api/towing/requests/${active.id}/operator-ping`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(pos),
      });
      const d = await r.json();
      if (r.ok) toast.success(`Position partagée · ETA ${d.eta_minutes} min`);
    } catch { toast.error('Erreur réseau'); }
  };

  if (loading) {
    return <div className="mobile-container min-h-screen flex items-center justify-center text-gray-400" data-testid="operator-loading">Chargement…</div>;
  }

  // ── Registration ──
  if (!profile) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50" data-testid="operator-register">
        <div className="bg-blue-600 px-4 pt-4 pb-6 flex items-center gap-3">
          <button onClick={() => navigate('/towing')} className="text-white" data-testid="back-btn"><ArrowLeft size={22} /></button>
          <div className="flex items-center gap-2 text-white">
            <Truck size={24} weight="fill" />
            <h1 className="text-lg font-bold">Devenir dépanneur partenaire</h1>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-500">Inscrivez-vous pour recevoir des demandes de dépannage en temps réel et intervenir près de chez vous.</p>
          {[
            { k: 'company', l: 'Nom de la société', ph: 'Ex : Dépann\'Express' },
            { k: 'phone', l: 'Téléphone', ph: '+33…' },
            { k: 'plate', l: 'Plaque de la dépanneuse', ph: 'AB-123-CD' },
            { k: 'truck_type', l: 'Type de dépanneuse', ph: 'Plateau, dépanneuse…' },
            { k: 'city', l: 'Ville / zone', ph: 'Paris' },
          ].map((f) => (
            <div key={f.k} className="bg-white rounded-2xl p-3">
              <label className="text-xs font-semibold text-gray-500">{f.l}</label>
              <input value={form[f.k]} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} placeholder={f.ph}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mt-1" data-testid={`operator-${f.k}`} />
            </div>
          ))}
          <button onClick={register} disabled={saving} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-60" data-testid="operator-register-btn">
            {saving ? 'Création…' : 'Créer mon espace dépanneur'}
          </button>
        </div>
      </div>
    );
  }

  // ── Dashboard ──
  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="operator-dashboard">
      <div className="bg-blue-600 px-4 pt-4 pb-5">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/towing')} className="text-white" data-testid="back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold text-white flex-1">Espace dépanneur</h1>
          <button onClick={toggleOnline} data-testid="operator-online-toggle"
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${online ? 'bg-green-400 text-green-900' : 'bg-white/20 text-white'}`}>
            <Power size={14} weight="bold" /> {online ? 'En ligne' : 'Hors ligne'}
          </button>
        </div>
        <p className="text-sm text-white/85">{profile.company}</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3" data-testid="operator-stats">
          <div className="bg-white rounded-2xl p-3 text-center">
            <CheckCircle size={20} className="mx-auto text-green-500 mb-1" weight="fill" />
            <p className="text-lg font-black text-gray-900">{stats?.completed ?? 0}</p>
            <p className="text-[10px] text-gray-500">Terminées</p>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center">
            <ClipboardText size={20} className="mx-auto text-blue-500 mb-1" weight="fill" />
            <p className="text-lg font-black text-gray-900">{stats?.active ?? 0}</p>
            <p className="text-[10px] text-gray-500">En cours</p>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center">
            <Wallet size={20} className="mx-auto text-amber-500 mb-1" weight="fill" />
            <p className="text-lg font-black text-gray-900">{money(Number(stats?.earnings ?? 0))}</p>
            <p className="text-[10px] text-gray-500">Gains</p>
          </div>
        </div>

        {/* Verification banner + documents (KYC) */}
        {!approved && (
          <div className={`rounded-2xl p-4 ${vstatus === 'rejected' ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`} data-testid="operator-verification-banner">
            <p className={`text-sm font-bold ${vstatus === 'rejected' ? 'text-red-700' : 'text-amber-700'}`}>
              {vstatus === 'rejected' ? '❌ Compte refusé' : '⏳ Validation en attente'}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {vstatus === 'rejected'
                ? (profile.rejection_reason || 'Vos documents n\'ont pas été validés. Merci de les renvoyer.')
                : 'Envoyez vos documents (assurance, carte grise, pièce d\'identité). Un administrateur les validera avant que vous puissiez passer en ligne.'}
            </p>
          </div>
        )}

        {/* Documents KYC */}
        <div className="bg-white rounded-2xl p-4 space-y-2.5" data-testid="operator-documents">
          <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500">Documents</p>
          {[
            { k: 'insurance', l: 'Assurance' },
            { k: 'license', l: 'Carte grise / licence' },
            { k: 'id_card', l: 'Pièce d\'identité' },
          ].map((d) => (
            <div key={d.k} className="flex items-center justify-between">
              <span className="text-sm text-gray-700 flex items-center gap-2">
                {documents[d.k] ? <CheckCircle size={16} weight="fill" className="text-green-500" /> : <ClipboardText size={16} className="text-gray-300" />}
                {d.l}
              </span>
              <label className="text-xs font-semibold text-blue-600 cursor-pointer" data-testid={`upload-${d.k}`}>
                {uploading === d.k ? 'Envoi…' : documents[d.k] ? 'Remplacer' : 'Téléverser'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadDoc(d.k, e.target.files)} />
              </label>
            </div>
          ))}
        </div>

        {/* Commission info */}
        <div className="bg-blue-50 rounded-2xl p-3 flex items-center justify-between" data-testid="operator-commission-info">
          <span className="text-xs text-blue-700">Commission plateforme</span>
          <span className="text-sm font-bold text-blue-700">{Math.round(commissionPct * 100)}%</span>
        </div>

        {/* Active job */}
        {active ? (
          <div className="bg-white rounded-2xl p-4 space-y-3" data-testid="operator-active-job">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Intervention en cours</h2>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-blue-50 text-blue-600">{active.status === 'arrived' ? 'Sur place' : 'En route'}</span>
            </div>
            <TowingMap pickup={{ lat: active.pickup_lat, lng: active.pickup_lng }} operator={active.operator_position} height={200} />
            <div className="text-sm space-y-1">
              <p className="font-semibold text-gray-900">{PROBLEM_LABELS[active.problem_type] || active.problem_label}</p>
              <p className="text-gray-500 flex items-center gap-1"><MapPin size={13} /> {active.pickup_address || 'Position client'}</p>
              {active.dest_address && <p className="text-gray-500 flex items-center gap-1"><NavigationArrow size={13} /> → {active.dest_address}</p>}
              <p className="text-gray-500">Client : {active.user_name} · {[active.vehicle?.make, active.vehicle?.model, active.vehicle?.plate].filter(Boolean).join(' ')}</p>
              <p className="font-bold text-gray-900">{money(Number(active.total_price))}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={sharePosition} className="flex items-center justify-center gap-1.5 border border-blue-300 text-blue-600 py-2.5 rounded-xl text-sm font-semibold" data-testid="operator-share-position">
                <Crosshair size={15} /> Partager position
              </button>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${active.pickup_lat},${active.pickup_lng}`} target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-1.5 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold" data-testid="operator-navigate">
                <NavigationArrow size={15} weight="fill" /> Naviguer
              </a>
            </div>
            {active.status !== 'arrived' && (
              <button onClick={() => setStatus('arrived')} className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm" data-testid="operator-mark-arrived">
                Je suis sur place
              </button>
            )}
            {active.status === 'arrived' && (
              <p className="text-center text-xs text-gray-400">En attente de la confirmation de fin par le client.</p>
            )}
          </div>
        ) : online ? (
          <div data-testid="operator-feed">
            <p className="text-sm font-bold text-gray-700 mb-2">Demandes à proximité</p>
            {feed.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-400" data-testid="operator-feed-empty">
                Aucune demande pour le moment. Vous serez notifié dès qu'une demande arrive.
              </div>
            ) : feed.map((req) => (
              <div key={req.id} className="bg-white rounded-2xl p-4 mb-3 border border-gray-100" data-testid={`operator-request-${req.id}`}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{PROBLEM_LABELS[req.problem_type] || req.problem_label}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><MapPin size={12} /> {req.pickup_address || 'Position client'}</p>
                    {req.distance_km != null && <p className="text-[11px] text-blue-600 font-semibold mt-0.5">à {req.distance_km} km</p>}
                  </div>
                  <span className="font-bold text-gray-900 text-sm">{money(Number(req.total_price))}</span>
                </div>
                <button onClick={() => accept(req.id)} className="w-full mt-3 bg-blue-600 text-white py-2.5 rounded-xl font-semibold text-sm" data-testid={`operator-accept-${req.id}`}>
                  Accepter
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 text-center" data-testid="operator-offline">
            <Power size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">Passez <b>en ligne</b> pour recevoir des demandes de dépannage.</p>
          </div>
        )}

        {/* Profile rating */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
          <Star size={13} weight="fill" className="text-amber-400" /> Note {profile.rating?.toFixed?.(1) ?? profile.rating} · {profile.plate} · {profile.truck_type}
        </div>
      </div>
    </div>
  );
};

export default TowingOperatorPage;
