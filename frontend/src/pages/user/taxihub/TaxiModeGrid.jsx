/**
 * TaxiModeGrid — vue grille de sélection des 16 modes (vue "Plus de Services").
 * Extrait de TaxiHubPage.js (présentation pure).
 */
import React from 'react';
import { MODES, CATS } from './taxiHubConstants';

export const TaxiModeGrid = ({ catConfig, onSelect }) => (
  <div className="px-5 -mt-3" data-testid="mode-grid-view">
    {CATS.map((cat) => (
      <div key={cat.key} className="mb-5">
        <p className="text-[11px] tracking-[0.12em] uppercase font-bold text-slate-500 mb-2">{cat.title}</p>
        <div className={cat.key === 'everyday' ? 'grid grid-cols-2 gap-3' : cat.key === 'time' ? 'flex overflow-x-auto gap-3 pb-2 hide-scrollbar' : 'flex flex-wrap gap-2'}>
          {MODES.filter((m) => m.cat === cat.key && (catConfig[m.id]?.active !== false)).map((m) => {
            const MIcon = m.icon;
            if (cat.key === 'special') {
              return (
                <button key={m.id} data-testid={`mode-select-${m.id}`} onClick={() => onSelect(m.id)}
                  className="px-3.5 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5 border transition-colors bg-white text-[#0B1426] border-[#E2E8F0]">
                  <MIcon size={16} style={{ color: m.color }} /> {catConfig[m.id]?.name || m.label}
                </button>
              );
            }
            return (
              <button key={m.id} data-testid={`mode-select-${m.id}`} onClick={() => onSelect(m.id)}
                className={`relative ${cat.key === 'everyday' ? 'aspect-[1.4]' : 'min-w-[136px]'} rounded-xl p-3 flex flex-col justify-between border text-left transition-all bg-white text-[#0B1426] border-[#E2E8F0] hover:border-[#0B1426]`}>
                {m.badge && <span className="absolute top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#FF5000] text-[#0B1426]">{m.badge}</span>}
                <MIcon size={26} weight={cat.key === 'everyday' ? 'duotone' : 'regular'} style={{ color: m.color }} />
                <div>
                  <p className="font-bold text-sm leading-tight">{catConfig[m.id]?.name || m.label}</p>
                  <p className="text-[10px] text-slate-400">{m.sub}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    ))}
  </div>
);
