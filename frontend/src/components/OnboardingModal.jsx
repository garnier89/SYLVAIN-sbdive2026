import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Globe, CurrencyCircleDollar } from '@phosphor-icons/react';

/**
 * First-launch onboarding: lets a new visitor pick their language + currency.
 * Presentation only — the parent (LocaleProvider) owns persistence.
 */
export const OnboardingModal = ({ open, languages, currencies, initialLang, initialCurrency, onConfirm }) => {
  const [lang, setLang] = useState(initialLang);
  const [curr, setCurr] = useState(initialCurrency);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          data-testid="onboarding-modal"
        >
          <motion.div
            className="w-full max-w-[440px] bg-white rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          >
            <div className="text-center mb-5">
              <div className="text-2xl font-black text-[#0B1426]">
                Bienvenue sur <span className="text-[#FF5000]">SB Drive</span>
              </div>
              <p className="text-sm text-gray-500 mt-1">Choisissez votre langue et votre devise</p>
            </div>

            {/* Language */}
            <div className="flex items-center gap-2 mb-2">
              <Globe size={18} weight="duotone" className="text-[#FF5000]" />
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Langue</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-5 max-h-[176px] overflow-y-auto pr-1">
              {languages.map((l) => {
                const active = lang?.code === l.code;
                return (
                  <button key={l.code} onClick={() => setLang(l)} data-testid={`onboarding-lang-${l.code}`}
                    className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${active ? 'border-[#FF5000] bg-[#FFF3EC]' : 'border-gray-100 bg-white'}`}>
                    <span className="text-lg leading-none">{l.flag}</span>
                    <span className="text-sm font-semibold text-[#0B1426] truncate flex-1">{l.name}</span>
                    {active && <Check size={15} weight="bold" className="text-[#FF5000] shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Currency */}
            <div className="flex items-center gap-2 mb-2">
              <CurrencyCircleDollar size={18} weight="duotone" className="text-[#FF5000]" />
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Devise</h3>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-6 max-h-[176px] overflow-y-auto pr-1">
              {currencies.map((c) => {
                const active = curr?.code === c.code;
                return (
                  <button key={c.code} onClick={() => setCurr(c)} data-testid={`onboarding-currency-${c.code}`}
                    className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${active ? 'border-[#FF5000] bg-[#FFF3EC]' : 'border-gray-100 bg-white'}`}>
                    <span className="text-lg leading-none">{c.flag}</span>
                    <span className="text-sm font-semibold text-[#0B1426] truncate flex-1">{c.code} · {c.symbol}</span>
                    {active && <Check size={15} weight="bold" className="text-[#FF5000] shrink-0" />}
                  </button>
                );
              })}
            </div>

            <button onClick={() => onConfirm(lang, curr)} disabled={!lang || !curr} data-testid="onboarding-confirm-btn"
              className="w-full py-4 rounded-xl font-black text-lg active:scale-[0.98] transition-transform disabled:opacity-50"
              style={{ backgroundColor: '#FF5000', color: '#0B1426' }}>
              Continuer
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
