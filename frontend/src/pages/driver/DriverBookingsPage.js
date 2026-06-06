import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { MapPin, CaretDown, Package, Gavel, ClipboardText } from '@phosphor-icons/react';
import { rideAPI, parcelAPI } from '../../services/api';
import { DriverBottomNav } from './DriverProfilePage';

const GREEN = '#00B578';

const ConfirmDialog = ({ open, message, onYes, onNo, busy }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[3000] bg-black/40 flex items-center justify-center p-6" data-testid="booking-confirm-dialog">
      <div className="bg-white rounded-2xl w-full max-w-sm p-5">
        <p className="text-base font-semibold text-gray-800 mb-5">{message}</p>
        <div className="flex justify-end gap-6">
          <button onClick={onNo} className="text-base font-bold text-gray-500" data-testid="booking-confirm-no">Non</button>
          <button onClick={onYes} disabled={busy} className="text-base font-bold text-emerald-600 disabled:opacity-50" data-testid="booking-confirm-yes">Oui</button>
        </div>
      </div>
    </div>
  );
};

const cur = (n) => `${(Number(n) || 0).toFixed(2)} €`;

const BookingCard = ({ ride, badge, badgeColor, children, testId }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3" data-testid={testId}>
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs font-bold text-gray-400">#{(ride.booking_no || ride.id || '').toString().slice(-10)}</span>
      <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: `${badgeColor}1A`, color: badgeColor }}>{badge}</span>
    </div>
    <div className="space-y-2 mb-3">
      <div className="flex items-start gap-2.5">
        <span className="w-3.5 h-3.5 rounded-full bg-green-500 flex-shrink-0 mt-1" />
        <p className="text-sm text-gray-800">{ride.pickup_address}</p>
      </div>
      <div className="flex items-start gap-2.5">
        <span className="w-3.5 h-3.5 rounded-full bg-red-500 flex-shrink-0 mt-1" />
        <p className="text-sm text-gray-800">{ride.dropoff_address}</p>
      </div>
    </div>
    <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
      <span>{ride.scheduled_at ? new Date(ride.scheduled_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : new Date(ride.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
      <span className="font-bold text-gray-700">Revenus estimés {cur(ride.proposed_fare || ride.estimated_fare)}</span>
    </div>
    {children}
  </div>
);

const DriverBookingsPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState('rides'); // rides | orders | bids
  const [filter, setFilter] = useState('pending'); // pending | upcoming
  const [showFilter, setShowFilter] = useState(false);
  const [data, setData] = useState({ upcoming: [], pending: [], bids: [] });
  const [orders, setOrders] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirm, setConfirm] = useState(null); // { message, action }
  const [busy, setBusy] = useState(false);
  const [bidInputs, setBidInputs] = useState({});
  const [dismissed, setDismissed] = useState([]); // locally declined pending rides

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try { const r = await rideAPI.driverBookings(); if (alive) setData(r.data || { upcoming: [], pending: [], bids: [] }); } catch { /* ignore */ }
      try { const o = await parcelAPI.driverAvailable(); if (alive) setOrders(o.data?.parcels || o.data || []); } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, 6000);
    return () => { alive = false; clearInterval(id); };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const doAccept = useCallback((ride) => {
    setConfirm({
      message: 'Êtes-vous sûr de vouloir accepter ce trajet ?',
      action: async () => {
        setBusy(true);
        try {
          await rideAPI.accept(ride.id);
          toast.success(`La réservation #${(ride.booking_no || ride.id).toString().slice(-6)} a été confirmée.`);
          setFilter('upcoming');
          reload();
        } catch { toast.error('Course déjà prise ou indisponible.'); }
        finally { setBusy(false); setConfirm(null); }
      },
    });
  }, [reload]);

  const doStart = useCallback((ride) => {
    setConfirm({
      message: 'Êtes-vous sûr de vouloir commencer un voyage ?',
      action: () => { setConfirm(null); navigate('/chauffeur/home'); },
    });
  }, [navigate]);

  const sendBid = useCallback(async (ride) => {
    const amount = parseFloat(bidInputs[ride.id]);
    if (!amount || amount <= 0) { toast.error('Saisissez un montant.'); return; }
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/rides/${ride.id}/counter-offer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) throw new Error();
      toast.success('Offre envoyée au client.');
      reload();
    } catch { toast.error("Échec de l'envoi de l'offre."); }
  }, [bidInputs, reload]);

  const rides = (filter === 'pending' ? data.pending : data.upcoming).filter((r) => !dismissed.includes(r.id));

  return (
    <div className="mobile-container min-h-screen bg-[#F2F4F7] pb-24" data-testid="driver-bookings-page">
      {/* Header */}
      <div className="bg-[#0B0B0B] text-white px-4 pt-5 pb-3">
        <h1 className="text-xl font-extrabold">Mes réservations</h1>
      </div>

      {/* Tabs */}
      <div className="bg-[#0B0B0B] px-2 flex">
        {[
          { id: 'rides', label: 'Les réservations', Icon: ClipboardText },
          { id: 'orders', label: 'Ordres', Icon: Package },
          { id: 'bids', label: 'Enchères', Icon: Gavel },
        ].map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTab(id)} data-testid={`bookings-tab-${id}`}
            className={`flex-1 py-3 flex flex-col items-center gap-1 border-b-2 transition-colors ${tab === id ? 'border-[#00B578] text-white' : 'border-transparent text-white/50'}`}>
            <Icon size={20} weight={tab === id ? 'fill' : 'regular'} />
            <span className="text-[11px] font-semibold">{label}</span>
          </button>
        ))}
      </div>

      {/* Filter (rides tab) */}
      {tab === 'rides' && (
        <div className="px-4 py-3 relative">
          <button onClick={() => setShowFilter((v) => !v)} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white shadow-sm text-sm font-bold text-gray-800" data-testid="bookings-filter-btn">
            {filter === 'pending' ? 'En attendant' : 'Prochain'} <CaretDown size={16} />
          </button>
          {showFilter && (
            <div className="absolute z-20 mt-1 bg-white rounded-xl shadow-lg overflow-hidden w-44" data-testid="bookings-filter-menu">
              <button onClick={() => { setFilter('pending'); setShowFilter(false); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50" data-testid="filter-pending">En attendant</button>
              <button onClick={() => { setFilter('upcoming'); setShowFilter(false); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-t border-gray-100" data-testid="filter-upcoming">Prochain</button>
            </div>
          )}
        </div>
      )}

      <div className="px-4">
        {/* RIDES */}
        {tab === 'rides' && rides.length === 0 && <p className="text-center text-gray-400 text-sm py-10" data-testid="bookings-empty">Aucune réservation.</p>}
        {tab === 'rides' && rides.map((ride) => (
          <BookingCard key={ride.id} ride={ride} badge="Réservation de taxi" badgeColor="#E11900" testId={`booking-${ride.id}`}>
            {filter === 'pending' ? (
              <div className="flex gap-3">
                <button onClick={() => doAccept(ride)} className="flex-1 py-2.5 rounded-full text-white font-bold text-sm" style={{ background: GREEN }} data-testid={`accept-booking-${ride.id}`}>Acceptez</button>
                <button onClick={() => { setDismissed((p) => [...p, ride.id]); toast('Trajet décliné.'); }} className="px-6 py-2.5 rounded-full border border-gray-300 text-gray-500 font-bold text-sm" data-testid={`decline-booking-${ride.id}`}>Déclin</button>
              </div>
            ) : (
              <button onClick={() => doStart(ride)} className="w-full py-2.5 rounded-full text-white font-bold text-sm" style={{ background: GREEN }} data-testid={`start-booking-${ride.id}`}>Départ voyage</button>
            )}
          </BookingCard>
        ))}

        {/* ORDERS */}
        {tab === 'orders' && (orders.length === 0
          ? <p className="text-center text-gray-400 text-sm py-10" data-testid="orders-empty">Aucune commande disponible.</p>
          : orders.map((o) => (
            <div key={o.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3" data-testid={`order-${o.id}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-400">#{(o.tracking_no || o.id || '').toString().slice(-10)}</span>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-100 text-orange-700">Livraison colis</span>
              </div>
              <p className="text-sm text-gray-800 mb-1">{o.pickup_address}</p>
              <p className="text-sm text-gray-800 mb-3">{o.dropoff_address}</p>
              <button onClick={() => navigate('/chauffeur/livraisons')} className="w-full py-2.5 rounded-full text-white font-bold text-sm" style={{ background: GREEN }} data-testid={`view-order-${o.id}`}>Voir la commande</button>
            </div>
          )))}

        {/* BIDS */}
        {tab === 'bids' && (data.bids.length === 0
          ? <p className="text-center text-gray-400 text-sm py-10" data-testid="bids-empty">Aucune enchère en cours.</p>
          : data.bids.map((ride) => (
            <BookingCard key={ride.id} ride={ride} badge="Enchère" badgeColor="#F59E0B" testId={`bid-${ride.id}`}>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-3">
                  <span className="text-sm">€</span>
                  <input type="number" step="0.50" min="1" value={bidInputs[ride.id] || ''} onChange={(e) => setBidInputs((p) => ({ ...p, [ride.id]: e.target.value }))}
                    placeholder={(ride.proposed_fare || ride.estimated_fare || 0).toFixed(2)} className="flex-1 bg-transparent outline-none text-sm font-bold py-2" data-testid={`bid-input-${ride.id}`} />
                </div>
                <button onClick={() => sendBid(ride)} className="px-5 rounded-full text-white font-bold text-sm" style={{ background: GREEN }} data-testid={`bid-send-${ride.id}`}>Proposer</button>
              </div>
            </BookingCard>
          )))}
      </div>

      <ConfirmDialog open={!!confirm} message={confirm?.message} busy={busy} onYes={() => confirm?.action()} onNo={() => setConfirm(null)} />
      <DriverBottomNav active="bookings" />
    </div>
  );
};

export default DriverBookingsPage;
