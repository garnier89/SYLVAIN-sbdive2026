/**
 * TaxiModeGrid — vue grille de sélection des 16 modes (vue "Plus de Services").
 * Les services planifiés hors créneau restent visibles (grisés + badge "Dispo 7h-10h"
 * + bouton "Me prévenir à l'ouverture"). Les services désactivés manuellement sont masqués.
 */
import React from 'react';
import { Clock, BellSimple, BellSimpleRinging, Bus, CaretRight } from '@phosphor-icons/react';
import { MODES, CATS } from './taxiHubConstants';
import { CategoryGlyph } from '../../../components/DynamicIcon';

const RemindButton = ({ mode, name, reminded, onToggleRemind }) => (
  <span
    role="button"
    tabIndex={0}
    data-testid={`remind-btn-${mode}`}
    onClick={(e) => { e.stopPropagation(); onToggleRemind(mode, name); }}
    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onToggleRemind(mode, name); } }}
    className={`mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${reminded ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
  >
    {reminded ? <BellSimpleRinging size={11} weight="fill" /> : <BellSimple size={11} weight="bold" />}
    {reminded ? 'Prévenu' : 'Me prévenir'}
  </span>
);

export const TaxiModeGrid = ({ catConfig, onSelect, remindedKeys = new Set(), onToggleRemind, onPublicTransport }) => (
  <div className="px-5 -mt-3" data-testid="mode-grid-view">
    {/* Brique neutre — Transports publics (à côté de la liste des taxis) */}
    {onPublicTransport && (
      <button onClick={onPublicTransport} data-testid="public-transport-btn"
        className="w-full mb-5 rounded-xl border border-[#E2E8F0] bg-white p-3.5 flex items-center gap-3 text-left hover:border-[#3730A3] transition-colors">
        <span className="w-11 h-11 rounded-xl bg-[#EEF2FF] flex items-center justify-center flex-shrink-0">
          <Bus size={24} weight="duotone" className="text-[#3730A3]" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-[#0B1426] leading-tight">Transport public</p>
          <p className="text-[11px] text-slate-400">Bus, tram & BRT · arrêts et horaires proches</p>
        </div>
        <CaretRight size={16} className="text-slate-300 flex-shrink-0" />
      </button>
    )}
    {CATS.map((cat) => (
      <div key={cat.key} className="mb-5">
        <p className="text-[11px] tracking-[0.12em] uppercase font-bold text-slate-500 mb-2">{cat.title}</p>
        <div className={cat.key === 'everyday' ? 'grid grid-cols-2 gap-3' : cat.key === 'time' ? 'flex overflow-x-auto gap-3 pb-2 hide-scrollbar' : 'flex flex-wrap gap-2'}>
          {MODES
            .filter((m) => m.cat === cat.key && (catConfig[m.id]?.active !== false))
            .sort((a, b) => (catConfig[a.id]?.order ?? 99) - (catConfig[b.id]?.order ?? 99))
            .map((m) => {
            const MIcon = m.icon;
            const cfg = catConfig[m.id];
            const unavailable = cfg?.available === false;
            const hint = cfg?.hint;
            const reminded = remindedKeys.has(m.id);
            if (cat.key === 'special') {
              return (
                <button key={m.id} data-testid={`mode-select-${m.id}`} onClick={() => onSelect(m.id)}
                  className={`px-3.5 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5 border transition-colors bg-white text-[#0B1426] border-[#E2E8F0] ${unavailable ? 'opacity-70' : ''}`}>
                  {cfg?.icon
                    ? <CategoryGlyph icon={cfg.icon} Fallback={MIcon} size={16} />
                    : <MIcon size={16} style={{ color: m.color }} />} {cfg?.name || m.label}
                  {unavailable && hint && <span className="text-[9px] font-bold text-amber-600 flex items-center gap-0.5" data-testid={`mode-hint-${m.id}`}><Clock size={9} weight="bold" />{hint.replace('Dispo ', '')}</span>}
                  {unavailable && onToggleRemind && <RemindButton mode={m.id} name={cfg?.name || m.label} reminded={reminded} onToggleRemind={onToggleRemind} />}
                </button>
              );
            }
            return (
              <button key={m.id} data-testid={`mode-select-${m.id}`} onClick={() => onSelect(m.id)}
                className={`relative ${cat.key === 'everyday' ? 'aspect-[1.4]' : 'min-w-[136px]'} rounded-xl p-3 flex flex-col justify-between border text-left transition-all bg-white text-[#0B1426] border-[#E2E8F0] hover:border-[#0B1426] ${unavailable ? 'opacity-70' : ''}`}>
                {unavailable && hint ? (
                  <span className="absolute top-2 right-2 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-0.5" data-testid={`mode-hint-${m.id}`}><Clock size={8} weight="bold" />{hint.replace('Dispo ', '')}</span>
                ) : m.badge ? (
                  <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#FF5000] text-[#0B1426]">{m.badge}</span>
                ) : null}
                {cfg?.icon
                  ? <CategoryGlyph icon={cfg.icon} Fallback={MIcon} size={26} />
                  : <MIcon size={26} weight={cat.key === 'everyday' ? 'duotone' : 'regular'} style={{ color: m.color }} />}
                <div>
                  <p className="font-bold text-sm leading-tight">{cfg?.name || m.label}</p>
                  <p className="text-[10px] text-slate-400">{m.sub}</p>
                  {unavailable && onToggleRemind && <RemindButton mode={m.id} name={cfg?.name || m.label} reminded={reminded} onToggleRemind={onToggleRemind} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    ))}
  </div>
);
