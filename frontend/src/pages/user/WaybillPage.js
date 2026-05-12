import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, MapPin, Car, User, Receipt, Clock } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * WaybillPage — Printable trip receipt / waybill.
 * Route: /ride/:rideId/waybill
 * Reads GET /api/phase2/rides/{rideId}/waybill (response shape: {ride, passenger, driver, company, waybill_number}).
 */
const WaybillPage = () => {
  const { rideId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/api/phase2/rides/${rideId}/waybill`, { credentials: 'include' });
        if (!res.ok) throw new Error('failed');
        const json = await res.json();
        setData(json);
      } catch {
        toast.error('Impossible de charger la feuille de route');
      } finally { setLoading(false); }
    };
    load();
  }, [rideId]);

  if (loading) return <div className="p-8 text-sm text-gray-500">Chargement…</div>;
  if (!data) return <div className="p-8 text-sm text-red-500">Feuille de route introuvable.</div>;

  // Map backend nested shape to local view-model
  const ride = data.ride || {};
  const passenger = data.passenger || {};
  const driver = data.driver || {};

  const dateRaw = ride.completed_at || ride.created_at || '';
  const dateLabel = dateRaw ? new Date(dateRaw).toLocaleString('fr-FR') : '—';
  const baseFare = Number(ride.final_fare ?? ride.estimated_fare ?? 0);
  const tipAmount = Number(ride.tip_amount || 0);
  const surcharge = Number(ride.surcharge_amount || 0);
  const total = baseFare + tipAmount;
  const distanceKm = Number(ride.distance_km || 0);

  const vehicleSub = [driver.vehicle_model, driver.vehicle_number || driver.vehicle_plate]
    .filter(Boolean).join(' · ');

  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="waybill-page">
      {/* Top bar (hidden on print) */}
      <div className="print:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} data-testid="waybill-back-btn"><ArrowLeft size={22} /></button>
        <h1 className="flex-1 font-bold">Feuille de route</h1>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold"
          data-testid="waybill-print-btn"
        >
          <Printer size={14} weight="bold" /> Imprimer
        </button>
      </div>

      {/* Printable area */}
      <div className="p-5 max-w-xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-6 print:shadow-none print:rounded-none">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-gray-200 pb-4 mb-4">
            <div>
              <h2 className="text-2xl font-black text-[#FF4500]">SB Drive VTC</h2>
              <p className="text-xs text-gray-500 mt-1">sbdrivevtc.com</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500 uppercase font-semibold">N° Feuille</p>
              <p className="font-bold text-gray-900" data-testid="waybill-number">{data.waybill_number || '—'}</p>
            </div>
          </div>

          {/* Trip block */}
          <div className="space-y-4 mb-5">
            <Row icon={Clock} label="Date et heure" value={dateLabel} />
            <Row icon={User} label="Passager" value={passenger.name || '—'} subValue={passenger.phone} />
            <Row icon={Car} label="Chauffeur" value={driver.name || '—'} subValue={vehicleSub || null} />
            <Row icon={MapPin} label="Départ" value={ride.pickup_address} iconColor="text-emerald-600" />
            <Row icon={MapPin} label="Arrivée" value={ride.dropoff_address} iconColor="text-rose-600" />
          </div>

          {/* Fare breakdown */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-xs uppercase font-bold text-gray-500 mb-3 flex items-center gap-1.5">
              <Receipt size={14} /> Détail tarif
            </h3>
            <div className="space-y-1.5 text-sm">
              <Line label={`Distance (${distanceKm.toFixed(1)} km)`} value={`${baseFare.toFixed(2)} €`} />
              {!!surcharge && <Line label="Suppléments" value={`${surcharge.toFixed(2)} €`} />}
              {!!tipAmount && <Line label="Pourboire" value={`${tipAmount.toFixed(2)} €`} />}
              <div className="border-t border-gray-100 my-2" />
              <div className="flex items-center justify-between font-bold text-base">
                <span>Total</span>
                <span className="text-[#FF4500]" data-testid="waybill-total">{total.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-gray-400 text-center mt-6">
            Merci d'avoir voyagé avec SB Drive VTC — Feuille de route générée le {new Date().toLocaleString('fr-FR')}
          </p>
        </div>
      </div>
    </div>
  );
};

const Row = ({ icon: Icon, label, value, subValue, iconColor = 'text-gray-500' }) => (
  <div className="flex items-start gap-3">
    <Icon size={20} weight="duotone" className={`flex-shrink-0 mt-0.5 ${iconColor}`} />
    <div className="flex-1 min-w-0">
      <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-gray-900 break-words">{value || '—'}</p>
      {subValue && <p className="text-[11px] text-gray-500">{subValue}</p>}
    </div>
  </div>
);
const Line = ({ label, value }) => (
  <div className="flex items-center justify-between text-gray-700">
    <span>{label}</span><span className="font-medium">{value}</span>
  </div>
);

export default WaybillPage;
