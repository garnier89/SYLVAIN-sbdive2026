/**
 * AmbulanceOperatorPage — "Espace ambulancier": real partners register, go
 * online, receive live emergency requests, accept, navigate, share position,
 * mark on-site. Reuses the existing user JWT auth (an ambulance_operators profile).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Ambulance, MapPin, NavigationArrow, CheckCircle, Star,
  Wallet, ClipboardText, Power, Crosshair,
} from '@phosphor-icons/react';
import AmbulanceMap from '../../components/AmbulanceMap';
import { useLocale } from '../../contexts/LocaleContext';

const API = process.env.REACT_APP_BACKEND_URL;

const getPos = () => new Promise((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(
    (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
    () => resolve(null), { enableHighAccuracy: true, timeout: 8000 });
});

const AmbulanceOperatorPage = () => {
  const { money } = useLocale();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState({ company: '', phone: '', plate: '', vehicle_type: '', city: '' });
  const [saving, setSaving] = useState(false);
  const [online, setOnline] = useState(false);
  const [feed, setFeed] = useState([]);
  const [active, setActive] = useState(null);
  const [commissionPct, setCommissionPct] = useState(0.15);
  const [uploading, setUploading] = useState('');
  const pollRef = useRef(null);

  const loadMe = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/ambulance/operator/me`, { credentials: 'include' });
      const d = await r.json();
      if (d.registered) {
        setProfile(d.operator); setStats(d.stats); setOnline(!!d.operator.is_online);
        setCommissionPct(d.commission_pct ?? 0.15);
        setForm({ company: d.operator.company || '', phone: d.operator.phone || '', plate: d.operator.plate || '', vehicle_type: d.operator.vehicle_type || '', city: d.operator.city || '' });
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
      const r = await fetch(`${API}/api/ambulance/operator/documents`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ [key]: ud.url }),
      });
      if (r.ok) { toast.success('Document envoyé'); await loadMe(); }
    } catch { toast.error('Erreur réseau'); }
    finally { setUploading(''); }
  };

  const refresh = useCallback(async () => {
    try {
      const jr = await fetch(`${API}/api/ambulance/operator/jobs`, { credentials: 'include' });
      const jobs = await jr.json();
      const act = Array.isArray(jobs) ? jobs.find((j) => ['en_route', 'arrived'].includes(j.status)) : null;
      setActive(act || null);
      if (!act && online) {
        const fr = await fetch(`${API}/api/ambulance/operator/feed`, { credentials: 'include' });
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
      const r = await fetch(`${API}/api/ambulance/operator/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(form),
      });
      if (r.ok) { toast.success('Espace ambulancier créé !'); await loadMe(); }
      else toast.error('Échec de l\'inscription');
    } catch { toast.error('Erreur réseau'); }
    finally { setSaving(false); }
  };

  const toggleOnline = async () => {
    const next = !online;
    if (next && !approved) { toast.error('Votre compte doit être validé avant de passer en ligne'); return; }
    const pos = next ? await getPos() : null;
    try {
      const r = await fetch(`${API}/api/ambulance/operator/online`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ online: next, ...(pos || {}) }),
      });
      if (r.ok) { setOnline(next); toast.success(next ? 'Vous êtes en ligne' : 'Vous êtes hors ligne'); refresh(); }
      else { const d = await r.json().catch(() => ({})); toast.error(d.detail || 'Erreur'); }
    } catch { toast.error('Erreur réseau'); }
  };

  const accept = async (id) => {
    try {
      const r = await fetch(`${API}/api/ambulance/requests/${id}/accept`, { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (r.ok) { toast.success('Demande acceptée !'); setActive(d); setFeed([]); }
      else toast.error(d.detail || 'Demande indisponible');
    } catch { toast.error('Erreur réseau'); }
  };

  const setStatus = async (status) => {
    try {
      const r = await fetch(`${API}/api/ambulance/requests/${active.id}/operator-status`, {
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
      const r = await fetch(`${API}/api/ambulance/requests/${active.id}/operator-ping`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(pos),
      });
      const d = await r.json();
      if (r.ok) toast.success(`Position partagée · ETA ${d.eta_minutes} min`);
    } catch { toast.error('Erreur réseau'); }
  };

  if (loading) {
    return <div className="mobile-container min-h-screen flex items-center justify-center text-gray-400" data-testid="amb-operator-loading">Chargement…</div>;
  }

  // ── Registration ──
  if (!profile) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50" data-testid="amb-operator-register">
        <div className="bg-red-600 px-4 pt-4 pb-6 flex items-center gap-3">
          <button onClick={() => navigate('/urgences')} className="text-white" data-testid="back-btn"><ArrowLeft size={22} /></button>
          <div className="flex items-center gap-2 text-white">
            <Ambulance size={24} weight="fill" />
            <h1 className="text-lg font-bold">Devenir ambulancier partenaire</h1>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-500">Inscrivez-vous pour recevoir des demandes d'urgence en temps réel et intervenir près de chez vous.</p>
          {[
            { k: 'company', l: 'Nom de la société / service', ph: 'Ex : SOS Ambulances' },
            { k: 'phone', l: 'Téléphone', ph: '+33…' },
            { k: 'plate', l: 'Plaque du véhicule', ph: 'AB-123-CD' },
            { k: 'vehicle_type', l: 'Type de véhicule', ph: 'VSAV, ambulance médicalisée…' },
            { k: 'city', l: 'Ville / zone', ph: 'Paris' },
          ].map((f) => (
            <div key={f.k} className="bg-white rounded-2xl p-3">
              <label className="text-xs font-semibold text-gray-500">{f.l}</label>
              <input value={form[f.k]} onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} placeholder={f.ph}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm mt-1" data-testid={`amb-operator-${f.k}`} />
            </div>
          ))}
          <button onClick={register} disabled={saving} className="w-full bg-red-600 text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-60" data-testid="amb-operator-register-btn">
            {saving ? 'Création…' : 'Créer mon espace ambulancier'}
          </button>
        </div>
      </div>
    );
  }

  // ── Dashboard ──
  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="amb-operator-dashboard">
      <div className="bg-red-600 px-4 pt-4 pb-5">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/urgences')} className="text-white" data-testid="back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold text-white flex-1">Espace ambulancier</h1>
          <button onClick={toggleOnline} data-testid="amb-operator-online-toggle"
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${online ? 'bg-green-400 text-green-900' : 'bg-white/20 text-white'}`}>
            <Power size={14} weight="bold" /> {online ? 'En ligne' : 'Hors ligne'}
          </button>
        </div>
        <p className="text-sm text-white/85">{profile.company}</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3" data-testid="amb-operator-stats">
          <div className="bg-white rounded-2xl p-3 text-center">
            <CheckCircle size={20} className="mx-auto text-green-500 mb-1" weight="fill" />
            <p className="text-lg font-black text-gray-900">{stats?.completed ?? 0}</p>
            <p className="text-[10px] text-gray-500">Terminées</p>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center">
            <ClipboardText size={20} className="mx-auto text-red-500 mb-1" weight="fill" />
            <p className="text-lg font-black text-gray-900">{stats?.active ?? 0}</p>
            <p className="text-[10px] text-gray-500">En cours</p>
          </div>
          <div className="bg-white rounded-2xl p-3 text-center">
            <Wallet size={20} className="mx-auto text-amber-500 mb-1" weight="fill" />
            <p className="text-lg font-black text-gray-900">{money(Number(stats?.earnings ?? 0))}</p>
            <p className="text-[10px] text-gray-500">Gains</p>
          </div>
        </div>

        {/* Verification banner */}
        {!approved && (
          <div className={`rounded-2xl p-4 ${vstatus === 'rejected' ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`} data-testid="amb-operator-verification-banner">
            <p className={`text-sm font-bold ${vstatus === 'rejected' ? 'text-red-700' : 'text-amber-700'}`}>
              {vstatus === 'rejected' ? '❌ Compte refusé' : '⏳ Validation en attente'}
            </p>
            <p className="text-xs text-gray-600 mt-1">
              {vstatus === 'rejected'
                ? (profile.rejection_reason || 'Vos documents n\'ont pas été validés. Merci de les renvoyer.')
                : 'Envoyez vos documents (assurance, agrément/licence, pièce d\'identité). Un administrateur les validera avant que vous puissiez passer en ligne.'}
            </p>
          </div>
        )}

        {/* Documents KYC */}
        <div className="bg-white rounded-2xl p-4 space-y-2.5" data-testid="amb-operator-documents">
          <p className="text-[10px] tracking-wide uppercase font-bold text-gray-500">Documents</p>
          {[
            { k: 'insurance', l: 'Assurance' },
            { k: 'license', l: 'Agrément / licence' },
            { k: 'id_card', l: 'Pièce d\'identité' },
          ].map((d) => (
            <div key={d.k} className="flex items-center justify-between">
              <span className="text-sm text-gray-700 flex items-center gap-2">
                {documents[d.k] ? <CheckCircle size={16} weight="fill" className="text-green-500" /> : <ClipboardText size={16} className="text-gray-300" />}
                {d.l}
              </span>
              <label className="text-xs font-semibold text-red-600 cursor-pointer" data-testid={`amb-upload-${d.k}`}>
                {uploading === d.k ? 'Envoi…' : documents[d.k] ? 'Remplacer' : 'Téléverser'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadDoc(d.k, e.target.files)} />
              </label>
            </div>
          ))}
        </div>

        {/* Commission info */}
        <div className="bg-red-50 rounded-2xl p-3 flex items-center justify-between" data-testid="amb-operator-commission-info">
          <span className="text-xs text-red-700">Commission plateforme</span>
          <span className="text-sm font-bold text-red-700">{Math.round(commissionPct * 100)}%</span>
        </div>

        {/* Active job */}
        {active ? (
          <div className="bg-white rounded-2xl p-4 space-y-3" data-testid="amb-operator-active-job">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Intervention en cours</h2>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-50 text-red-600">{active.status === 'arrived' ? 'Sur place' : 'En route'}</span>
            </div>
            <AmbulanceMap pickup={{ lat: active.pickup_lat, lng: active.pickup_lng }} ambulance={active.ambulance_position} height={200} />
            <div className="text-sm space-y-1">
              <p className="font-semibold text-gray-900">{active.emergency_label}</p>
              <p className="text-gray-500 flex items-center gap-1"><MapPin size={13} /> {active.pickup_address || 'Position patient'}</p>
              <p className="text-gray-500">Patient : {active.patient_name || active.user_name}{active.patient_phone ? ` · ${active.patient_phone}` : ''}</p>
              {active.symptoms && <p className="text-gray-500">Symptômes : {active.symptoms}</p>}
              <p className="font-bold text-gray-900">{money(Number(active.total_price))}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={sharePosition} className="flex items-center justify-center gap-1.5 border border-red-300 text-red-600 py-2.5 rounded-xl text-sm font-semibold" data-testid="amb-operator-share-position">
                <Crosshair size={15} /> Partager position
              </button>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${active.pickup_lat},${active.pickup_lng}`} target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-1.5 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-semibold" data-testid="amb-operator-navigate">
                <NavigationArrow size={15} weight="fill" /> Naviguer
              </a>
            </div>
            {active.status !== 'arrived' && (
              <button onClick={() => setStatus('arrived')} className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold text-sm" data-testid="amb-operator-mark-arrived">
                Je suis sur place
              </button>
            )}
            {active.status === 'arrived' && (
              <p className="text-center text-xs text-gray-400">En attente de la confirmation de fin par le patient.</p>
            )}
          </div>
        ) : online ? (
          <div data-testid="amb-operator-feed">
            <p className="text-sm font-bold text-gray-700 mb-2">Demandes d'urgence à proximité</p>
            {feed.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center text-sm text-gray-400" data-testid="amb-operator-feed-empty">
                Aucune demande pour le moment. Vous serez notifié dès qu'une urgence arrive.
              </div>
            ) : feed.map((req) => (
              <div key={req.id} className="bg-white rounded-2xl p-4 mb-3 border border-gray-100" data-testid={`amb-operator-request-${req.id}`}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{req.emergency_label}</p>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><MapPin size={12} /> {req.pickup_address || 'Position patient'}</p>
                    {req.distance_km != null && <p className="text-[11px] text-red-600 font-semibold mt-0.5">à {req.distance_km} km</p>}
                  </div>
                  <span className="font-bold text-gray-900 text-sm">{money(Number(req.total_price))}</span>
                </div>
                <button onClick={() => accept(req.id)} className="w-full mt-3 bg-red-600 text-white py-2.5 rounded-xl font-semibold text-sm" data-testid={`amb-operator-accept-${req.id}`}>
                  Accepter
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 text-center" data-testid="amb-operator-offline">
            <Power size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">Passez <b>en ligne</b> pour recevoir des demandes d'urgence.</p>
          </div>
        )}

        {/* Profile rating */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
          <Star size={13} weight="fill" className="text-amber-400" /> Note {profile.rating?.toFixed?.(1) ?? profile.rating} · {profile.plate} · {profile.vehicle_type}
        </div>
      </div>
    </div>
  );
};

export default AmbulanceOperatorPage;
