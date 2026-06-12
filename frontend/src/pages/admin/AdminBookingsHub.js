import React, { useEffect, useState, useCallback } from 'react';
import { adminAPI } from '../../services/api';
import { toast } from 'sonner';
import { exportCSV, exportPDF } from '../../lib/exportUtils';
import { ManualRideModal, ManualOrderModal } from '../../components/admin/ManualBookingModals';
import AdminGoogleMap from '../../components/admin/AdminGoogleMap';
import { NearbyDriversModal } from '../../components/admin/NearbyDriversModal';
import { DispatchControl } from '../../components/admin/DispatchControl';
import {
  Car, Package, ClockCountdown, CheckCircle, XCircle, CurrencyEur, ChartLineUp,
  Plus, MagnifyingGlass, DownloadSimple, FilePdf, ArrowsClockwise, CalendarBlank, UserSwitch,
} from '@phosphor-icons/react';

const STATUS_COLORS = {
  pending: 'bg-amber-100 text-amber-700', accepted: 'bg-blue-100 text-blue-700',
  arriving: 'bg-indigo-100 text-indigo-700', in_progress: 'bg-violet-100 text-violet-700',
  completed: 'bg-emerald-100 text-emerald-700', cancelled: 'bg-red-100 text-red-700',
  expired: 'bg-gray-200 text-gray-600', delivered: 'bg-emerald-100 text-emerald-700',
};
const STATUS_LABEL = {
  pending: 'En attente', accepted: 'Acceptée', arriving: 'En approche', in_progress: 'En cours',
  completed: 'Terminée', cancelled: 'Annulée', expired: 'Expirée', delivered: 'Livrée', preparing: 'Préparation',
};
const Badge = ({ s }) => <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_COLORS[s] || 'bg-gray-100 text-gray-600'}`}>{STATUS_LABEL[s] || s || '—'}</span>;
const PAY_LABEL = { cash: 'Espèces', card: 'Carte', wallet: 'SB Pay', online: 'En ligne' };
const Pay = ({ m }) => <span className="inline-flex items-center gap-1 text-xs text-gray-600"><CurrencyEur size={12} className="text-gray-400" />{PAY_LABEL[m] || m || '—'}</span>;
const MTQ_CENTER = { lat: 14.6415, lng: -61.0242 };
const fmt = (d) => d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const eur = (n) => `${(n || 0).toFixed(2)} €`;

const Kpi = ({ icon: Icon, label, value, color, testid }) => (
  <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3" data-testid={testid}>
    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}15` }}>
      <Icon size={22} weight="duotone" style={{ color }} />
    </div>
    <div className="min-w-0"><p className="text-xs text-gray-500 truncate">{label}</p><p className="text-xl font-bold text-gray-900">{value}</p></div>
  </div>
);

const TABS = [
  { key: 'live', label: 'En cours', icon: Car },
  { key: 'scheduled', label: 'Programmées', icon: CalendarBlank },
  { key: 'trips', label: 'Trips / Jobs', icon: ChartLineUp },
  { key: 'orders', label: 'Commandes', icon: Package },
];

const AdminBookingsHub = () => {
  const [overview, setOverview] = useState(null);
  const [tab, setTab] = useState('live');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusF, setStatusF] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showRide, setShowRide] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [selectedRide, setSelectedRide] = useState(null);
  const [reassignRide, setReassignRide] = useState(null);

  const loadOverview = useCallback(() => { adminAPI.bookingsOverview().then((r) => setOverview(r.data)).catch(() => {}); }, []);

  const loadTab = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'live') setRows((await adminAPI.bookingsLive()).data.rides || []);
      else if (tab === 'scheduled') setRows((await adminAPI.bookingsScheduled({ status: statusF || undefined, search: search || undefined })).data.rides || []);
      else if (tab === 'trips') setRows((await adminAPI.listRides({ status: statusF || undefined, search: search || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined })).data.rides || []);
      else if (tab === 'orders') setRows((await adminAPI.listOrders({ status: statusF || undefined, search: search || undefined })).data.orders || []);
    } catch (e) { toast.error('Échec du chargement'); }
    finally { setLoading(false); }
  }, [tab, statusF, search, dateFrom, dateTo]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadTab(); }, [loadTab]);
  // Live auto-refresh every 12s while on the "En cours" tab (real-time dispatch map).
  useEffect(() => {
    if (tab !== 'live') return undefined;
    const t = setInterval(loadTab, 12000);
    return () => clearInterval(t);
  }, [tab, loadTab]);
  useEffect(() => { setSelectedRide(null); }, [tab]);

  const refresh = () => { loadOverview(); loadTab(); };

  const cancelRide = async (id) => {
    if (!window.confirm('Annuler cette course ?')) return;
    try { await adminAPI.cancelBookingRide(id, 'Annulée par l\'administrateur'); toast.success('Course annulée'); refresh(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
  };
  const reschedule = async (id) => {
    const v = window.prompt('Nouvelle date/heure (AAAA-MM-JJ HH:MM)');
    if (!v) return;
    try { await adminAPI.rescheduleBookingRide(id, new Date(v.replace(' ', 'T')).toISOString()); toast.success('Replanifiée'); refresh(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'Date invalide'); }
  };
  const reassign = (ride) => setReassignRide(ride);

  const exportTrips = (kind) => {
    const cols = [
      { key: 'booking_no', label: 'N° Réservation' }, { key: 'customer_name', label: 'Client' },
      { key: 'pickup_address', label: 'Départ' }, { key: 'dropoff_address', label: 'Arrivée' },
      { key: 'driver_name', label: 'Chauffeur' }, { key: 'vehicle_type', label: 'Type' },
      { key: '_fare', label: 'Tarif (€)' }, { key: '_pay', label: 'Paiement' }, { key: '_status', label: 'Statut' }, { key: '_date', label: 'Date' },
    ];
    const data = rows.map((r) => ({ ...r, _fare: (r.fare || 0).toFixed(2), _pay: PAY_LABEL[r.payment_method] || r.payment_method || '', _status: STATUS_LABEL[r.status] || r.status, _date: fmt(r.created_at) }));
    if (kind === 'csv') exportCSV('trips-jobs.csv', cols, data);
    else exportPDF('Trips & Jobs', cols, data);
  };

  const isRideTab = tab === 'live' || tab === 'scheduled' || tab === 'trips';

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="admin-bookings-hub">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Réservations & Commandes</h1>
          <p className="text-sm text-gray-500 mt-1">Pilotez en un seul endroit les courses en cours, les réservations programmées, l'historique et les commandes.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowRide(true)} className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg px-3 py-2 text-sm font-bold" data-testid="open-manual-ride-btn"><Plus size={15} weight="bold" /> Réservation manuelle</button>
          <button onClick={() => setShowOrder(true)} className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-3 py-2 text-sm font-bold" data-testid="open-manual-order-btn"><Plus size={15} weight="bold" /> Nouvelle commande</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={Car} label="Courses en cours" value={overview?.live_rides ?? '—'} color="#DC2626" testid="kpi-live" />
        <Kpi icon={CalendarBlank} label="Réservations à venir" value={overview?.upcoming_reservations ?? '—'} color="#2563EB" testid="kpi-upcoming" />
        <Kpi icon={Package} label="Commandes (jour)" value={overview?.orders_today ?? '—'} color="#7C3AED" testid="kpi-orders" />
        <Kpi icon={CheckCircle} label="Terminées (jour)" value={overview?.completed_today ?? '—'} color="#059669" testid="kpi-completed" />
        <Kpi icon={CurrencyEur} label="CA du jour" value={overview ? eur(overview.revenue_today) : '—'} color="#0891B2" testid="kpi-revenue" />
        <Kpi icon={XCircle} label="Taux d'annulation" value={overview ? `${overview.cancellation_rate}%` : '—'} color="#EA580C" testid="kpi-cancel-rate" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setStatusF(''); }} data-testid={`tab-${t.key}`}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <MagnifyingGlass size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-56" data-testid="bookings-search" />
        </div>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" data-testid="bookings-status-filter">
          <option value="">Tous statuts</option>
          {(tab === 'orders' ? ['pending', 'preparing', 'delivered', 'cancelled'] : tab === 'scheduled' ? ['pending', 'expired', 'accepted', 'completed', 'cancelled'] : ['pending', 'accepted', 'in_progress', 'completed', 'cancelled']).map((s) => <option key={s} value={s}>{STATUS_LABEL[s] || s}</option>)}
        </select>
        {tab === 'trips' && (<>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-2 text-sm" data-testid="bookings-date-from" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-2 text-sm" data-testid="bookings-date-to" />
          <button onClick={() => exportTrips('csv')} className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50" data-testid="export-csv-btn"><DownloadSimple size={15} /> CSV</button>
          <button onClick={() => exportTrips('pdf')} className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50" data-testid="export-pdf-btn"><FilePdf size={15} /> PDF</button>
        </>)}
        <button onClick={refresh} className="ml-auto flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900" data-testid="bookings-refresh"><ArrowsClockwise size={15} /> Actualiser</button>
      </div>

      {/* Real-time dispatch map (live tab) */}
      {tab === 'live' && (() => {
        const markers = rows.flatMap((r) => {
          if (r.driver_lat) return [{ id: 'd-' + r.id, lat: r.driver_lat, lng: r.driver_lng, color: '#2563EB', label: 'D', onClick: () => setSelectedRide(r) }];
          if (r.pickup_lat) return [{ id: 'p-' + r.id, lat: r.pickup_lat, lng: r.pickup_lng, color: '#F59E0B', label: 'A', onClick: () => setSelectedRide(r) }];
          return [];
        });
        const sel = selectedRide;
        const center = sel?.pickup_lat ? { lat: sel.pickup_lat, lng: sel.pickup_lng }
          : (markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : MTQ_CENTER);
        const route = sel?.pickup_lat && sel?.dropoff_lat ? [{ lat: sel.pickup_lat, lng: sel.pickup_lng }, { lat: sel.dropoff_lat, lng: sel.dropoff_lng }] : null;
        return (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" data-testid="live-map-wrap">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-50">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Car size={16} className="text-red-500" /> Carte de dispatching en direct
                <span className="text-xs font-normal text-gray-400">· {markers.length} en carte · maj auto 12s</span></p>
              <span className="flex items-center gap-3 text-[11px] text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Chauffeur</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> En attente (A)</span>
              </span>
            </div>
            <div className="h-[360px]">
              <AdminGoogleMap
                center={center}
                zoom={sel ? 13 : 11}
                markers={sel ? [] : markers}
                pickup={sel?.pickup_lat ? { lat: sel.pickup_lat, lng: sel.pickup_lng } : null}
                dropoff={sel?.dropoff_lat ? { lat: sel.dropoff_lat, lng: sel.dropoff_lng } : null}
                driver={sel?.driver_lat ? { lat: sel.driver_lat, lng: sel.driver_lng } : null}
                routePath={route}
                showTraffic
              />
            </div>
            {sel && (
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-gray-50 bg-gray-50" data-testid="live-selected-bar">
                <span className="font-mono text-xs text-gray-600">{sel.booking_no || sel.id?.slice(-6)}</span>
                <span className="text-sm font-medium text-gray-800">{sel.customer_name}</span>
                <span className="text-xs text-gray-500 truncate max-w-[260px]"><b className="text-emerald-600">A</b> {sel.pickup_address} <b className="text-red-500 ml-1">B</b> {sel.dropoff_address}</span>
                <Pay m={sel.payment_method} />
                <Badge s={sel.status} />
                <span className="text-xs text-gray-600">{sel.driver_name || 'Non assigné'}</span>
                <div className="ml-auto flex gap-2 items-center">
                  {!sel.driver_id && <DispatchControl ride={sel} onChange={refresh} />}
                  {!sel.driver_id && <button onClick={() => reassign(sel)} className="text-xs font-bold text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1.5" data-testid="map-reassign-btn">Affecter</button>}
                  {!['completed', 'cancelled'].includes(sel.status) && <button onClick={() => cancelRide(sel.id)} className="text-xs font-bold text-red-600 border border-red-200 rounded-lg px-2.5 py-1.5" data-testid="map-cancel-btn">Annuler</button>}
                  <button onClick={() => setSelectedRide(null)} className="text-xs text-gray-500 px-2">Fermer</button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {loading ? <p className="p-6 text-center text-sm text-gray-400">Chargement…</p> : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400" data-testid="bookings-empty">Aucun élément.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                {isRideTab ? (
                  <tr><th className="text-left p-3">N°</th><th className="text-left p-3">Client</th><th className="text-left p-3">Trajet (A → B)</th><th className="text-left p-3">Chauffeur</th><th className="text-left p-3">Type</th><th className="text-left p-3">Tarif</th><th className="text-left p-3">Paiement</th><th className="text-left p-3">{tab === 'scheduled' ? 'Planifiée' : 'Date'}</th><th className="text-left p-3">Statut</th><th className="text-right p-3">Actions</th></tr>
                ) : (
                  <tr><th className="text-left p-3">N°</th><th className="text-left p-3">Client</th><th className="text-left p-3">Marchand</th><th className="text-left p-3">Livraison</th><th className="text-left p-3">Total</th><th className="text-left p-3">Paiement</th><th className="text-left p-3">Date</th><th className="text-left p-3">Statut</th></tr>
                )}
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isRideTab ? rows.map((r) => (
                  <tr key={r.id} className={`hover:bg-gray-50 ${tab === 'live' ? 'cursor-pointer' : ''} ${selectedRide?.id === r.id ? 'bg-blue-50' : ''}`} onClick={tab === 'live' ? () => setSelectedRide(r) : undefined} data-testid={`booking-row-${r.id}`}>
                    <td className="p-3 font-mono text-xs text-gray-700">{r.booking_no || r.id?.slice(-6)}</td>
                    <td className="p-3"><p className="font-medium text-gray-800">{r.customer_name}</p><p className="text-xs text-gray-400">{r.customer_phone || ''}</p></td>
                    <td className="p-3 max-w-[240px]"><p className="truncate text-gray-700"><b className="text-emerald-600 mr-1">A</b>{r.pickup_address}</p><p className="truncate text-xs text-gray-500"><b className="text-red-500 mr-1">B</b>{r.dropoff_address}</p></td>
                    <td className="p-3 text-gray-700">{r.driver_name || <span className="text-amber-600 text-xs">Non assigné</span>}</td>
                    <td className="p-3 text-gray-600">{r.vehicle_type || r.ride_type || '—'}</td>
                    <td className="p-3 font-semibold text-gray-800">{eur(r.fare)}</td>
                    <td className="p-3"><Pay m={r.payment_method} /></td>
                    <td className="p-3 text-gray-600 text-xs">{fmt(tab === 'scheduled' ? r.scheduled_at : r.created_at)}</td>
                    <td className="p-3"><Badge s={tab === 'scheduled' ? (r.display_status || r.status) : r.status} /></td>
                    <td className="p-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {!['completed', 'cancelled'].includes(r.status) && (
                        <>
                          {!r.driver_id && <button onClick={() => reassign(r)} title="Affecter un chauffeur" className="text-blue-600 p-1" data-testid={`reassign-${r.id}`}><UserSwitch size={16} /></button>}
                          {tab === 'scheduled' && <button onClick={() => reschedule(r.id)} title="Replanifier" className="text-indigo-600 p-1" data-testid={`reschedule-${r.id}`}><ClockCountdown size={16} /></button>}
                          <button onClick={() => cancelRide(r.id)} title="Annuler" className="text-red-500 p-1" data-testid={`cancel-${r.id}`}><XCircle size={16} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                )) : rows.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50" data-testid={`order-row-${o.id}`}>
                    <td className="p-3 font-mono text-xs text-gray-700">{o.id?.slice(-6)}</td>
                    <td className="p-3 text-gray-800">{o.customer_name}</td>
                    <td className="p-3 text-gray-600">{o.merchant_name}</td>
                    <td className="p-3 max-w-[220px] truncate text-gray-700">{o.delivery_address}</td>
                    <td className="p-3 font-semibold text-gray-800">{eur(o.total)}</td>
                    <td className="p-3"><Pay m={o.payment_method} /></td>
                    <td className="p-3 text-gray-600 text-xs">{fmt(o.created_at)}</td>
                    <td className="p-3"><Badge s={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showRide && <ManualRideModal onClose={() => setShowRide(false)} onCreated={refresh} />}
      {showOrder && <ManualOrderModal onClose={() => setShowOrder(false)} onCreated={refresh} />}
      {reassignRide && <NearbyDriversModal ride={reassignRide} onClose={() => setReassignRide(null)} onAssigned={refresh} />}
    </div>
  );
};

export default AdminBookingsHub;
