import React, { useEffect, useState, useCallback } from 'react';
import {
  Timer, ArrowClockwise, Warning, CheckCircle, CarProfile, Flag,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { adminAPI } from '../../services/api';
import DateRangePicker from '../../components/admin/DateRangePicker';

const isoDay = (d) => d.toISOString().slice(0, 10);
const initialRange = () => ({
  date_from: isoDay(new Date(Date.now() - 30 * 86400000)),
  date_to: isoDay(new Date()),
});
const mm = (m) => (m == null ? '—' : `${m} min`);

const FLAG_LABEL = {
  'accepté_pas_de_déplacement': { t: 'Accepté, pas de déplacement', c: 'bg-rose-50 text-rose-600 border-rose-100' },
  'annulé_sans_déplacement': { t: 'Annulé sans déplacement', c: 'bg-rose-50 text-rose-600 border-rose-100' },
  'attente_longue_avant_départ': { t: 'Attente longue avant départ', c: 'bg-amber-50 text-amber-600 border-amber-100' },
  'annulé_par_chauffeur': { t: 'Annulé par chauffeur', c: 'bg-orange-50 text-orange-600 border-orange-100' },
};

const KpiCard = ({ icon: Icon, label, value, accent, testid }) => (
  <div className="bg-white rounded-2xl border border-gray-100 p-4" data-testid={testid}>
    <div className={`w-9 h-9 rounded-xl ${accent} flex items-center justify-center mb-2`}>
      <Icon size={18} weight="fill" className="text-white" />
    </div>
    <p className="text-2xl font-black text-gray-900 leading-none">{value}</p>
    <p className="text-xs text-gray-500 mt-1">{label}</p>
  </div>
);

const AdminTripTimings = () => {
  const [range, setRange] = useState(initialRange);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((r, flagged) => {
    setLoading(true);
    adminAPI.tripTimings({ ...r, only_flagged: flagged }).then((res) => setData(res.data)).catch(() => toast.error('Chargement impossible')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(range, onlyFlagged); }, [range, onlyFlagged, load]);

  const s = data?.summary || {};
  return (
    <div className="p-6 max-w-6xl" data-testid="admin-trip-timings">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Timer size={22} className="text-amber-600" weight="fill" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Timing des trajets</h1>
            <p className="text-sm text-gray-500">Détail accept → arrivée → départ → fin · détection fraude (accepte mais ne bouge pas)</p>
          </div>
        </div>
        <button onClick={() => load(range, onlyFlagged)} data-testid="timings-refresh" className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
          <ArrowClockwise size={18} />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <DateRangePicker value={range} onChange={setRange} accent="amber" testid="timings-range" />
        <label className="flex items-center gap-2 text-sm text-gray-600 ml-auto">
          <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} data-testid="timings-only-flagged" className="w-4 h-4 accent-rose-600" />
          Anomalies seulement
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-amber-200 border-t-amber-500 rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard icon={CarProfile} label="Trajets" value={s.rides ?? 0} accent="bg-sky-500" testid="kpi-rides" />
            <KpiCard icon={Flag} label="Anomalies" value={s.flagged ?? 0} accent={s.flagged ? 'bg-rose-500' : 'bg-emerald-500'} testid="kpi-flagged" />
            <KpiCard icon={Timer} label="Temps moyen d'approche" value={mm(s.avg_go_minutes)} accent="bg-indigo-500" testid="kpi-avg-go" />
            <KpiCard icon={Timer} label="Attente moyenne sur place" value={mm(s.avg_wait_minutes)} accent="bg-violet-500" testid="kpi-avg-wait" />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5 overflow-x-auto" data-testid="timings-table">
            {(data?.rides || []).length === 0 ? <p className="text-sm text-gray-400">Aucun trajet sur la période.</p> : (
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-100">
                    <th className="py-2 pr-3">Chauffeur</th>
                    <th className="py-2 pr-3">Trajet</th>
                    <th className="py-2 pr-3 text-right">Approche</th>
                    <th className="py-2 pr-3 text-right">Attente</th>
                    <th className="py-2 pr-3 text-right">Durée</th>
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2">Statut / Anomalie</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rides.map((r, i) => (
                    <tr key={r.ride_id} className={`border-b border-gray-50 last:border-0 ${r.flags.length ? 'bg-rose-50/30' : ''}`} data-testid={`timing-row-${i}`}>
                      <td className="py-2.5 pr-3 font-semibold text-gray-800">{r.driver_name}</td>
                      <td className="py-2.5 pr-3 text-[11px] text-gray-400 max-w-[200px] truncate">{r.pickup} → {r.dropoff}</td>
                      <td className="py-2.5 pr-3 text-right text-gray-600">{mm(r.go_minutes)}</td>
                      <td className={`py-2.5 pr-3 text-right ${r.wait_minutes >= 4 ? 'text-amber-600 font-bold' : 'text-gray-600'}`}>{mm(r.wait_minutes)}</td>
                      <td className="py-2.5 pr-3 text-right text-gray-600">{mm(r.trip_minutes)}</td>
                      <td className="py-2.5 pr-3 text-right text-gray-700 font-semibold">{mm(r.total_minutes)}</td>
                      <td className="py-2.5">
                        {r.flags.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle size={13} weight="fill" /> {r.status}</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.flags.map((f) => (
                              <span key={f} className={`px-2 py-0.5 rounded text-[10px] border inline-flex items-center gap-1 ${(FLAG_LABEL[f] || {}).c || 'bg-gray-50 text-gray-500'}`}>
                                <Warning size={10} weight="fill" /> {(FLAG_LABEL[f] || {}).t || f}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-3">Seuils : attente &gt; {data?.thresholds?.wait_flag_min} min · accepté sans déplacement &gt; {data?.thresholds?.nomove_flag_min} min.</p>
        </>
      )}
    </div>
  );
};

export default AdminTripTimings;
