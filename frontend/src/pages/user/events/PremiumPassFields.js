import React from 'react';
import { Crown } from '@phosphor-icons/react';
import { TRANSPORT_CHOICES, BLANK_PREMIUM_PASS } from './eventsShared';

/** Reusable "Pass Premium (VIP)" configuration block for event forms. */
const PremiumPassFields = ({ value, onChange, inputClass = 'inp', accent = '#B91C1C' }) => {
  const pp = { ...BLANK_PREMIUM_PASS, ...(value || {}) };
  const set = (k, v) => onChange({ ...pp, [k]: v });
  const perksText = Array.isArray(pp.perks) ? pp.perks.join('\n') : (pp.perks || '');
  const transports = TRANSPORT_CHOICES.filter((c) => c.key !== 'none' && !c.disabled);

  return (
    <div className="border-t pt-3" data-testid="premium-pass-section">
      <label className="flex items-center gap-2 text-sm font-bold mb-2 cursor-pointer">
        <input type="checkbox" checked={!!pp.enabled} onChange={(e) => set('enabled', e.target.checked)} data-testid="pp-enabled" />
        <Crown size={16} weight="fill" className="text-amber-500" /> Pass Premium (VIP) — billet + transport + avantages
      </label>
      {pp.enabled && (
        <div className="space-y-2 pl-1">
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} placeholder="Nom du pass" value={pp.name} onChange={(e) => set('name', e.target.value)} data-testid="pp-name" />
            <select className={inputClass} value={pp.transport_option} onChange={(e) => set('transport_option', e.target.value)} data-testid="pp-transport">
              {transports.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} type="number" placeholder="Prix (€)" value={pp.price} onChange={(e) => set('price', e.target.value)} data-testid="pp-price" />
            <input className={inputClass} type="number" placeholder="Quantité" value={pp.quantity_total} onChange={(e) => set('quantity_total', e.target.value)} data-testid="pp-qty" />
          </div>
          <textarea className={inputClass} rows={3} placeholder="Avantages VIP (un par ligne)&#10;Ex. Accès loge VIP&#10;Boisson offerte" value={perksText}
            onChange={(e) => set('perks', e.target.value.split('\n'))} data-testid="pp-perks" />
          <p className="text-[11px] text-gray-400">Le transport SB Drive est inclus dans le prix du pass.</p>
        </div>
      )}
    </div>
  );
};

export default PremiumPassFields;
