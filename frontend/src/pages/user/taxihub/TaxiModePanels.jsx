/**
 * TaxiModePanels — panneaux spécifiques par mode (datetime, flight, rental,
 * buddy, pets, assist, corporate, contact, bidding). Extrait de TaxiHubPage.js.
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarPlus, Plus, Minus } from '@phosphor-icons/react';
import { RENTAL_PACKAGES } from './taxiHubConstants';
import { useAssistTypes } from '../../../hooks/useAssistTypes';

const AssistPanel = ({ assistNeeds, setAssistNeeds }) => {
  const options = useAssistTypes();
  return (
    <div data-testid="panel-assist" className="mb-2">
      <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Type d'assistance</label>
      <div className="grid grid-cols-2 gap-2 mt-1">
        {options.map((o) => (
          <button key={o.k} onClick={() => setAssistNeeds(o.k)} data-testid={`assist-${o.k}`}
            className={`py-2 rounded-lg border text-sm font-medium ${assistNeeds === o.k ? 'border-[#F43F5E] bg-rose-50' : 'border-[#E2E8F0]'}`}>{o.l}</button>
        ))}
      </div>
    </div>
  );
};

export const TaxiModePanels = ({
  mode, scheduledAt, formatScheduled, setCalendarOpen,
  flightNumber, setFlightNumber,
  rentalPkg, setRentalPkg,
  buddyHours, setBuddyHours,
  petsCount, setPetsCount, petsSize, setPetsSize,
  assistNeeds, setAssistNeeds,
  corpAccounts, corpId, setCorpId, navigate,
  bookForName, setBookForName, bookForPhone, setBookForPhone,
  biddingFare, setBiddingFare, estimate,
}) => (
  <AnimatePresence mode="wait">
    <motion.div key={mode.panel || 'none'} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
      {mode.panel === 'datetime' && (
        <div data-testid="panel-datetime" className="mb-2">
          <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Date & heure</label>
          <button onClick={() => setCalendarOpen(true)} data-testid="datetime-trigger"
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 mt-1 text-sm text-left flex items-center justify-between hover:border-[#0B1426]">
            <span className={scheduledAt ? 'text-[#0B1426] font-semibold' : 'text-slate-400'}>{formatScheduled(scheduledAt) || 'Choisir une date'}</span>
            <CalendarPlus size={16} className="text-[#FF5000]" />
          </button>
        </div>
      )}
      {mode.panel === 'flight' && (
        <div data-testid="panel-flight" className="mb-2">
          <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">N° de vol (optionnel)</label>
          <input value={flightNumber} onChange={(e) => setFlightNumber(e.target.value.toUpperCase())} placeholder="AF1234" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="flight-number-input" />
          <p className="text-[10px] text-slate-400 mt-1">Nous suivons votre vol pour ajuster la prise en charge.</p>
        </div>
      )}
      {mode.panel === 'rental' && (
        <div data-testid="panel-rental" className="mb-2">
          <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Forfait</label>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {RENTAL_PACKAGES.map((p) => (
              <button key={p.slug} onClick={() => setRentalPkg(p.slug)} data-testid={`rental-pkg-${p.slug}`}
                className={`p-3 rounded-lg border text-center ${rentalPkg === p.slug ? 'border-[#F59E0B] bg-amber-50' : 'border-[#E2E8F0]'}`}>
                <p className="font-bold">{p.label}</p><p className="text-[10px] text-slate-400">{p.km} km</p>
              </button>
            ))}
          </div>
        </div>
      )}
      {mode.panel === 'buddy' && (
        <div data-testid="panel-buddy" className="mb-2">
          <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Durée (heures)</label>
          <div className="grid grid-cols-4 gap-2 mt-1">
            {[1, 2, 4, 8].map((h) => (
              <button key={h} onClick={() => setBuddyHours(h)} data-testid={`buddy-hours-${h}`}
                className={`p-3 rounded-lg border text-center font-bold ${buddyHours === h ? 'border-[#10B981] bg-emerald-50 text-emerald-700' : 'border-[#E2E8F0]'}`}>{h}h</button>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Un chauffeur dédié reste à votre disposition pendant toute la durée.</p>
        </div>
      )}
      {mode.panel === 'pets' && (
        <div data-testid="panel-pets" className="mb-2">
          <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Nombre d'animaux</label>
          <div className="flex items-center gap-4 mt-1 mb-3">
            <button onClick={() => setPetsCount(Math.max(1, petsCount - 1))} className="w-9 h-9 rounded-full border border-[#E2E8F0] flex items-center justify-center" data-testid="pets-minus"><Minus size={16} /></button>
            <span className="text-lg font-bold w-6 text-center" data-testid="pets-count">{petsCount}</span>
            <button onClick={() => setPetsCount(petsCount + 1)} className="w-9 h-9 rounded-full border border-[#E2E8F0] flex items-center justify-center" data-testid="pets-plus"><Plus size={16} /></button>
          </div>
          <div className="flex gap-2">
            {[{ k: 'small', l: 'Petit' }, { k: 'large', l: 'Grand' }].map((s) => (
              <button key={s.k} onClick={() => setPetsSize(s.k)} data-testid={`pets-size-${s.k}`}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium ${petsSize === s.k ? 'border-[#F97316] bg-orange-50' : 'border-[#E2E8F0]'}`}>{s.l}</button>
            ))}
          </div>
        </div>
      )}
      {mode.panel === 'assist' && (
        <AssistPanel assistNeeds={assistNeeds} setAssistNeeds={setAssistNeeds} />
      )}
      {mode.panel === 'corporate' && (
        <div data-testid="panel-corporate" className="mb-2">
          <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Compte entreprise</label>
          {corpAccounts.length > 0 ? (
            <select value={corpId} onChange={(e) => setCorpId(e.target.value)} className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="corporate-account-select">
              {corpAccounts.map((a) => <option key={a.id} value={a.join_code}>{a.name} (-{a.discount_pct}%)</option>)}
            </select>
          ) : (
            <button onClick={() => navigate('/corporate')} className="text-xs text-indigo-600 font-semibold mt-1" data-testid="join-corporate-link">Rejoindre une entreprise →</button>
          )}
        </div>
      )}
      {mode.panel === 'contact' && (
        <div data-testid="panel-contact" className="mb-2 space-y-2">
          <div>
            <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Nom du passager</label>
            <input value={bookForName} onChange={(e) => setBookForName(e.target.value)} placeholder="Ex: Marie" className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="book-for-name-input" />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Téléphone</label>
            <input value={bookForPhone} onChange={(e) => setBookForPhone(e.target.value)} placeholder="+33..." className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="book-for-phone-input" />
          </div>
        </div>
      )}
      {mode.panel === 'bidding' && (
        <div data-testid="panel-bidding" className="mb-2">
          <label className="text-[10px] tracking-[0.1em] uppercase font-bold text-slate-500">Votre prix proposé (€)</label>
          <input type="number" value={biddingFare} onChange={(e) => setBiddingFare(e.target.value)} placeholder={estimate?.estimated_fare ? `Suggéré: ${estimate.estimated_fare.toFixed(2)}` : '15.00'} className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2 mt-1 text-sm" data-testid="bidding-fare-input" />
          <p className="text-[10px] text-slate-400 mt-1">Les chauffeurs proches verront votre offre et pourront l'accepter.</p>
        </div>
      )}
    </motion.div>
  </AnimatePresence>
);
