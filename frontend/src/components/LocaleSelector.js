import React, { useState } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { Globe, CurrencyEur, X, MagnifyingGlass, Check } from '@phosphor-icons/react';

const LocaleSelector = ({ variant = 'light' }) => {
  const { currency, setCurrency, language, setLanguage, currencies, languages, t } = useLocale();
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('lang');
  const [search, setSearch] = useState('');

  const filteredCurrencies = currencies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase())
  );
  const filteredLanguages = languages.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) || l.code.toLowerCase().includes(search.toLowerCase())
  );

  const triggerClass = variant === 'dark'
    ? 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors backdrop-blur-sm'
    : 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium transition-colors';

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={triggerClass}
        data-testid="locale-selector-btn"
      >
        <Globe size={14} />
        <span>{language.code.toUpperCase()}</span>
        <span className="opacity-60">|</span>
        <span>{currency.symbol}</span>
      </button>

      {showModal && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-end justify-center" data-testid="locale-modal">
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom">
            {/* Header */}
            <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                {activeTab === 'lang' ? t('profile.language') : t('wallet.amount')}
              </h2>
              <button onClick={() => { setShowModal(false); setSearch(''); }} data-testid="locale-close-btn">
                <X size={22} className="text-gray-500" />
              </button>
            </div>

            {/* Tabs */}
            <div className="px-4 pt-3 flex gap-2">
              <button onClick={() => { setActiveTab('lang'); setSearch(''); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all ${activeTab === 'lang' ? 'bg-[#FF4500] text-white' : 'bg-gray-100 text-gray-600'}`}
                data-testid="tab-lang">
                <Globe size={16} /> Langues
              </button>
              <button onClick={() => { setActiveTab('currency'); setSearch(''); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all ${activeTab === 'currency' ? 'bg-[#FF4500] text-white' : 'bg-gray-100 text-gray-600'}`}
                data-testid="tab-currency">
                <CurrencyEur size={16} /> Devises
              </button>
            </div>

            {/* Search */}
            <div className="px-4 pt-3">
              <div className="relative">
                <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full h-10 rounded-xl bg-gray-50 pl-9 pr-4 text-sm border border-gray-200"
                  placeholder={activeTab === 'lang' ? 'Rechercher une langue...' : 'Rechercher une devise...'}
                  data-testid="locale-search" />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {activeTab === 'lang' ? (
                <div className="space-y-0.5">
                  {filteredLanguages.map(lang => (
                    <button key={lang.code}
                      onClick={() => { setLanguage(lang); setShowModal(false); setSearch(''); }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${language.code === lang.code ? 'bg-[#FF4500]/10 border border-[#FF4500]/30' : 'hover:bg-gray-50'}`}
                      data-testid={`lang-${lang.code}`}>
                      <span className="text-xl">{lang.flag}</span>
                      <span className="flex-1 text-sm font-medium text-gray-800">{lang.name}</span>
                      <span className="text-xs text-gray-400 uppercase">{lang.code}</span>
                      {language.code === lang.code && <Check size={18} weight="bold" className="text-[#FF4500]" />}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredCurrencies.map(cur => (
                    <button key={cur.code}
                      onClick={() => { setCurrency(cur); setShowModal(false); setSearch(''); }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${currency.code === cur.code ? 'bg-[#FF4500]/10 border border-[#FF4500]/30' : 'hover:bg-gray-50'}`}
                      data-testid={`cur-${cur.code}`}>
                      <span className="text-xl">{cur.flag}</span>
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-800">{cur.name}</span>
                        <span className="text-xs text-gray-400 ml-2">{cur.code}</span>
                      </div>
                      <span className="text-sm font-bold text-gray-600">{cur.symbol}</span>
                      {currency.code === cur.code && <Check size={18} weight="bold" className="text-[#FF4500]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LocaleSelector;
