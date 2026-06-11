/**
 * SbCampusSharePage — student carpool (Campus Share).
 * The student declares an origin → campus destination + time; the app finds other
 * students heading the same way (same dest zone, ±30min) to share the ride (pool).
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CaretLeft, UsersThree, MapPin, ShieldCheck, Sparkle } from '@phosphor-icons/react';
import { studentAPI } from '../../services/api';

const BRAND = '#5B21B6';

const SbCampusSharePage = () => {
  const navigate = useNavigate();
  const [zones, setZones] = useState([]);
  const [form, setForm] = useState({ origin_label: '', origin_lat: '', origin_lng: '', dest_zone: '' });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    studentAPI.campusZones().then((r) => setZones(r.data.zones || [])).catch(() => {});
    studentAPI.shareMatches().then((r) => { if (r.data.request) setResult(r.data); }).catch(() => {});
  }, []);

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error('Géolocalisation indisponible');
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm((f) => ({ ...f, origin_lat: pos.coords.latitude.toFixed(6), origin_lng: pos.coords.longitude.toFixed(6), origin_label: f.origin_label || 'Ma position' })),
      () => toast.error('Impossible de récupérer la position'),
    );
  };

  const submit = async () => {
    const z = zones.find((x) => x.id === form.dest_zone);
    if (!z) return toast.error('Choisissez un campus de destination');
    if (form.origin_lat === '' || form.origin_lng === '') return toast.error('Indiquez votre point de départ');
    setBusy(true);
    try {
      const r = await studentAPI.shareRequest({
        origin_lat: Number(form.origin_lat), origin_lng: Number(form.origin_lng), origin_label: form.origin_label || 'Départ',
        dest_lat: z.lat, dest_lng: z.lng, dest_label: z.name,
      });
      setResult(r.data);
      toast.success(r.data.match_count > 0 ? `${r.data.match_count} étudiant(s) vont dans la même direction !` : 'Demande enregistrée. On vous notifiera dès qu\'un étudiant partage ce trajet.');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
    finally { setBusy(false); }
  };

  const cancel = async () => { try { await studentAPI.shareCancel(); setResult(null); toast.success('Demande annulée'); } catch { toast.error('Échec'); } };
  const bookPool = () => {
    const z = zones.find((x) => x.id === form.dest_zone) || (result?.request ? { name: result.request.dest_label } : null);
    toast.success('Réservation en covoiturage');
    navigate('/course?mode=pool');
  };

  const selectedZone = zones.find((x) => x.id === form.dest_zone);

  return (
    <div className="mobile-container min-h-screen bg-[#F5F3FF] pb-16" data-testid="sb-campus-share-page">
      <div className="text-white px-4 pt-6 pb-6 rounded-b-3xl" style={{ background: `linear-gradient(135deg, ${BRAND}, #7C3AED)` }}>
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center mb-3" data-testid="share-back-btn"><CaretLeft size={20} /></button>
        <div className="flex items-center gap-2"><UsersThree size={24} weight="fill" /><h1 className="text-xl font-black">Campus Share</h1></div>
        <p className="text-white/80 text-sm mt-1">Partagez votre trajet avec d'autres étudiants et réduisez le coût.</p>
      </div>

      <div className="px-4 -mt-3 space-y-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3" data-testid="share-form">
          <div>
            <label className="text-xs font-bold text-gray-500">Départ</label>
            <input value={form.origin_label} onChange={(e) => setForm({ ...form, origin_label: e.target.value })} placeholder="Ex. Résidence Universitaire" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="share-origin-label" />
            <button onClick={useMyLocation} className="mt-1 text-xs font-semibold flex items-center gap-1" style={{ color: BRAND }} data-testid="share-use-location"><MapPin size={14} /> Utiliser ma position {form.origin_lat && '✓'}</button>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500">Campus de destination</label>
            <select value={form.dest_zone} onChange={(e) => setForm({ ...form, dest_zone: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1" data-testid="share-dest-zone">
              <option value="">— Choisir —</option>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <button onClick={submit} disabled={busy} className="w-full py-2.5 rounded-xl font-bold text-white disabled:opacity-50" style={{ background: BRAND }} data-testid="share-submit">
            {busy ? 'Recherche…' : 'Trouver des étudiants'}
          </button>
        </div>

        {/* Safe meeting points of selected campus */}
        {selectedZone && (selectedZone.safe_meeting_points || []).length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm" data-testid="share-safe-points">
            <p className="font-bold text-gray-900 text-sm flex items-center gap-1 mb-2"><ShieldCheck size={16} className="text-emerald-600" /> Points de rencontre sécurisés</p>
            {selectedZone.safe_meeting_points.map((p, i) => <p key={i} className="text-xs text-gray-600 flex items-center gap-1.5"><MapPin size={12} className="text-emerald-500" />{p.label}</p>)}
          </div>
        )}

        {/* Matches */}
        {result && (
          <div className="bg-white rounded-2xl p-4 shadow-sm" data-testid="share-result">
            <div className="flex items-center gap-2 mb-1"><Sparkle size={18} weight="fill" className="text-amber-500" /><p className="font-bold text-gray-900">{result.match_count} étudiant(s) dans la même direction</p></div>
            {(result.matches || []).map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm text-gray-600 py-1 border-t border-gray-50" data-testid={`share-match-${m.id}`}>
                <span>{m.user_name} · {m.origin_label}</span>
                <span className="text-xs text-gray-400">{m.depart_at ? new Date(m.depart_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>
            ))}
            <div className="flex gap-2 mt-3">
              <button onClick={bookPool} className="flex-1 py-2 rounded-lg text-sm font-bold text-white" style={{ background: BRAND }} data-testid="share-book-pool">Réserver en covoiturage</button>
              <button onClick={cancel} className="px-3 py-2 rounded-lg text-xs font-bold bg-gray-100 text-gray-500" data-testid="share-cancel">Annuler</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SbCampusSharePage;
