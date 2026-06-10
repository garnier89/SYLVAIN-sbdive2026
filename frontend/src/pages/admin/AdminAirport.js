/**
 * AdminAirport — Gestion des aéroports (transferts) + tableau de bord des réservations.
 * - CRUD aéroports : nom, code IATA, position, rayon, point de RDV terminal,
 *   attente gratuite (min), frais bagages, remise navette partagée.
 * - Dashboard : réservations aéroport en cours/terminées avec suivi de vol (Flight Watch).
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { AirplaneTilt, Trash, Plus, FloppyDisk, MapPin } from '@phosphor-icons/react';
import { airportAdminAPI } from '../../services/api';
import { playAlert } from '../../lib/driverAlert';

const BLANK = {
  name: '', code: '', lat: '', lng: '', radius_km: 4,
  meeting_point: 'Hall des arrivées, niveau 0', free_wait_minutes: 45,
  luggage_fee: 5, shuttle_discount_pct: 30, waiting_rate_per_min: 0.5, active: true,
};

const FLIGHT_BADGE = {
  on_time: 'bg-emerald-100 text-emerald-700',
  delayed: 'bg-amber-100 text-amber-700',
  early: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
};

const flightLabel = (fs) => {
  if (!fs) return '—';
  if (fs.status === 'delayed') return `Retard ${fs.delay_minutes} min`;
  if (fs.status === 'early') return `Avance ${Math.abs(fs.delay_minutes)} min`;
  if (fs.status === 'cancelled') return 'Annulé';
  return 'À l\'heure';
};

const AdminAirport = () => {
  const [tab, setTab] = useState('reservations');
  const [airports, setAirports] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [editingId, setEditingId] = useState(null);
  const [resv, setResv] = useState({ reservations: [], counts: {} });
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const prevStatusRef = useRef({});   // rideId -> last seen flight status
  const seededRef = useRef(false);     // skip alerting on the very first load

  const loadAirports = useCallback(() => {
    airportAdminAPI.list().then((r) => setAirports(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);
  const loadResv = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    airportAdminAPI.reservations()
      .then((r) => {
        const data = r.data || { reservations: [], counts: {} };
        // Detect flights that just turned delayed/cancelled and alert dispatchers.
        const prev = prevStatusRef.current;
        const next = {};
        const alerts = [];
        (data.reservations || []).forEach((x) => {
          const st = x.flight_status?.status || null;
          next[x.id] = st;
          if (seededRef.current && (st === 'delayed' || st === 'cancelled') && prev[x.id] !== st) {
            alerts.push({ st, fn: x.flight_number, delay: x.flight_status?.delay_minutes });
          }
        });
        prevStatusRef.current = next;
        if (alerts.length) {
          playAlert();
          alerts.forEach((a) => toast.warning(
            a.st === 'cancelled' ? `✈️ Vol ${a.fn || ''} ANNULÉ` : `✈️ Vol ${a.fn || ''} retardé de ${a.delay} min`,
            { description: 'Course aéroport — anticipez la prise en charge.', duration: 8000 },
          ));
        }
        seededRef.current = true;
        setResv(data); setLastUpdated(new Date());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadAirports(); loadResv(); }, [loadAirports, loadResv]);

  // Live Flight Watch — auto-refresh the reservations every 30s while the tab is open.
  // (The backend flight_watch_loop keeps each flight status synced server-side.)
  useEffect(() => {
    if (tab !== 'reservations') return undefined;
    const id = setInterval(() => loadResv(true), 30000);
    return () => clearInterval(id);
  }, [tab, loadResv]);

  const submit = async () => {
    if (!form.name || form.lat === '' || form.lng === '') return toast.error('Nom et coordonnées requis');
    const payload = {
      ...form, lat: parseFloat(form.lat), lng: parseFloat(form.lng),
      radius_km: parseFloat(form.radius_km), free_wait_minutes: parseInt(form.free_wait_minutes, 10),
      luggage_fee: parseFloat(form.luggage_fee), shuttle_discount_pct: parseFloat(form.shuttle_discount_pct),
      waiting_rate_per_min: parseFloat(form.waiting_rate_per_min),
    };
    try {
      if (editingId) { await airportAdminAPI.update(editingId, payload); toast.success('Aéroport mis à jour'); }
      else { await airportAdminAPI.create(payload); toast.success('Aéroport créé'); }
      setForm(BLANK); setEditingId(null); loadAirports();
    } catch { toast.error('Échec de l\'enregistrement'); }
  };

  const edit = (a) => {
    setEditingId(a.id);
    setForm({
      name: a.name || '', code: a.code || '', lat: a.lat, lng: a.lng, radius_km: a.radius_km ?? 4,
      meeting_point: a.meeting_point || '', free_wait_minutes: a.free_wait_minutes ?? 45,
      luggage_fee: a.luggage_fee ?? 5, shuttle_discount_pct: a.shuttle_discount_pct ?? 30,
      waiting_rate_per_min: a.waiting_rate_per_min ?? 0.5, active: a.active !== false,
    });
    setTab('airports');
  };

  const remove = async (id) => {
    if (!window.confirm('Supprimer cet aéroport ?')) return;
    try { await airportAdminAPI.remove(id); toast.success('Supprimé'); loadAirports(); } catch { toast.error('Échec'); }
  };

  const counts = resv.counts || {};

  return (
    <div className="p-4 max-w-5xl mx-auto" data-testid="admin-airport-page">
      <div className="flex items-center gap-2 mb-4">
        <AirplaneTilt size={26} weight="fill" className="text-[#0EA5E9]" />
        <h1 className="text-xl font-black text-[#0B1426]">Transferts Aéroport</h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { k: 'active', l: 'En cours', c: 'text-[#FF5000]' },
          { k: 'completed', l: 'Terminées', c: 'text-emerald-600' },
          { k: 'delayed', l: 'Vols retardés', c: 'text-amber-600' },
          { k: 'cancelled_flights', l: 'Vols annulés', c: 'text-red-600' },
        ].map((x) => (
          <div key={x.k} className="bg-white rounded-xl border border-gray-100 p-3 text-center" data-testid={`airport-kpi-${x.k}`}>
            <p className={`text-2xl font-black ${x.c}`}>{counts[x.k] ?? 0}</p>
            <p className="text-[11px] text-gray-500 font-semibold">{x.l}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[{ k: 'reservations', l: 'Réservations' }, { k: 'airports', l: 'Aéroports' }].map((tb) => (
          <button key={tb.k} onClick={() => setTab(tb.k)} data-testid={`airport-tab-${tb.k}`}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${tab === tb.k ? 'bg-[#0B1426] text-white' : 'bg-gray-100 text-gray-600'}`}>{tb.l}</button>
        ))}
      </div>

      {tab === 'reservations' && (
        <div data-testid="airport-reservations">
          <div className="flex justify-end items-center gap-2 mb-2" data-testid="airport-live-indicator">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="text-xs font-semibold text-emerald-700">En direct · MAJ auto 30s{lastUpdated ? ` · ${lastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</span>
          </div>
          {loading ? <p className="text-sm text-gray-400">Chargement…</p>
            : resv.reservations.length === 0 ? <p className="text-sm text-gray-400" data-testid="airport-resv-empty">Aucune réservation aéroport.</p>
            : (
            <div className="space-y-2">
              {resv.reservations.map((r) => (
                <div key={r.id} className="bg-white rounded-xl border border-gray-100 p-3" data-testid={`airport-resv-${r.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-black text-[#0B1426] text-sm">
                      <AirplaneTilt size={16} weight="fill" className="text-[#0EA5E9]" /> {r.flight_number || '—'}
                      <span className="text-xs text-gray-400">#{r.booking_no}</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      {r.flight_status?.status && (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${FLIGHT_BADGE[r.flight_status.status] || ''}`} data-testid={`airport-resv-flight-${r.id}`}>{flightLabel(r.flight_status)}</span>
                      )}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{r.status}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">{r.pickup_address} → {r.dropoff_address}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500 mt-1">
                    {r.airport_name && <span>{r.airport_name}</span>}
                    {r.airport_terminal && <span>· {r.airport_terminal}</span>}
                    {r.luggage_assist && <span className="text-sky-600">· 🧳 bagages</span>}
                    {r.shared_shuttle && <span className="text-emerald-600">· navette</span>}
                    <span className="font-bold text-[#0B1426]">· {(r.final_fare ?? r.estimated_fare ?? 0).toFixed(2)} €</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'airports' && (
        <div data-testid="airport-management">
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
            <h3 className="font-bold text-[#0B1426] mb-3 text-sm">{editingId ? 'Modifier l\'aéroport' : 'Nouvel aéroport'}</h3>
            <div className="grid grid-cols-2 gap-2">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nom de l'aéroport" className="border border-gray-200 rounded-lg px-3 py-2 text-sm col-span-2" data-testid="airport-form-name" />
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Code (ex: FDF)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="airport-form-code" />
              <input value={form.radius_km} onChange={(e) => setForm({ ...form, radius_km: e.target.value })} type="number" placeholder="Rayon (km)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="airport-form-radius" />
              <input value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} type="number" placeholder="Latitude" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="airport-form-lat" />
              <input value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} type="number" placeholder="Longitude" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" data-testid="airport-form-lng" />
              <input value={form.meeting_point} onChange={(e) => setForm({ ...form, meeting_point: e.target.value })} placeholder="Point de rendez-vous (terminal)" className="border border-gray-200 rounded-lg px-3 py-2 text-sm col-span-2" data-testid="airport-form-meeting" />
              <label className="text-[11px] text-gray-500">Attente gratuite (min)
                <input value={form.free_wait_minutes} onChange={(e) => setForm({ ...form, free_wait_minutes: e.target.value })} type="number" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full mt-0.5" data-testid="airport-form-freewait" />
              </label>
              <label className="text-[11px] text-gray-500">Frais bagages (€)
                <input value={form.luggage_fee} onChange={(e) => setForm({ ...form, luggage_fee: e.target.value })} type="number" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full mt-0.5" data-testid="airport-form-luggage" />
              </label>
              <label className="text-[11px] text-gray-500">Remise navette (%)
                <input value={form.shuttle_discount_pct} onChange={(e) => setForm({ ...form, shuttle_discount_pct: e.target.value })} type="number" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full mt-0.5" data-testid="airport-form-shuttle" />
              </label>
              <label className="text-[11px] text-gray-500">Tarif attente (€/min)
                <input value={form.waiting_rate_per_min} onChange={(e) => setForm({ ...form, waiting_rate_per_min: e.target.value })} type="number" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full mt-0.5" data-testid="airport-form-waitrate" />
              </label>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={submit} className="flex items-center gap-1.5 bg-[#FF5000] text-white px-4 py-2 rounded-lg text-sm font-bold" data-testid="airport-form-save">
                {editingId ? <FloppyDisk size={16} /> : <Plus size={16} />} {editingId ? 'Enregistrer' : 'Ajouter'}
              </button>
              {editingId && <button onClick={() => { setForm(BLANK); setEditingId(null); }} className="px-4 py-2 rounded-lg text-sm font-bold bg-gray-100 text-gray-600">Annuler</button>}
            </div>
          </div>

          <div className="space-y-2">
            {airports.length === 0 ? <p className="text-sm text-gray-400" data-testid="airport-list-empty">Aucun aéroport configuré.</p>
              : airports.map((a) => (
              <div key={a.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between" data-testid={`airport-item-${a.id}`}>
                <div className="min-w-0">
                  <p className="font-bold text-[#0B1426] text-sm">{a.name} {a.code ? <span className="text-xs text-gray-400">({a.code})</span> : null}</p>
                  <p className="text-[11px] text-gray-500 flex items-center gap-1"><MapPin size={12} /> {a.meeting_point}</p>
                  <p className="text-[11px] text-gray-400">{a.free_wait_minutes} min offertes · bagages {a.luggage_fee}€ · navette -{a.shuttle_discount_pct}%</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => edit(a)} className="text-xs font-bold text-[#0EA5E9]" data-testid={`airport-edit-${a.id}`}>Modifier</button>
                  <button onClick={() => remove(a.id)} className="text-red-500" data-testid={`airport-delete-${a.id}`}><Trash size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAirport;
