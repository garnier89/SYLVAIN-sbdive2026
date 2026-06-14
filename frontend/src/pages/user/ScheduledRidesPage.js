/**
 * ScheduledRidesPage — V3Cube Pack A
 * Lists user's upcoming scheduled rides with reschedule & cancel actions.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Calendar, MapPin, Pencil, X, Clock, AirplaneTilt, Star, CheckCircle, MagnifyingGlass } from '@phosphor-icons/react';
import { Button } from '../../components/ui/button';

const API = process.env.REACT_APP_BACKEND_URL;

// N° de réservation lisible (sans le préfixe 'ride_'), aligné sur le backend.
const refOf = (id) => (String(id || '').split('_').pop() || '').slice(0, 8).toUpperCase();
const statusOf = (r) => {
  if (r.status === 'accepted') return { label: 'Chauffeur confirmé', cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle };
  if (r.status === 'arriving') return { label: 'Chauffeur en route', cls: 'bg-blue-100 text-blue-700', icon: Clock };
  if (r.status === 'in_progress') return { label: 'Course démarrée', cls: 'bg-indigo-100 text-indigo-700', icon: Clock };
  return { label: 'En attente d\'un chauffeur', cls: 'bg-amber-100 text-amber-700', icon: MagnifyingGlass };
};

const ScheduledRidesPage = () => {
  const navigate = useNavigate();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [newAt, setNewAt] = useState('');
  const [newFlight, setNewFlight] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/rides/scheduled/list`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        setRides(d.items || []);
      }
    } catch (e) {
      console.warn('scheduled rides load failed:', e?.message || e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cancel = async (id) => {
    if (!window.confirm('Annuler cette course planifiée ?')) return;
    try {
      const r = await fetch(`${API}/api/rides/${id}/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Annulation côté client' }),
      });
      if (r.ok) {
        toast.success('Course annulée');
        load();
      } else {
        toast.error('Annulation impossible');
      }
    } catch (e) {
      toast.error('Erreur réseau');
    }
  };

  const saveReschedule = async (id, isAirport) => {
    if (!newAt) return;
    try {
      const payload = { scheduled_at: newAt };
      if (isAirport) payload.flight_number = (newFlight || '').trim().toUpperCase() || null;
      const r = await fetch(`${API}/api/rides/${id}/reschedule`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        toast.success(isAirport && payload.flight_number ? 'Course replanifiée — nouveau vol suivi ✈️' : 'Course replanifiée');
        setEditingId(null);
        setNewAt('');
        setNewFlight('');
        load();
      } else {
        toast.error('Replanification impossible');
      }
    } catch (e) {
      toast.error('Erreur réseau');
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  // Suggest a new pickup ~24h after the original (datetime-local format) for a quick reschedule.
  const suggestReschedule = (iso) => {
    const base = iso ? new Date(iso) : new Date();
    const d = new Date(base.getTime() + 24 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-20" data-testid="scheduled-rides-page">
      <div className="bg-gradient-to-br from-[#0B1426] to-[#1E293B] text-white px-4 pt-12 pb-6 rounded-b-3xl">
        <button onClick={() => navigate(-1)} className="mb-3" data-testid="sched-back">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold">Mes courses planifiées</h1>
        <p className="text-xs text-gray-400 mt-1">Réservations à venir</p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {loading && (
          <div className="text-center text-gray-400 py-12 animate-pulse">Chargement...</div>
        )}
        {!loading && rides.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <Calendar size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-600 font-medium">Aucune course planifiée</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">
              Planifiez une course pour plus tard ou un trajet aéroport.
            </p>
            <Button onClick={() => navigate('/taxi-advanced?mode=scheduled')} data-testid="empty-cta-schedule">
              Planifier une course
            </Button>
          </div>
        )}
        {rides.map((r) => (
          <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm" data-testid={`scheduled-ride-${r.id}`}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center">
                  <Clock size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">{formatDate(r.scheduled_at)}</p>
                  <p className="text-[11px] text-gray-500 capitalize">
                    {r.ride_type || 'instant'} · {r.vehicle_type}
                  </p>
                </div>
              </div>
              <p className="font-bold text-gray-900">{r.estimated_fare?.toFixed(2)} €</p>
            </div>

            {r.ride_type === 'airport' && r.flight_number && (
              <div className="ml-11 mb-2 inline-flex items-center gap-1.5 rounded-full bg-sky-50 border border-sky-100 px-2.5 py-1" data-testid={`scheduled-flight-${r.id}`}>
                <AirplaneTilt size={13} weight="fill" className="text-[#0EA5E9]" />
                <span className="text-[11px] font-bold text-sky-800">Vol {r.flight_number}{r.airport_terminal ? ` · ${r.airport_terminal}` : ''}</span>
                {r.flight_status?.status && (
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                    r.flight_status.status === 'delayed' ? 'bg-amber-100 text-amber-700'
                    : r.flight_status.status === 'cancelled' ? 'bg-red-100 text-red-700'
                    : r.flight_status.status === 'early' ? 'bg-blue-100 text-blue-700'
                    : 'bg-emerald-100 text-emerald-700'}`}>
                    {r.flight_status.status === 'delayed' ? `+${r.flight_status.delay_minutes}min`
                      : r.flight_status.status === 'cancelled' ? 'Annulé'
                      : r.flight_status.status === 'early' ? `${r.flight_status.delay_minutes}min` : 'OK'}
                  </span>
                )}
              </div>
            )}

            {r.ride_type === 'airport' && r.flight_status?.status === 'cancelled' && !r.rescheduled_at && editingId !== r.id && (
              <div className="ml-11 mb-2 rounded-lg bg-red-50 border border-red-200 p-2.5" data-testid={`flight-cancelled-banner-${r.id}`}>
                <p className="text-[12px] text-red-700 font-semibold mb-1.5 leading-snug">
                  ✈️ Vol {r.flight_number} annulé. Reportez votre course plutôt que de l'annuler — gardez votre chauffeur.
                </p>
                <button
                  className="w-full py-2 rounded-lg bg-[#FF5000] text-white text-sm font-bold flex items-center justify-center gap-1.5"
                  onClick={() => { setEditingId(r.id); setNewAt(suggestReschedule(r.scheduled_at)); setNewFlight(r.flight_number || ''); }}
                  data-testid={`reschedule-flight-${r.id}`}
                >
                  <Calendar size={14} weight="fill" /> Reporter ma course
                </button>
              </div>
            )}

            <div className="space-y-1 text-xs text-gray-600 ml-11">
              <div className="flex items-start gap-1">
                <MapPin size={12} className="text-emerald-600 mt-0.5" />
                <span className="truncate">{r.pickup_address}</span>
              </div>
              <div className="flex items-start gap-1">
                <MapPin size={12} className="text-red-600 mt-0.5" />
                <span className="truncate">{r.dropoff_address}</span>
              </div>
            </div>

            {/* Statut + n° de réservation + chauffeur confirmé */}
            <div className="mt-3 ml-11">
              {(() => {
                const st = statusOf(r);
                const Icon = st.icon;
                return (
                  <div className="flex items-center gap-2 flex-wrap" data-testid={`sched-status-${r.id}`}>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${st.cls}`}>
                      <Icon size={12} weight="fill" /> {st.label}
                    </span>
                    <span className="text-[11px] font-mono font-bold text-gray-500" data-testid={`sched-ref-${r.id}`}>
                      Réf. #{refOf(r.id)}
                    </span>
                  </div>
                );
              })()}
              {r.status === 'accepted' && r.driver_name && (
                <div className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 p-2" data-testid={`sched-driver-${r.id}`}>
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-sm">
                    {(r.driver_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{r.driver_name}</p>
                    <p className="text-[11px] text-gray-500 flex items-center gap-1">
                      {r.driver_rating != null && (<><Star size={11} weight="fill" className="text-amber-400" /> {Number(r.driver_rating).toFixed(1)} · </>)}
                      {r.driver_vehicle_model || 'Véhicule'}{r.driver_vehicle_number ? ` · ${r.driver_vehicle_number}` : ''}
                    </p>
                  </div>
                </div>
              )}
              {r.status === 'pending' && (
                <p className="mt-1.5 text-[11px] text-gray-400">Vous serez notifié dès qu'un chauffeur accepte votre réservation.</p>
              )}
            </div>

            {editingId === r.id ? (
              <div className="mt-3 space-y-2">
                {r.ride_type === 'airport' && (
                  <div data-testid={`reschedule-flight-row-${r.id}`}>
                    <label className="text-[11px] font-semibold text-gray-500 flex items-center gap-1 mb-1">
                      <AirplaneTilt size={13} weight="fill" className="text-[#0EA5E9]" /> Nouveau n° de vol (suivi auto)
                    </label>
                    <input
                      type="text"
                      value={newFlight}
                      onChange={(e) => setNewFlight(e.target.value)}
                      placeholder="ex: AF1234"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      data-testid={`reschedule-flight-input-${r.id}`}
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    value={newAt}
                    onChange={(e) => setNewAt(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    min={new Date().toISOString().slice(0, 16)}
                    data-testid={`reschedule-input-${r.id}`}
                  />
                  <Button size="sm" onClick={() => saveReschedule(r.id, r.ride_type === 'airport')} data-testid={`reschedule-save-${r.id}`}>
                    Sauver
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setNewAt(''); setNewFlight(''); }}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 flex items-center justify-center gap-1"
                  onClick={() => { setEditingId(r.id); setNewAt(r.scheduled_at?.slice(0, 16) || ''); setNewFlight(r.flight_number || ''); }}
                  data-testid={`reschedule-btn-${r.id}`}
                >
                  <Pencil size={14} /> Modifier
                </button>
                <button
                  className="flex-1 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-600 flex items-center justify-center gap-1"
                  onClick={() => cancel(r.id)}
                  data-testid={`cancel-btn-${r.id}`}
                >
                  <X size={14} /> Annuler
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScheduledRidesPage;
