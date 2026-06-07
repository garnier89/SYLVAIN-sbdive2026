import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const PAY_LABELS = { cash: 'Espèces', card: 'CB', wallet: 'Portefeuille', sbpaygo: 'SB PayGo' };

const fmtDateTime = (raw) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date} à ${time}`;
};

const eur = (n) => `${Number(n || 0).toFixed(2)} €`;

/**
 * WaybillPage — "Bon de commande" (V3Cube layout).
 * Route: /ride/:rideId/waybill — reads GET /api/phase2/rides/{rideId}/waybill.
 * Generated at acceptance; the trip AMOUNT and PAYMENT METHOD are only revealed
 * once the driver has started the course (backend `started` flag).
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
        setData(await res.json());
      } catch {
        toast.error('Impossible de charger le bon de commande');
      } finally { setLoading(false); }
    };
    load();
  }, [rideId]);

  if (loading) return <div className="p-8 text-sm text-gray-500">Chargement…</div>;
  if (!data) return <div className="p-8 text-sm text-red-500">Bon de commande introuvable.</div>;

  const ride = data.ride || {};
  const passenger = data.passenger || {};
  const driver = data.driver || {};
  const started = !!data.started;

  const tarification = `${eur(ride.base_fare)} Prix de base + ${eur(ride.price_per_min)} par minute + ${eur(ride.price_per_km)} km`;
  const payLabel = PAY_LABELS[ride.payment_method] || 'Espèces';

  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="waybill-page">
      {/* Top bar (hidden on print) */}
      <div className="print:hidden bg-[#0B1426] text-white px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} data-testid="waybill-back-btn" aria-label="Retour"><ArrowLeft size={24} weight="bold" /></button>
        <h1 className="flex-1 text-xl font-bold text-center pr-7">Bon de commande</h1>
      </div>

      <div className="p-4 max-w-xl mx-auto space-y-6">
        {/* ── Détails du bon de commande ── */}
        <section>
          <h2 className="text-xl font-extrabold text-[#1f2d3d] mb-3">Détails du bon de commande</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
            <KV label="Course n°" value={data.course_number} testId="waybill-course-no" />
            <KV label="Tarification" value={tarification} />
            <KV label="Nom du client" value={passenger.name} />
            <KV label="via" value={data.company?.name} />
            <KV label="Départ" value={ride.pickup_address} />
            <KV label="Arrivée" value={ride.dropoff_address} />
            <KV label="Heure" value={fmtDateTime(ride.accepted_at || ride.created_at)} />
            {started && <KV label="Montant de la course" value={eur(ride.fare)} testId="waybill-amount" highlight />}
            {started && <KV label="Mode de paiement" value={payLabel} testId="waybill-payment" />}
          </div>
          {!started && (
            <p className="text-xs text-gray-400 mt-2 px-1" data-testid="waybill-amount-hint">
              Le montant et le mode de paiement s&apos;afficheront une fois la course démarrée.
            </p>
          )}
        </section>

        {/* ── Chauffeur ── */}
        <section>
          <h2 className="text-xl font-extrabold text-[#1f2d3d] mb-3">Chauffeur</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
            <KV label="Nom prénom" value={driver.name} />
            <KV label="Plaque d'immat" value={driver.vehicle_number} />
            <KV label="NB de places" value={driver.seats != null ? String(driver.seats) : null} />
            <KV label="Nom de la société" value={driver.company_name} testId="waybill-company" />
            <KV label="Numéro de licence" value={driver.license_number} testId="waybill-license" />
          </div>
        </section>

        <button
          onClick={() => window.print()}
          className="print:hidden w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#FF4500] text-white text-sm font-bold shadow-sm active:scale-[0.99] transition-transform"
          data-testid="waybill-print-btn"
        >
          <Printer size={18} weight="bold" /> Imprimer le bon de commande
        </button>

        <p className="text-[10px] text-gray-400 text-center pb-4">
          N° {data.waybill_number} · Bon de commande SB Drive VTC
        </p>
      </div>
    </div>
  );
};

const KV = ({ label, value, testId, highlight = false }) => (
  <div className="flex items-start px-4 py-3.5 gap-4">
    <span className="w-28 flex-shrink-0 text-[15px] text-[#5b6b7b] leading-snug">{label}</span>
    <span
      className={`flex-1 text-[15px] font-semibold leading-snug break-words ${highlight ? 'text-[#FF4500]' : 'text-[#1f2d3d]'}`}
      data-testid={testId}
    >
      {value || '—'}
    </span>
  </div>
);

export default WaybillPage;
