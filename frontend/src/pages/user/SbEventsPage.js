/**
 * SbEventsPage — student events + shuttle reservations.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CaretLeft, Confetti, MapPin, Bus, CalendarBlank } from '@phosphor-icons/react';
import { studentAPI } from '../../services/api';

const BRAND = '#5B21B6';
const TYPE_LABEL = { party: 'Soirée', university: 'Universitaire', festival: 'Festival' };

const SbEventsPage = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [mine, setMine] = useState([]);
  const [busy, setBusy] = useState('');

  const load = () => {
    studentAPI.eventsList().then((r) => setEvents(r.data.events || [])).catch(() => {});
    studentAPI.eventsMyReservations().then((r) => setMine(r.data.reservations || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const reserved = (eventId) => mine.find((m) => m.event_id === eventId && m.status === 'confirmed');

  const reserve = async (ev) => {
    setBusy(ev.id);
    try { await studentAPI.eventReserve({ event_id: ev.id, seats: 1 }); toast.success('Navette réservée 🎉'); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
    finally { setBusy(''); }
  };
  const cancel = async (resId) => { try { await studentAPI.eventCancelReservation(resId); toast.success('Réservation annulée'); load(); } catch { toast.error('Échec'); } };

  return (
    <div className="mobile-container min-h-screen bg-[#F5F3FF] pb-16" data-testid="sb-events-page">
      <div className="text-white px-4 pt-6 pb-6 rounded-b-3xl" style={{ background: `linear-gradient(135deg, ${BRAND}, #7C3AED)` }}>
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center mb-3" data-testid="events-back-btn"><CaretLeft size={20} /></button>
        <div className="flex items-center gap-2"><Confetti size={24} weight="fill" /><h1 className="text-xl font-black">Événements étudiants</h1></div>
        <p className="text-white/80 text-sm mt-1">Soirées, festivals et navettes vers les événements.</p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {events.length === 0 && <p className="text-gray-400 text-sm text-center py-8">Aucun événement à venir.</p>}
        {events.map((ev) => {
          const res = reserved(ev.id);
          return (
            <div key={ev.id} className="bg-white rounded-2xl p-4 shadow-sm" data-testid={`event-${ev.id}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: BRAND + '15', color: BRAND }}>{TYPE_LABEL[ev.type] || ev.type}</span>
                {ev.date && <span className="text-xs text-gray-400 flex items-center gap-1"><CalendarBlank size={12} />{new Date(ev.date).toLocaleDateString('fr-FR')}</span>}
              </div>
              <p className="font-bold text-gray-900">{ev.title}</p>
              {ev.description && <p className="text-xs text-gray-500 mt-0.5">{ev.description}</p>}
              {ev.location && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><MapPin size={12} />{ev.location}</p>}
              {ev.shuttle_enabled && (
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-gray-700 flex items-center gap-1.5"><Bus size={16} style={{ color: BRAND }} /> Navette {ev.shuttle_price > 0 ? `· ${ev.shuttle_price} €` : '· gratuite'}{ev.seats_left != null && <span className="text-xs text-gray-400"> · {ev.seats_left} places</span>}</span>
                  {res ? (
                    <button onClick={() => cancel(res.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600" data-testid={`event-cancel-${ev.id}`}>Annuler</button>
                  ) : (
                    <button onClick={() => reserve(ev)} disabled={busy === ev.id || ev.seats_left === 0} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40" style={{ background: BRAND }} data-testid={`event-reserve-${ev.id}`}>
                      {ev.seats_left === 0 ? 'Complet' : busy === ev.id ? '…' : 'Réserver'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SbEventsPage;
