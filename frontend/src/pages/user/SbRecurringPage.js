/**
 * SbRecurringPage — manage recurring student trips (daily / weekdays / weekly).
 * "Réserver le prochain" deep-links to the booking screen pre-filled.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CaretLeft, ArrowsClockwise, Plus, Trash, Calendar } from '@phosphor-icons/react';
import { studentAPI } from '../../services/api';

const BRAND = '#5B21B6';
const FREQ = [
  { key: 'weekdays', label: 'En semaine (Lun–Ven)' },
  { key: 'daily', label: 'Tous les jours' },
  { key: 'weekly', label: 'Jours choisis' },
];
const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const SbRecurringPage = () => {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: '', pickup: '', dropoff: '', mode: 'moto', frequency: 'weekdays', time: '08:00', days_of_week: [] });
  const [busy, setBusy] = useState(false);

  const load = () => studentAPI.recurringList().then((r) => setList(r.data.recurring || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.label.trim() || !form.pickup.trim() || !form.dropoff.trim()) return toast.error('Remplissez le libellé, le départ et la destination');
    setBusy(true);
    try {
      await studentAPI.recurringCreate({
        label: form.label, pickup: { address: form.pickup }, dropoff: { address: form.dropoff },
        mode: form.mode, frequency: form.frequency, time: form.time, days_of_week: form.days_of_week,
      });
      toast.success('Trajet récurrent créé');
      setShowForm(false); setForm({ label: '', pickup: '', dropoff: '', mode: 'moto', frequency: 'weekdays', time: '08:00', days_of_week: [] });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
    finally { setBusy(false); }
  };

  const del = async (id) => { if (!window.confirm('Supprimer ce trajet ?')) return; try { await studentAPI.recurringDelete(id); load(); } catch { toast.error('Échec'); } };
  const toggle = async (it) => { try { await studentAPI.recurringUpdate(it.id, { active: !it.active }); load(); } catch { toast.error('Échec'); } };
  const bookNext = async (it) => {
    try {
      const r = await studentAPI.recurringBookNext(it.id);
      const p = r.data.booking_payload;
      try { sessionStorage.setItem('sb_prefill_ride', JSON.stringify(p)); } catch { /* ignore */ }
      toast.success(`Réservation pour le ${new Date(r.data.occurrence_at).toLocaleString('fr-FR')}`);
      navigate(`/course?mode=${encodeURIComponent(it.mode || 'moto')}`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Aucune occurrence à venir'); }
  };
  const toggleDow = (i) => setForm((f) => ({ ...f, days_of_week: f.days_of_week.includes(i) ? f.days_of_week.filter((x) => x !== i) : [...f.days_of_week, i] }));

  return (
    <div className="mobile-container min-h-screen bg-[#F5F3FF] pb-16" data-testid="sb-recurring-page">
      <div className="text-white px-4 pt-6 pb-6 rounded-b-3xl" style={{ background: `linear-gradient(135deg, ${BRAND}, #7C3AED)` }}>
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center mb-3" data-testid="recurring-back-btn"><CaretLeft size={20} /></button>
        <div className="flex items-center gap-2"><ArrowsClockwise size={24} weight="fill" /><h1 className="text-xl font-black">Trajets récurrents</h1></div>
        <p className="text-white/80 text-sm mt-1">Programmez vos trajets quotidiens ou hebdomadaires.</p>
      </div>

      <div className="px-4 -mt-3 space-y-3">
        <button onClick={() => setShowForm((v) => !v)} className="w-full bg-white rounded-2xl p-3 shadow-sm flex items-center gap-2 font-bold text-sm" style={{ color: BRAND }} data-testid="recurring-add-btn">
          <Plus size={18} weight="bold" /> Nouveau trajet récurrent
        </button>

        {showForm && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2" data-testid="recurring-form">
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Libellé (ex. Campus → Résidence)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="recurring-label" />
            <input value={form.pickup} onChange={(e) => setForm({ ...form, pickup: e.target.value })} placeholder="Adresse de départ" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="recurring-pickup" />
            <input value={form.dropoff} onChange={(e) => setForm({ ...form, dropoff: e.target.value })} placeholder="Destination" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="recurring-dropoff" />
            <div className="flex gap-2">
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="recurring-frequency">
                {FREQ.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="recurring-time" />
            </div>
            {form.frequency === 'weekly' && (
              <div className="flex gap-1.5" data-testid="recurring-dow">
                {DOW.map((d, i) => (
                  <button key={i} onClick={() => toggleDow(i)} className={`w-8 h-8 rounded-full text-xs font-bold ${form.days_of_week.includes(i) ? 'text-white' : 'bg-gray-100 text-gray-500'}`} style={form.days_of_week.includes(i) ? { background: BRAND } : {}}>{d}</button>
                ))}
              </div>
            )}
            <button onClick={create} disabled={busy} className="w-full py-2.5 rounded-xl font-bold text-white disabled:opacity-50" style={{ background: BRAND }} data-testid="recurring-save">
              {busy ? 'Création…' : 'Créer'}
            </button>
          </div>
        )}

        {list.length === 0 && !showForm && <p className="text-center text-gray-400 text-sm py-8">Aucun trajet récurrent.</p>}

        {list.map((it) => (
          <div key={it.id} className="bg-white rounded-2xl p-4 shadow-sm" data-testid={`recurring-item-${it.id}`}>
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="font-bold text-gray-900 text-sm truncate">{it.label}</p>
                <p className="text-xs text-gray-500 truncate">{it.pickup?.address} → {it.dropoff?.address}</p>
                <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1"><Calendar size={12} /> {FREQ.find((f) => f.key === it.frequency)?.label} · {it.time}</p>
                {it.next_occurrences?.[0] && <p className="text-[11px] text-violet-600 mt-0.5">Prochain : {new Date(it.next_occurrences[0]).toLocaleString('fr-FR')}</p>}
              </div>
              <button onClick={() => del(it.id)} className="text-gray-300" data-testid={`recurring-del-${it.id}`}><Trash size={18} /></button>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => bookNext(it)} className="flex-1 py-2 rounded-lg text-sm font-bold text-white" style={{ background: BRAND }} data-testid={`recurring-book-${it.id}`}>Réserver le prochain</button>
              <button onClick={() => toggle(it)} className={`px-3 py-2 rounded-lg text-xs font-bold ${it.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`} data-testid={`recurring-toggle-${it.id}`}>{it.active ? 'Actif' : 'Inactif'}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SbRecurringPage;
