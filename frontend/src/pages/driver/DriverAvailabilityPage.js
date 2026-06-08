import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretLeft, Clock, MapPin, FloppyDisk, WarningCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { driverAPI } from '../../services/api';

const DAYS = [
  { k: 'mon', label: 'Lundi' }, { k: 'tue', label: 'Mardi' }, { k: 'wed', label: 'Mercredi' },
  { k: 'thu', label: 'Jeudi' }, { k: 'fri', label: 'Vendredi' }, { k: 'sat', label: 'Samedi' }, { k: 'sun', label: 'Dimanche' },
];

const DriverAvailabilityPage = () => {
  const navigate = useNavigate();
  const [avail, setAvail] = useState(null);
  const [workAddress, setWorkAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    driverAPI.getAvailability()
      .then((r) => { setAvail(r.data.availability); setWorkAddress(r.data.work_address || ''); })
      .catch(() => toast.error('Impossible de charger vos disponibilités'))
      .finally(() => setLoading(false));
  }, []);

  const setDay = (k, patch) => setAvail((a) => ({ ...a, [k]: { ...a[k], ...patch } }));

  // Weekly recap: total planned hours + active days (live from the editor state).
  const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const activeDays = avail ? DAYS.filter(({ k }) => avail[k]?.enabled) : [];
  const weeklyMinutes = activeDays.reduce((sum, { k }) => sum + Math.max(0, toMin(avail[k].end) - toMin(avail[k].start)), 0);
  const weeklyHours = Math.floor(weeklyMinutes / 60);
  const weeklyMins = weeklyMinutes % 60;
  const noActiveSlot = avail && activeDays.length === 0;

  const save = async () => {
    setSaving(true);
    try {
      await driverAPI.updateAvailability({ availability: avail, work_address: workAddress });
      toast.success('Disponibilités enregistrées');
    } catch {
      toast.error('Échec de l\'enregistrement');
    } finally { setSaving(false); }
  };

  return (
    <div className="mobile-container min-h-screen bg-[#F2F2F7] pb-28" data-testid="driver-availability-page">
      <div className="bg-[#0B1426] text-white px-4 pt-6 pb-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center" data-testid="availability-back-btn"><CaretLeft size={20} /></button>
        <div>
          <h1 className="text-lg font-bold">Ma disponibilité</h1>
          <p className="text-xs text-white/60">Définissez vos jours et heures de travail</p>
        </div>
      </div>

      {loading ? <div className="p-6 text-gray-400 text-sm">Chargement…</div> : (
        <div className="p-4 space-y-3">
          {/* Weekly recap */}
          <div className="bg-gradient-to-br from-[#0B1426] to-[#1a2740] text-white rounded-2xl p-4" data-testid="availability-recap">
            <p className="text-[11px] uppercase tracking-wider text-white/50 font-bold mb-1">Heures prévues cette semaine</p>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-black" data-testid="weekly-hours-value">{weeklyHours}h{weeklyMins > 0 ? String(weeklyMins).padStart(2, '0') : ''}</p>
              <p className="text-xs text-white/60 mb-1.5">sur {activeDays.length} jour{activeDays.length > 1 ? 's' : ''} actif{activeDays.length > 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* No active slot reminder */}
          {noActiveSlot && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-2.5" data-testid="no-slot-reminder">
              <WarningCircle size={20} weight="fill" className="text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-800">Aucun créneau actif</p>
                <p className="text-xs text-amber-700 leading-snug">Activez au moins un jour pour recevoir des courses et maximiser vos revenus.</p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl p-4">
            <label className="flex items-center gap-2 text-sm font-bold text-[#0B1426] mb-2"><MapPin size={18} className="text-[#EF4444]" /> Lieu de travail (base)</label>
            <input value={workAddress} onChange={(e) => setWorkAddress(e.target.value)} placeholder="Ex. Fort-de-France, Martinique"
              className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-[#FF5000] outline-none" data-testid="work-address-input" />
          </div>

          {avail && DAYS.map(({ k, label }) => {
            const d = avail[k] || { enabled: false, start: '08:00', end: '20:00' };
            return (
              <div key={k} className="bg-white rounded-2xl p-4" data-testid={`avail-day-${k}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#0B1426]">{label}</span>
                  <button onClick={() => setDay(k, { enabled: !d.enabled })} className={`w-11 h-6 rounded-full relative transition-colors ${d.enabled ? 'bg-[#FF5000]' : 'bg-gray-300'}`} data-testid={`avail-toggle-${k}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${d.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </div>
                {d.enabled && (
                  <div className="flex items-center gap-2 mt-3">
                    <Clock size={16} className="text-gray-400" />
                    <input type="time" value={d.start} onChange={(e) => setDay(k, { start: e.target.value })} className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm" data-testid={`avail-start-${k}`} />
                    <span className="text-gray-400 text-sm">à</span>
                    <input type="time" value={d.end} onChange={(e) => setDay(k, { end: e.target.value })} className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm" data-testid={`avail-end-${k}`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-white border-t border-gray-100 p-4">
        <button onClick={save} disabled={saving || loading} className="w-full py-3.5 rounded-xl font-black flex items-center justify-center gap-2 disabled:opacity-50" style={{ backgroundColor: '#FF5000', color: '#0B1426' }} data-testid="availability-save-btn">
          <FloppyDisk size={20} weight="fill" /> {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
};

export default DriverAvailabilityPage;
