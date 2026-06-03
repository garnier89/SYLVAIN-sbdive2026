/**
 * MyServiceBookingsPage — "Mes réservations" : real-time tracking of every
 * service booking with status badges and cancel. Polls every 5s for live status.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, MapPin, Clock, CheckCircle, XCircle, Hourglass, Spinner, CalendarBlank } from '@phosphor-icons/react';
import { servicesAPI } from '../../services/api';

const STATUS_META = {
  pending: { label: 'En attente', color: 'text-amber-700 bg-amber-50', Icon: Hourglass },
  confirmed: { label: 'Confirmé', color: 'text-blue-700 bg-blue-50', Icon: CheckCircle },
  in_progress: { label: 'En cours', color: 'text-indigo-700 bg-indigo-50', Icon: Spinner },
  completed: { label: 'Terminé', color: 'text-emerald-700 bg-emerald-50', Icon: CheckCircle },
  cancelled: { label: 'Annulé', color: 'text-red-700 bg-red-50', Icon: XCircle },
};

const MyServiceBookingsPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const focusId = params.get('focus');
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await servicesAPI.getBookings();
      setBookings(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000); // live status polling
    return () => clearInterval(id);
  }, [load]);

  const cancel = async (id) => {
    try {
      await servicesAPI.cancelBooking(id);
      toast.success('Réservation annulée');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Impossible d'annuler"); }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="my-bookings-page">
      <div className="bg-white px-4 py-3 flex items-center gap-3 border-b border-gray-100 sticky top-0 z-20">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Mes réservations</h1>
      </div>

      <div className="px-4 mt-4">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-gray-200 border-t-[#FFC107] rounded-full animate-spin" /></div>
        ) : bookings.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-10 text-center" data-testid="empty-bookings">
            <CalendarBlank size={36} className="mx-auto mb-3 text-gray-300" weight="duotone" />
            <p className="text-sm text-gray-500">Aucune réservation pour le moment.</p>
            <button onClick={() => navigate('/services-hub')} className="mt-4 px-5 py-2.5 rounded-xl bg-[#0B1426] text-white text-sm font-semibold" data-testid="browse-services-btn">Découvrir les services</button>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => {
              const meta = STATUS_META[b.status] || STATUS_META.pending;
              const SIcon = meta.Icon;
              return (
                <div key={b.id} className={`bg-white rounded-2xl border p-4 ${focusId === b.id ? 'border-[#FFC107] ring-1 ring-[#FFC107]' : 'border-gray-100'}`} data-testid={`booking-${b.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm">{b.service_name}</p>
                      {b.provider_name && <p className="text-[11px] text-gray-500">{b.provider_name}</p>}
                    </div>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${meta.color}`} data-testid={`status-${b.id}`}>
                      <SIcon size={12} weight="fill" /> {meta.label}
                    </span>
                  </div>
                  {b.address && <p className="text-[11px] text-gray-500 mt-2"><MapPin size={11} className="inline mr-0.5 text-gray-400" />{b.address}</p>}
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[11px] text-gray-500 flex items-center gap-1">
                      <Clock size={11} />{b.is_instant ? 'Dès que possible' : `${b.scheduled_date || ''} ${b.scheduled_time || ''}`.trim() || 'Programmé'}
                    </p>
                    <p className="text-lg font-black text-gray-900">{(b.price || 0).toFixed(2)} €</p>
                  </div>
                  {['pending', 'confirmed'].includes(b.status) && (
                    <button onClick={() => cancel(b.id)} className="mt-3 w-full py-2 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50" data-testid={`cancel-${b.id}`}>
                      Annuler la réservation
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyServiceBookingsPage;
