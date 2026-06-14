import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Gauge, BatteryHigh, Path, Prohibit, MapPin, Warning, Power, ClockCounterClockwise, Lock, LockOpen, ShieldWarning, CheckCircle, X } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { fleetAPI } from '../../../services/api';
import FleetMap from './FleetMap';
import { statusMeta, vtypeMeta, fmtAgo } from './fleetShared';

const CMD_STATUS = {
  sent: { label: 'Envoyée', cls: 'bg-amber-50 text-amber-700' },
  acked: { label: 'Confirmée', cls: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'Échec', cls: 'bg-red-50 text-red-700' },
  pending: { label: 'En attente', cls: 'bg-gray-100 text-gray-500' },
};

const FleetVehicleDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [v, setV] = useState(null);
  const [history, setHistory] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [commands, setCommands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmCmd, setConfirmCmd] = useState(null);

  const load = useCallback(() => {
    fleetAPI.vehicle(id).then((r) => setV(r.data)).catch(() => { toast.error('Introuvable'); navigate('/sb-tracking/vehicules'); }).finally(() => setLoading(false));
  }, [id, navigate]);
  const loadCommands = useCallback(() => { fleetAPI.commands(id).then((r) => setCommands(r.data.commands || [])).catch(() => {}); }, [id]);

  useEffect(() => {
    load();
    loadCommands();
    fleetAPI.history(id).then((r) => setHistory(r.data.points || [])).catch(() => {});
    fleetAPI.drivers().then((r) => setDrivers(r.data.drivers || [])).catch(() => {});
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load, loadCommands, id]);

  const sendCmd = async (command, label, confirm = false) => {
    try {
      const res = await fleetAPI.command(id, command, confirm);
      const st = res.data?.command?.status;
      toast.success(`${label} — ${st === 'acked' ? 'confirmée par le traceur' : 'envoyée'}`);
      setConfirmCmd(null); load(); loadCommands();
    } catch (e) {
      if (e?.response?.status === 409) { setConfirmCmd({ command, label }); return; }
      toast.error(e?.response?.data?.detail || 'Erreur');
    }
  };
  const onCmd = (command, label, critical) => { if (critical) setConfirmCmd({ command, label }); else sendCmd(command, label); };
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
        {v.engine_locked && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex items-center gap-1" data-testid="engine-locked-badge"><Prohibit size={11} weight="fill" /> Moteur coupé</span>}
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
          <p className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-1"><ShieldWarning size={14} weight="fill" /> Commande & contrôle (sécurité)</p>
          <div className="grid grid-cols-2 gap-2">
            {v.engine_locked
              ? <CmdBtn Icon={Power} label="Réactiver moteur" onClick={() => onCmd('engine_restore', 'Réactivation moteur')} testid="cmd-engine-restore" />
              : <CmdBtn Icon={Prohibit} label="Couper moteur" onClick={() => onCmd('engine_cut', 'Coupure moteur', true)} danger testid="cmd-engine-cut" />}
            {v.locked
              ? <CmdBtn Icon={LockOpen} label="Déverrouiller" onClick={() => onCmd('unlock', 'Déverrouillage')} testid="cmd-unlock" />
              : <CmdBtn Icon={Lock} label="Verrouiller" onClick={() => onCmd('lock', 'Verrouillage')} testid="cmd-lock" />}
            <CmdBtn Icon={MapPin} label="Localiser" onClick={() => onCmd('locate', 'Localisation')} testid="cmd-locate" />
            <CmdBtn Icon={Warning} label="Mode SOS" onClick={() => onCmd('sos', 'Mode SOS', true)} danger testid="cmd-sos" />
          </div>
          {commands.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-bold text-gray-400 mb-2">Historique des commandes</p>
              <div className="space-y-1.5">
                {commands.slice(0, 5).map((c) => {
                  const st = CMD_STATUS[c.status] || CMD_STATUS.pending;
                  return (
                    <div key={c.id} className="flex items-center gap-2 text-xs" data-testid={`cmd-hist-${c.id}`}>
                      <span className="text-gray-700 flex-1 truncate">{c.label}</span>
                      <span className="text-gray-300">{fmtAgo(c.requested_at)}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button onClick={() => fleetAPI.history(id).then((r) => { setHistory(r.data.points || []); toast.success('Trajet rafraîchi'); })} className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 font-bold py-2.5 rounded-xl text-sm" data-testid="refresh-history">
          <ClockCounterClockwise size={16} /> Rafraîchir le trajet ({history.length} points)
        </button>
      </div>

      {confirmCmd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5" data-testid="cmd-confirm-modal">
          <div className="bg-white w-full max-w-sm rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2"><ShieldWarning size={22} weight="fill" className="text-red-600" /><h2 className="font-extrabold text-gray-900">Action critique</h2></div>
            <p className="text-sm text-gray-600">Confirmez l'envoi de la commande <b>« {confirmCmd.label} »</b> au véhicule {v.name}. Cette action sera transmise au traceur et journalisée.</p>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setConfirmCmd(null)} className="flex-1 border border-gray-300 font-bold py-2.5 rounded-lg flex items-center justify-center gap-1" data-testid="cmd-cancel"><X size={15} /> Annuler</button>
              <button onClick={() => sendCmd(confirmCmd.command, confirmCmd.label, true)} className="flex-1 bg-red-600 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-1" data-testid="cmd-confirm"><CheckCircle size={15} weight="fill" /> Confirmer</button>
            </div>
          </div>
        </div>
      )}
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
