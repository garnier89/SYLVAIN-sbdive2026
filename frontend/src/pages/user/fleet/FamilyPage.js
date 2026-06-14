import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, X, Copy, Trash, MapPinLine, BellRinging, Siren, Broadcast, BatteryHigh, Sparkle, UserPlus, CaretRight } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { familyAPI } from '../../../services/api';
import FamilyMap from './FamilyMap';
import { fmtAgo } from './fleetShared';

const FamilyPage = () => {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [places, setPlaces] = useState([]);
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [sharing, setSharing] = useState(false);
  const watchId = useRef(null);

  const load = useCallback(() => {
    familyAPI.members().then((r) => setMembers(r.data.members || [])).catch(() => {}).finally(() => setLoading(false));
    familyAPI.context().then((r) => setCtx(r.data)).catch(() => {});
  }, []);
  useEffect(() => {
    load(); familyAPI.places().then((r) => setPlaces(r.data.places || [])).catch(() => {});
    const t = setInterval(load, 5000);
    return () => { clearInterval(t); if (watchId.current) navigator.geolocation.clearWatch(watchId.current); };
  }, [load]);

  const center = members.find((m) => m.live?.lat != null)?.live || ctx?.circle?.center;

  const seed = async () => { try { await familyAPI.seedDemo(); toast.success('Démo : 2 proches localisés'); load(); familyAPI.places().then((r) => setPlaces(r.data.places || [])); } catch { toast.error('Erreur'); } };

  const addMember = async () => {
    if (!form.name.trim()) { toast.error('Nom requis'); return; }
    try { await familyAPI.addMember(form); toast.success('Proche ajouté'); setForm(null); load(); } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
  };
  const removeMember = async (m) => { if (!window.confirm(`Retirer « ${m.name} » ?`)) return; try { await familyAPI.deleteMember(m.id); load(); } catch { toast.error('Erreur'); } };
  const copy = async (c) => { try { await navigator.clipboard.writeText(c); toast.success(`Code ${c} copié`); } catch { toast.error('Copie indisponible'); } };

  const toggleShare = async () => {
    if (sharing) {
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null; setSharing(false); toast('Partage arrêté'); return;
    }
    if (!navigator.geolocation) { toast.error('Géolocalisation indisponible'); return; }
    if (!members.some((m) => m.is_self)) {
      try { await familyAPI.addMember({ name: 'Moi', relation: 'Moi', is_self: true }); load(); } catch { /* noop */ }
    }
    watchId.current = navigator.geolocation.watchPosition(
      (p) => { familyAPI.sharePing({ lat: p.coords.latitude, lng: p.coords.longitude, speed: (p.coords.speed || 0) * 3.6 }).catch(() => {}); },
      () => { toast.error('Position refusée'); setSharing(false); },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    setSharing(true); toast.success('Vous partagez votre position');
  };

  const sos = () => {
    const send = (lat, lng) => familyAPI.sos({ lat, lng }).then(() => toast.success('🆘 SOS envoyé à votre famille')).catch(() => toast.error('Erreur'));
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => send(p.coords.latitude, p.coords.longitude), () => send());
    else send();
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="family-page">
      <div className="px-4 pt-4 pb-5 rounded-b-3xl text-white" style={{ background: 'linear-gradient(135deg,#be185d,#db2777,#f43f5e)' }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/sb-tracking')} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
          <div className="flex-1"><h1 className="text-lg font-extrabold">Famille</h1><p className="text-[11px] text-white/70">Localisez et protégez vos proches</p></div>
          <button onClick={() => navigate('/famille/rejoindre')} className="text-[11px] font-bold bg-white/15 px-2.5 py-1.5 rounded-full" data-testid="join-link">Rejoindre</button>
        </div>
        <div className="flex gap-2">
          <button onClick={toggleShare} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl text-sm font-bold ${sharing ? 'bg-white text-pink-700' : 'bg-white/15 text-white'}`} data-testid="share-toggle">
            <Broadcast size={16} weight="fill" /> {sharing ? 'Partage actif' : 'Partager ma position'}
          </button>
          <button onClick={sos} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-extrabold bg-red-600 text-white" data-testid="sos-btn"><Siren size={16} weight="fill" /> SOS</button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {loading ? <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-pink-200 border-t-pink-500 rounded-full animate-spin" /></div>
          : members.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-gray-500" data-testid="no-members">
              <UserPlus size={36} className="mx-auto mb-2 text-gray-300" weight="duotone" />
              <p className="text-sm">Aucun proche. Ajoutez un membre ou activez la démo.</p>
              <div className="flex gap-2 justify-center mt-4">
                <button onClick={() => setForm({ name: '', relation: 'Proche' })} className="bg-pink-600 text-white font-bold text-sm px-4 py-2 rounded-full" data-testid="add-first-member">Ajouter un proche</button>
                <button onClick={seed} className="border border-pink-200 text-pink-600 font-bold text-sm px-4 py-2 rounded-full flex items-center gap-1" data-testid="seed-demo-btn"><Sparkle size={13} weight="fill" /> Démo</button>
              </div>
            </div>
          ) : (
            <>
              <FamilyMap center={center} members={members} places={places} height={300} />

              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => navigate('/famille/lieux')} className="bg-white rounded-2xl p-3 flex items-center gap-2 shadow-sm" data-testid="places-shortcut"><MapPinLine size={20} weight="fill" className="text-emerald-600" /><div className="text-left"><p className="font-bold text-sm">Lieux</p><p className="text-[10px] text-gray-400">{ctx?.counts?.places || 0} zone(s)</p></div></button>
                <button onClick={() => navigate('/famille/alertes')} className="bg-white rounded-2xl p-3 flex items-center gap-2 shadow-sm relative" data-testid="alerts-shortcut"><BellRinging size={20} weight="fill" className="text-rose-600" /><div className="text-left"><p className="font-bold text-sm">Alertes</p><p className="text-[10px] text-gray-400">{ctx?.counts?.unread_alerts || 0} non lue(s)</p></div>{ctx?.counts?.unread_alerts ? <span className="absolute top-2 right-2 bg-red-500 text-white text-[9px] font-bold min-w-4 h-4 px-1 rounded-full flex items-center justify-center">{ctx.counts.unread_alerts}</span> : null}</button>
              </div>

              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900">Mes proches</h2>
                <button onClick={() => setForm({ name: '', relation: 'Proche' })} className="text-xs font-bold text-pink-600 flex items-center gap-1" data-testid="add-member-btn"><Plus size={13} weight="bold" /> Ajouter</button>
              </div>
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm" data-testid={`member-${m.id}`}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shrink-0" style={{ background: m.color }}>{(m.name || '?')[0].toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-gray-900 truncate">{m.name} <span className="text-[10px] text-gray-400 font-normal">{m.relation}</span></p>
                      <p className="text-[11px] flex items-center gap-2">
                        <span className={`font-bold ${m.live?.status === 'online' ? 'text-emerald-600' : 'text-gray-400'}`}>{m.live?.status === 'online' ? 'En ligne' : 'Hors ligne'}</span>
                        {m.live?.battery != null && <span className="text-gray-400 flex items-center gap-0.5"><BatteryHigh size={11} /> {Math.round(m.live.battery)}%</span>}
                        <span className="text-gray-300">{fmtAgo(m.live?.ts)}</span>
                      </p>
                      {!m.linked && !m.is_self && <button onClick={() => copy(m.invite_code)} className="text-[10px] font-mono text-pink-600 mt-0.5 flex items-center gap-1" data-testid={`code-${m.id}`}>Code : {m.invite_code} <Copy size={10} /></button>}
                    </div>
                    <button onClick={() => removeMember(m)} className="text-red-400" data-testid={`del-member-${m.id}`}><Trash size={15} /></button>
                  </div>
                ))}
              </div>
            </>
          )}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" data-testid="member-form">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4"><h2 className="font-bold">Nouveau proche</h2><button onClick={() => setForm(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X size={16} /></button></div>
            <div className="space-y-3">
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-500" placeholder="Nom (ex. Maman, Léa...)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="m-name" />
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-500" placeholder="Relation (ex. Mère, Enfant...)" value={form.relation} onChange={(e) => setForm({ ...form, relation: e.target.value })} data-testid="m-relation" />
              <p className="text-[11px] text-gray-400">Un code d'invitation sera généré : votre proche le saisit dans « Rejoindre » pour partager sa position.</p>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setForm(null)} className="flex-1 border border-gray-300 font-bold py-2.5 rounded-lg">Annuler</button>
              <button onClick={addMember} className="flex-1 bg-pink-600 text-white font-bold py-2.5 rounded-lg" data-testid="save-member-btn">Ajouter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FamilyPage;
