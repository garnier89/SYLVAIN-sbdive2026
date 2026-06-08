/**
 * Composants partagés "perturbations / grèves des transports" + indicateur EN DIRECT.
 *
 * - LiveBadge       : pastille animée « EN DIRECT » (s'affiche quand le temps réel
 *                     GTFS-RT est actif ; sinon « Théorique »).
 * - DisruptionBanner: bannière de perturbations actives. En cas de GRÈVE, pousse
 *                     fortement la bascule vers le VTC (cross-sell). `strikesOnly`
 *                     limite l'affichage aux grèves (utilisé sur l'accueil client).
 * - DisruptionHistory: historique repliable des perturbations (retards/annulations).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Warning, Megaphone, Lightning, CarProfile, ClockCounterClockwise,
  CaretDown, X, Prohibit, Clock,
} from '@phosphor-icons/react';
import { transportAPI } from '../../services/api';

const TYPE_META = {
  strike: { label: 'Grève', Icon: Prohibit, color: '#DC2626' },
  cancellation: { label: 'Annulation', Icon: X, color: '#DC2626' },
  reduced: { label: 'Service réduit', Icon: Warning, color: '#D97706' },
  delay: { label: 'Retards', Icon: Clock, color: '#D97706' },
  detour: { label: 'Déviation', Icon: Warning, color: '#D97706' },
  info: { label: 'Info', Icon: Megaphone, color: '#2563EB' },
};
const typeMeta = (t) => TYPE_META[t] || TYPE_META.info;

const fmtDate = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return ''; }
};

/** Pastille animée « EN DIRECT » / « Théorique ». */
export const LiveBadge = ({ active, testId = 'live-badge' }) => (
  active ? (
    <span data-testid={`${testId}-live`} className="inline-flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
      </span>
      EN DIRECT
    </span>
  ) : (
    <span data-testid={`${testId}-theoretical`} className="inline-flex items-center gap-1 bg-white/15 text-white/70 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full">
      <Clock size={11} weight="bold" /> Théorique
    </span>
  )
);

/** Bannière de perturbations actives (grèves mises en avant, cross-sell VTC). */
export const DisruptionBanner = ({ strikesOnly = false, vtcRoute = '/course?mode=standard', className = '' }) => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    transportAPI.disruptions()
      .then((r) => { if (alive) setData(r.data); })
      .catch(() => { if (alive) setData({ disruptions: [], has_strike: false, count: 0 }); });
    return () => { alive = false; };
  }, []);

  if (!data) return null;
  const all = data.disruptions || [];
  const list = strikesOnly ? all.filter((d) => d.type === 'strike') : all;
  if (list.length === 0) return null;

  const hasStrike = list.some((d) => d.type === 'strike');

  return (
    <div className={`px-4 ${className}`} data-testid="disruption-banner">
      {hasStrike ? (
        <div className="rounded-2xl bg-[#7F1D1D] text-white p-4 shadow-lg border border-red-900" data-testid="strike-banner">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shrink-0">
              <Prohibit size={22} weight="fill" className="text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.15em] text-red-300">Grève des transports</p>
              <p className="font-extrabold text-sm leading-tight mt-0.5">
                {list.find((d) => d.type === 'strike')?.title || 'Bus & TCSP fortement perturbés'}
              </p>
              <p className="text-[12px] text-white/80 mt-1 leading-snug">
                {list.find((d) => d.type === 'strike')?.message || 'Évitez l’attente : un chauffeur VTC vous emmène directement à destination.'}
              </p>
            </div>
          </div>
          <button onClick={() => navigate(vtcRoute)} data-testid="strike-book-vtc-btn"
            className="w-full mt-3 py-3 rounded-xl bg-[#FF5000] text-[#0B1426] font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <CarProfile size={18} weight="fill" /> Réserver un VTC maintenant
            <Lightning size={15} weight="fill" />
          </button>
        </div>
      ) : (
        <div className="space-y-2" data-testid="disruption-list">
          {list.map((d) => {
            const m = typeMeta(d.type);
            return (
              <div key={d.id} className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5" data-testid={`disruption-${d.id}`}>
                <m.Icon size={18} weight="fill" style={{ color: m.color }} className="shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-[#0B1426] leading-tight">{d.title}</p>
                  {d.message && <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{d.message}</p>}
                  {(d.routes || []).length > 0 && (
                    <p className="text-[10px] text-slate-400 mt-1">Lignes : {d.routes.join(', ')}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** Historique repliable des perturbations (retards / annulations passées). */
export const DisruptionHistory = ({ className = '' }) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);

  const load = useCallback(async () => {
    try { const r = await transportAPI.disruptionsHistory(); setItems(r.data.items || []); }
    catch (e) { setItems([]); }
  }, []);

  useEffect(() => { if (open && items === null) load(); }, [open, items, load]);

  return (
    <div className={`bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden ${className}`} data-testid="disruption-history">
      <button onClick={() => setOpen((o) => !o)} data-testid="disruption-history-toggle"
        className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-sm font-bold text-[#0B1426]">
          <ClockCounterClockwise size={17} className="text-[#3730A3]" weight="duotone" /> Historique des perturbations
        </span>
        <CaretDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 border-t border-gray-100 pt-2">
          {items === null ? (
            <div className="py-4 text-center"><div className="w-5 h-5 border-2 border-orange-200 border-t-[#FF5000] rounded-full animate-spin mx-auto" /></div>
          ) : items.length === 0 ? (
            <p className="text-xs text-slate-400 py-3 text-center" data-testid="disruption-history-empty">Aucune perturbation enregistrée. Réseau nominal.</p>
          ) : (
            <div className="space-y-2">
              {items.map((d) => {
                const m = typeMeta(d.type);
                return (
                  <div key={d.id} className="flex items-start gap-2.5 py-1.5" data-testid={`history-item-${d.id}`}>
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${m.color}18` }}>
                      <m.Icon size={14} weight="fill" style={{ color: m.color }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded" style={{ backgroundColor: `${m.color}18`, color: m.color }}>{m.label}</span>
                        {!d.active && <span className="text-[10px] font-semibold text-emerald-600">résolu</span>}
                      </div>
                      <p className="text-[12px] font-semibold text-[#0B1426] leading-tight mt-0.5">{d.title}</p>
                      {(d.routes || []).length > 0 && <p className="text-[10px] text-slate-400">Lignes : {d.routes.join(', ')}</p>}
                      <p className="text-[10px] text-slate-400">{fmtDate(d.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
