import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Gauge, BatteryHigh, Path, Prohibit, MapPin, Warning, Power, ClockCounterClockwise } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { fleetAPI } from '../../../services/api';
import FleetMap from './FleetMap';
import { statusMeta, vtypeMeta, fmtAgo } from './fleetShared';

const FleetVehicleDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [v, setV] = useState(null);
  const [history, setHistory] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fleetAPI.vehicle(id).then((r) => setV(r.data)).catch(() => { toast.error('Introuvable'); navigate('/sb-tracking/vehicules'); }).finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => {
    load();
    fleetAPI.history(id).then((r) => setHistory(r.data.points || [])).catch(() => {});
    fleetAPI.drivers().then((r) => setDrivers(r.data.drivers || [])).catch(() => {});
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load, id]);

  const cmd = async (command, label) => {
    if (command === 'engine_cut' && !window.confirm('Couper le moteur à distance ?')) return;
    try { await fleetAPI.command(id, command); toast.success(`${label} (simulé)`); } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
  };
  const assign = async (driver_id) => {
    try { await fleetAPI.updateVehicle(id, { driver_id: driver_id || null }); toast.success('Conducteur mis à jour'); load(); } catch { toast.error('Erreur'); }
  };

  if (loading || !v) return <div className="min-h-screen flex justify-center items-center bg-gray-50"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>;
  const sm = statusMeta(v.live?.status); const VIcon = vtypeMeta(v.vtype).Icon;
  const center = v.live?.lat != null ? { lat: v.live.lat, lng: v.live.lng } : null;

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="vehicle-detail-page">
      <div className="sticky top-0 z-30 bg-white px-4 pt-4 pb-3 flex items-center gap-3 border-b">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center" data-testid="back-btn"><ArrowLeft size={18} /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-extrabold text-gray-900 truncate flex items-center gap-2"><VIcon size={18} weight="fill" style={{ color: sm.color }} /> {v.name}</h1>
          <p className="text-[11px] text-gray-400">{v.plate || '—'} • {fmtAgo(v.live?.ts)}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sm.bg} ${sm.text}`}>{sm.label}</span>
      </div>

      <div className="p-4 space-y-4">
        <FleetMap center={center} vehicles={[v]} history={history} selectedId={v.id} height={260} />

        <div className="grid grid-cols-3 gap-2">
          <Stat Icon={Gauge} label="Vitesse" value={`${Math.round(v.live?.speed || 0)} km/h`} />
          <Stat Icon={BatteryHigh} label="Batterie" value={v.live?.battery != null ? `${Math.round(v.live.battery)}%` : '—'} />
          <Stat Icon={Path} label="Limite" value={`${v.speed_limit} km/h`} />
        </div>

        <div className="bg-white rounded-2xl p-4">
          <p className="text-xs font-bold text-gray-500 mb-2">Conducteur</p>
          <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500" value={v.driver_id || ''} onChange={(e) => assign(e.target.value)} data-testid="assign-driver">
            <option value="">Sans conducteur</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        <div className="bg-white rounded-2xl p-4">
          <p className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-1"><Warning size={14} /> Sécurité antivol (simulé)</p>
          <div className="grid grid-cols-2 gap-2">
            <CmdBtn Icon={Prohibit} label="Couper moteur" onClick={() => cmd('engine_cut', 'Moteur coupé')} danger testid="cmd-engine-cut" />
            <CmdBtn Icon={Power} label="Réactiver" onClick={() => cmd('engine_restore', 'Moteur réactivé')} testid="cmd-engine-restore" />
            <CmdBtn Icon={MapPin} label="Localiser" onClick={() => cmd('locate', 'Localisation envoyée')} testid="cmd-locate" />
            <CmdBtn Icon={Warning} label="Mode SOS" onClick={() => cmd('sos', 'SOS activé')} danger testid="cmd-sos" />
          </div>
        </div>

        <button onClick={() => fleetAPI.history(id).then((r) => { setHistory(r.data.points || []); toast.success('Trajet rafraîchi'); })} className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm" data-testid="refresh-history">
          <ClockCounterClockwise size={16} /> Rafraîchir le trajet ({history.length} points)
        </button>
      </div>
    </div>
  );
};

const Stat = ({ Icon, label, value }) => (
  <div className="bg-white rounded-2xl py-3 text-center"><Icon size={18} className="mx-auto mb-1 text-blue-600" weight="fill" /><p className="text-sm font-extrabold text-gray-900">{value}</p><p className="text-[10px] text-gray-400">{label}</p></div>
);
const CmdBtn = ({ Icon, label, onClick, danger, testid }) => (
  <button onClick={onClick} data-testid={testid} className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold ${danger ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-gray-50 text-gray-700 border border-gray-200'}`}><Icon size={15} weight="fill" /> {label}</button>
);

export default FleetVehicleDetailPage;
