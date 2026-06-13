import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Ticket, ClockCounterClockwise, ChartBar, QrCode, Lightning } from '@phosphor-icons/react';
import { organizerAPI } from '../../../services/api';

const fmtHour = (h) => { try { return `${h.slice(11, 13)}h`; } catch { return h; } };
const fmtTime = (iso) => { try { const d = new Date(iso); return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

/** Real-time 'event day' dashboard, auto-refreshed, aggregating all controllers' scans. */
const EventLiveDashboard = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const prevSeats = useRef(0);

  const load = useCallback(() => {
    organizerAPI.eventLive(id)
      .then((r) => setData(r.data))
      .catch((e) => { if (e?.response?.status === 403) navigate('/organizer', { replace: true }); })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { setTick((x) => x + 1); load(); }, 8000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <div className="min-h-screen flex justify-center items-center bg-gray-900"><div className="w-8 h-8 border-2 border-orange-300/30 border-t-[#FF4500] rounded-full animate-spin" /></div>;
  if (!data) return null;

  const fill = data.fill_rate || 0;
  const maxSeat = Math.max(1, ...data.arrivals_by_hour.map((a) => a.seats));
  const justArrived = data.checked_in_seats > prevSeats.current;
  prevSeats.current = data.checked_in_seats;

  return (
    <div className="mobile-container min-h-screen pb-10" style={{ background: '#111827' }} data-testid="live-dashboard-page">
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={18} className="text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-extrabold text-white truncate">{data.event.title}</h1>
          <p className="text-[11px] text-white/60 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Suivi jour J en direct
          </p>
        </div>
        <button onClick={() => navigate(`/organizer/events/${id}/checkin`)} className="bg-[#FF4500] text-white text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1.5" data-testid="open-scanner-btn">
          <QrCode size={14} weight="fill" /> Scanner
        </button>
      </div>

      {/* Fill rate ring/bar */}
      <div className="px-4">
        <div className="bg-white/10 rounded-2xl p-4" data-testid="fill-card">
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-4xl font-extrabold text-white leading-none" data-testid="fill-rate">{fill}%</p>
              <p className="text-[11px] text-white/60 mt-1">Taux de remplissage</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-extrabold text-green-400">{data.checked_in_seats}<span className="text-white/40 text-sm">/{data.seats}</span></p>
              <p className="text-[11px] text-white/60">entrés / vendus</p>
            </div>
          </div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#FF4500] to-green-400 transition-all duration-700" style={{ width: `${Math.min(fill, 100)}%` }} />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="px-4 mt-3 grid grid-cols-3 gap-2">
        <Kpi Icon={Users} label="Entrés" value={data.checked_in_seats} accent="text-green-400" />
        <Kpi Icon={Ticket} label="Restant" value={data.remaining_seats} accent="text-amber-300" />
        <Kpi Icon={Lightning} label="Commandes" value={`${data.checked_in_orders}/${data.orders}`} accent="text-white" />
      </div>

      {/* Arrivals per hour */}
      <div className="px-4 mt-4">
        <h2 className="text-sm font-bold text-white/90 mb-2 flex items-center gap-1.5"><ChartBar size={16} weight="fill" className="text-[#FF4500]" /> Arrivées par heure</h2>
        <div className="bg-white/10 rounded-2xl p-4" data-testid="arrivals-chart">
          {data.arrivals_by_hour.length === 0 ? (
            <p className="text-xs text-white/50 text-center py-4">Aucune entrée pour le moment</p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {data.arrivals_by_hour.map((a) => (
                <div key={a.hour} className="flex-1 flex flex-col items-center justify-end gap-1" data-testid={`bar-${a.hour}`}>
                  <span className="text-[10px] font-bold text-white">{a.seats}</span>
                  <div className="w-full bg-gradient-to-t from-[#FF4500] to-amber-300 rounded-t-md transition-all duration-700" style={{ height: `${Math.max((a.seats / maxSeat) * 96, 6)}px` }} />
                  <span className="text-[9px] text-white/50">{fmtHour(a.hour)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Per controller */}
      {data.by_controller.length > 0 && (
        <div className="px-4 mt-4">
          <h2 className="text-sm font-bold text-white/90 mb-2 flex items-center gap-1.5"><Users size={16} weight="fill" className="text-[#FF4500]" /> Par contrôleur</h2>
          <div className="bg-white/10 rounded-2xl divide-y divide-white/5" data-testid="by-controller">
            {data.by_controller.map((c) => (
              <div key={c.name} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-white/90 truncate">{c.name}</span>
                <span className="text-sm font-bold text-green-400">{c.seats} <span className="text-white/40 text-xs">pers.</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent arrivals */}
      <div className="px-4 mt-4">
        <h2 className="text-sm font-bold text-white/90 mb-2 flex items-center gap-1.5"><ClockCounterClockwise size={16} weight="fill" className="text-[#FF4500]" /> Dernières arrivées</h2>
        <div className="bg-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden" data-testid="recent-arrivals">
          {data.recent.length === 0 ? (
            <p className="text-xs text-white/50 text-center py-5">En attente des premiers scans…</p>
          ) : data.recent.map((r) => (
            <div key={r.id} className={`flex items-center justify-between px-4 py-2.5 ${justArrived && r === data.recent[0] ? 'bg-green-500/10' : ''}`}>
              <div className="min-w-0">
                <p className="text-sm text-white/90 truncate">{r.tier_name} × {r.quantity}</p>
                <p className="text-[10px] text-white/50">par {r.by}</p>
              </div>
              <span className="text-xs text-white/60 shrink-0">{fmtTime(r.checked_in_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Kpi = ({ Icon, label, value, accent }) => (
  <div className="bg-white/10 rounded-2xl py-3 text-center" data-testid={`kpi-${label}`}>
    <Icon size={18} weight="fill" className={`mx-auto mb-1 ${accent}`} />
    <p className={`text-lg font-extrabold ${accent}`}>{value}</p>
    <p className="text-[10px] text-white/60">{label}</p>
  </div>
);

export default EventLiveDashboard;
