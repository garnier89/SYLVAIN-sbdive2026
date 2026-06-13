import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Ticket, CalendarBlank, MapPin, Car, CheckCircle, XCircle } from '@phosphor-icons/react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { eventsAPI } from '../../../services/api';
import { catMeta, fmtEventDate, fmtPrice, TRANSPORT_CHOICES } from './eventsShared';

const STATUS_META = {
  valid: { label: 'Valide', cls: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle },
  used: { label: 'Utilisé', cls: 'bg-gray-100 text-gray-500', Icon: CheckCircle },
  cancelled: { label: 'Annulé', cls: 'bg-red-50 text-red-600', Icon: XCircle },
};

const MyEventTicketsPage = () => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    eventsAPI.myTickets()
      .then((r) => setTickets(r.data.tickets || []))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const cancel = async (t) => {
    try {
      const r = await eventsAPI.cancelTicket(t.id);
      toast.success(`Annulé • ${fmtPrice(r.data.refunded)} remboursés sur SB Pay`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Annulation impossible');
    }
  };

  const bookTransport = (snap) => {
    try {
      sessionStorage.setItem('sb_taxi_dest', JSON.stringify({
        address: `${snap.venue_name}, ${snap.address || snap.city}`, lat: snap.lat, lng: snap.lng,
      }));
    } catch { /* ignore */ }
    navigate('/taxi');
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-28" data-testid="my-tickets-page">
      <div className="sticky top-0 z-30 bg-[#B91C1C] px-4 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => navigate('/events')} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={18} className="text-white" />
        </button>
        <h1 className="text-lg font-bold text-white flex-1">Mes billets</h1>
        <Ticket size={20} weight="fill" className="text-white" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-orange-200 border-t-[#B91C1C] rounded-full animate-spin" /></div>
      ) : tickets.length === 0 ? (
        <div className="px-4 mt-16 text-center text-gray-500" data-testid="tickets-empty">
          <Ticket size={40} className="mx-auto mb-3 text-gray-300" weight="duotone" />
          <p className="text-sm">Aucun billet pour le moment</p>
          <button onClick={() => navigate('/events')} className="mt-4 bg-[#B91C1C] text-white font-bold text-sm px-5 py-2.5 rounded-full" data-testid="discover-btn">Découvrir des événements</button>
        </div>
      ) : (
        <div className="px-4 mt-4 space-y-4">
          {tickets.map((t) => {
            const snap = t.event_snapshot || {};
            const m = catMeta(snap.category);
            const sm = STATUS_META[t.status] || STATUS_META.valid;
            const transportLabel = TRANSPORT_CHOICES.find((c) => c.key === t.transport_option)?.label;
            const showTransport = ['one_way', 'round_trip', 'private_driver'].includes(t.transport_option) && t.status === 'valid';
            const canCancel = t.status === 'valid' && (!snap.starts_at || snap.starts_at > new Date().toISOString());
            return (
              <div key={t.id} className="bg-white rounded-2xl overflow-hidden shadow-sm" data-testid={`ticket-${t.id}`}>
                <div className="flex">
                  <div className="w-24 shrink-0 bg-gray-100">{snap.image && <img src={snap.image} alt={snap.title} className="w-full h-full object-cover" />}</div>
                  <div className="p-3 flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${m.bg} ${m.color}`}><m.Icon size={11} weight="fill" /> {m.label}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${sm.cls}`}><sm.Icon size={11} weight="fill" /> {sm.label}</span>
                    </div>
                    <p className="font-bold text-sm text-gray-900 mt-1 line-clamp-1">{snap.title}</p>
                    <p className="text-[11px] text-gray-500 flex items-center gap-1"><CalendarBlank size={12} /> {fmtEventDate(snap.starts_at)}</p>
                    <p className="text-[11px] text-gray-500 flex items-center gap-1 line-clamp-1"><MapPin size={12} /> {snap.venue_name}</p>
                    <p className="text-[11px] text-gray-700 font-semibold mt-0.5">{t.tier_name} × {t.quantity} • {fmtPrice(t.total_price)}</p>
                  </div>
                </div>
                {/* QR */}
                <div className="border-t border-dashed flex items-center gap-3 p-3">
                  <div className="bg-white p-1 rounded-lg border">
                    <QRCodeSVG value={t.qr_token} size={64} data-testid={`qr-${t.id}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-gray-400">Présentez ce QR à l'entrée</p>
                    <p className="text-[10px] font-mono text-gray-500 truncate">{t.qr_token}</p>
                    {transportLabel && t.transport_option !== 'none' && <p className="text-[10px] text-gray-400 mt-0.5">Transport : {transportLabel}</p>}
                  </div>
                </div>
                {(showTransport || canCancel) && (
                  <div className="flex gap-2 px-3 pb-3">
                    {showTransport && (
                      <button onClick={() => bookTransport(snap)} className="flex-1 flex items-center justify-center gap-1.5 bg-[#FF4500] text-white text-xs font-bold py-2.5 rounded-xl" data-testid={`transport-${t.id}`}>
                        <Car size={15} weight="fill" /> Y aller en SB Drive
                      </button>
                    )}
                    {canCancel && (
                      <button onClick={() => cancel(t)} className="flex-1 border border-gray-200 text-gray-600 text-xs font-bold py-2.5 rounded-xl" data-testid={`cancel-${t.id}`}>
                        Annuler & rembourser
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyEventTicketsPage;
