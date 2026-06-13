import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CalendarBlank, MapPin, Minus, Plus, Ticket, CheckCircle,
  Car, X, Buildings,
} from '@phosphor-icons/react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { eventsAPI } from '../../../services/api';
import { catMeta, fmtEventDate, fmtPrice, TRANSPORT_CHOICES } from './eventsShared';

const EventDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ev, setEv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tierId, setTierId] = useState(null);
  const [qty, setQty] = useState(1);
  const [step, setStep] = useState(null); // null | 'transport' | 'pay' | 'success'
  const [transport, setTransport] = useState('none');
  const [paying, setPaying] = useState(false);
  const [ticket, setTicket] = useState(null);

  useEffect(() => {
    eventsAPI.get(id)
      .then((r) => { setEv(r.data); setTierId((r.data.tiers || [])[0]?.id || null); })
      .catch(() => toast.error('Événement introuvable'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="min-h-screen flex justify-center items-center bg-gray-50"><div className="w-8 h-8 border-2 border-orange-200 border-t-[#B91C1C] rounded-full animate-spin" /></div>;
  if (!ev) return null;

  const m = catMeta(ev.category);
  const tier = (ev.tiers || []).find((t) => t.id === tierId);
  const total = tier ? Number(tier.price) * qty : 0;
  const remaining = tier ? tier.quantity_total - tier.quantity_sold : 0;

  const doPurchase = async () => {
    setPaying(true);
    try {
      const r = await eventsAPI.purchase(ev.id, { tier_id: tierId, quantity: qty, transport_option: transport });
      setTicket(r.data.ticket);
      setStep('success');
      if (r.data.cashback > 0) toast.success(`Billet confirmé • +${r.data.cashback.toFixed(2)} € cashback`);
      else toast.success('Billet confirmé');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Paiement échoué');
    } finally { setPaying(false); }
  };

  const bookTransport = () => {
    try {
      sessionStorage.setItem('sb_taxi_dest', JSON.stringify({
        address: `${ev.venue_name}, ${ev.address || ev.city}`, lat: ev.lat, lng: ev.lng,
      }));
    } catch { /* ignore */ }
    navigate('/taxi');
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-28" data-testid="event-detail-page">
      <div className="relative h-56 bg-gray-200">
        {ev.image && <img src={ev.image} alt={ev.title} className="w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <button onClick={() => navigate('/events')} className="absolute top-4 left-4 w-9 h-9 rounded-full bg-black/40 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={18} className="text-white" />
        </button>
        <div className="absolute bottom-3 left-4 right-4">
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white ${m.color}`}><m.Icon size={11} weight="fill" /> {m.label}</span>
          <h1 className="text-xl font-extrabold text-white mt-1.5 leading-tight">{ev.title}</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-2xl p-4 space-y-2">
          <p className="flex items-center gap-2 text-sm text-gray-700"><CalendarBlank size={16} className="text-[#B91C1C]" /> {fmtEventDate(ev.starts_at)}</p>
          <p className="flex items-start gap-2 text-sm text-gray-700"><MapPin size={16} className="text-[#B91C1C] mt-0.5" /> {ev.venue_name}, {ev.address || ev.city}</p>
          {ev.organizer_name && <p className="flex items-center gap-2 text-xs text-gray-400"><Buildings size={14} /> Organisé par {ev.organizer_name}</p>}
        </div>

        {ev.description && <p className="text-sm text-gray-600 leading-relaxed">{ev.description}</p>}

        {/* Ticket tiers */}
        <div>
          <h2 className="text-sm font-bold text-gray-900 mb-2">Billets</h2>
          <div className="space-y-2">
            {(ev.tiers || []).map((t) => {
              const left = t.quantity_total - t.quantity_sold;
              const sel = t.id === tierId;
              return (
                <button key={t.id} disabled={left <= 0} onClick={() => { setTierId(t.id); setQty(1); }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border-2 text-left transition-colors disabled:opacity-50 ${sel ? 'border-[#B91C1C] bg-red-50/40' : 'border-gray-200 bg-white'}`}
                  data-testid={`tier-${t.id}`}>
                  <div>
                    <p className="font-bold text-sm text-gray-900">{t.name}</p>
                    <p className="text-[11px] text-gray-400">{left > 0 ? `${left} disponibles` : 'Complet'}</p>
                  </div>
                  <p className="font-extrabold text-[#B91C1C]">{fmtPrice(t.price)}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sticky buy bar */}
      {tier && remaining > 0 && step === null && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] z-40 bg-white border-t px-4 py-3 flex items-center gap-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]" data-testid="buy-bar">
          <div className="flex items-center gap-2 bg-gray-100 rounded-full px-1">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-8 h-8 rounded-full flex items-center justify-center" data-testid="qty-minus"><Minus size={14} /></button>
            <span className="w-5 text-center font-bold text-sm" data-testid="qty-value">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(10, remaining, q + 1))} className="w-8 h-8 rounded-full flex items-center justify-center" data-testid="qty-plus"><Plus size={14} /></button>
          </div>
          <button onClick={() => setStep('transport')} className="flex-1 flex items-center justify-center gap-2 bg-[#B91C1C] text-white font-extrabold py-3 rounded-2xl" data-testid="reserve-btn">
            <Ticket size={18} weight="fill" /> Réserver • {fmtPrice(total)}
          </button>
        </div>
      )}

      {/* Transport step */}
      {step === 'transport' && (
        <Sheet onClose={() => setStep(null)} title="Ajouter un transport ?" testid="transport-sheet">
          <p className="text-xs text-gray-500 mb-3">SB Drive peut vous emmener à l'événement.</p>
          <div className="space-y-2">
            {TRANSPORT_CHOICES.map((c) => (
              <button key={c.key} disabled={c.disabled} onClick={() => setTransport(c.key)}
                className={`w-full flex items-center justify-between p-3 rounded-xl border-2 text-left disabled:opacity-50 ${transport === c.key ? 'border-[#FF4500] bg-orange-50/40' : 'border-gray-200'}`}
                data-testid={`transport-${c.key}`}>
                <div><p className="font-bold text-sm">{c.label}</p><p className="text-[11px] text-gray-400">{c.desc}</p></div>
                {transport === c.key && <CheckCircle size={20} weight="fill" className="text-[#FF4500]" />}
              </button>
            ))}
          </div>
          <button onClick={() => setStep('pay')} className="w-full mt-4 bg-[#1F2430] text-white font-bold py-3 rounded-2xl" data-testid="transport-continue">Continuer</button>
        </Sheet>
      )}

      {/* Pay step */}
      {step === 'pay' && (
        <Sheet onClose={() => setStep('transport')} title="Paiement SB Pay" testid="pay-sheet">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <Row label={`${tier.name} × ${qty}`} value={fmtPrice(total)} />
            <Row label="Transport" value={TRANSPORT_CHOICES.find((c) => c.key === transport)?.label || 'Aucun'} />
            <div className="border-t pt-2 flex justify-between font-extrabold text-base"><span>Total</span><span className="text-[#B91C1C]">{fmtPrice(total)}</span></div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">Débité de votre portefeuille SB Pay.</p>
          <button onClick={doPurchase} disabled={paying} className="w-full mt-4 bg-[#B91C1C] text-white font-extrabold py-3.5 rounded-2xl disabled:opacity-60" data-testid="pay-btn">
            {paying ? 'Paiement...' : `Payer ${fmtPrice(total)} avec SB Pay`}
          </button>
        </Sheet>
      )}

      {/* Success */}
      {step === 'success' && ticket && (
        <Sheet onClose={() => navigate('/my-tickets')} title="Billet confirmé 🎟️" testid="success-sheet">
          <div className="flex flex-col items-center">
            <CheckCircle size={44} weight="fill" className="text-emerald-500 mb-2" />
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-2xl p-4 flex flex-col items-center">
              <QRCodeSVG value={ticket.qr_token} size={150} data-testid="ticket-qr" />
              <p className="text-[10px] text-gray-400 mt-2 font-mono">{ticket.qr_token}</p>
            </div>
            <p className="text-sm text-gray-700 mt-3 font-bold">{ev.title}</p>
            <p className="text-xs text-gray-400">{ticket.tier_name} × {ticket.quantity}</p>
          </div>
          {['one_way', 'round_trip', 'private_driver'].includes(ticket.transport_option) && (
            <button onClick={bookTransport} className="w-full mt-4 flex items-center justify-center gap-2 bg-[#FF4500] text-white font-extrabold py-3.5 rounded-2xl" data-testid="book-transport-btn">
              <Car size={20} weight="fill" /> Réserver mon chauffeur SB Drive
            </button>
          )}
          <button onClick={() => navigate('/my-tickets')} className="w-full mt-2 text-sm font-bold text-gray-600 py-2" data-testid="goto-tickets-btn">Voir mes billets</button>
        </Sheet>
      )}
    </div>
  );
};

const Row = ({ label, value }) => (
  <div className="flex justify-between text-gray-600"><span>{label}</span><span className="font-semibold text-gray-900">{value}</span></div>
);

const Sheet = ({ title, onClose, children, testid }) => (
  <div className="fixed inset-0 z-50 flex items-end" data-testid={testid}>
    <div className="absolute inset-0 bg-black/50" onClick={onClose} />
    <div className="relative w-full max-w-[480px] mx-auto bg-white rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-extrabold text-gray-900">{title}</h3>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="sheet-close"><X size={16} /></button>
      </div>
      {children}
    </div>
  </div>
);

export default EventDetailPage;
