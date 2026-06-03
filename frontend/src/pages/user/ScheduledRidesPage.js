/**
 * ScheduledRidesPage — V3Cube Pack A
 * Lists user's upcoming scheduled rides with reschedule & cancel actions.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Calendar, MapPin, Pencil, X, Clock } from '@phosphor-icons/react';
import { Button } from '../../components/ui/button';

const API = process.env.REACT_APP_BACKEND_URL;

const ScheduledRidesPage = () => {
  const navigate = useNavigate();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [newAt, setNewAt] = useState('');

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

  const saveReschedule = async (id) => {
    if (!newAt) return;
    try {
      const r = await fetch(`${API}/api/rides/${id}/reschedule`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at: newAt }),
      });
      if (r.ok) {
        toast.success('Course replanifiée');
        setEditingId(null);
        setNewAt('');
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

            {editingId === r.id ? (
              <div className="mt-3 flex gap-2">
                <input
                  type="datetime-local"
                  value={newAt}
                  onChange={(e) => setNewAt(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  min={new Date().toISOString().slice(0, 16)}
                  data-testid={`reschedule-input-${r.id}`}
                />
                <Button size="sm" onClick={() => saveReschedule(r.id)} data-testid={`reschedule-save-${r.id}`}>
                  Sauver
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setNewAt(''); }}>
                  Annuler
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  className="flex-1 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 flex items-center justify-center gap-1"
                  onClick={() => { setEditingId(r.id); setNewAt(r.scheduled_at?.slice(0, 16) || ''); }}
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
