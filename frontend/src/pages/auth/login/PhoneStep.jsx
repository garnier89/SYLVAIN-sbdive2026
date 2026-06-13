import React from 'react';
import { ArrowRight, CaretDown, CaretRight, EnvelopeSimple, ChatCircleDots } from '@phosphor-icons/react';
import { COUNTRIES, Fab, BackBtn } from './loginConstants';
import { useLocale } from '../../../contexts/LocaleContext';
import LocaleSelector from '../../../components/LocaleSelector';

/** Step 1 — phone number entry. Auth logic (onSubmit) lives in the parent. */
export const PhoneStep = ({
  phone, setPhone, countryCode, setCountryCode,
  showCountryPicker, setShowCountryPicker, error, loading,
  onSubmit, onBack, onOtherOptions, onEmail, onOtp,
}) => {
  const { t } = useLocale();
  return (
  <div className="mobile-container min-h-screen !bg-[#1a1a2e] flex flex-col relative" data-testid="login-page">
    <BackBtn onClick={onBack} />
    <div className="absolute top-5 right-5 z-20" data-testid="login-locale-selector">
      <LocaleSelector variant="dark" />
    </div>

    <div className="px-6 mt-6">
      <h1 className="text-2xl font-bold text-white leading-tight" data-testid="login-title">{t('login.phone_title')}</h1>
      <p className="text-sm text-gray-400 mt-1">{t('login.mobile')}</p>
    </div>

    <div className="px-6 mt-4">
      <div className="flex items-center gap-0 bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <button onClick={() => setShowCountryPicker(!showCountryPicker)} className="flex items-center gap-1.5 px-3 py-4 border-r border-white/10 hover:bg-white/5 transition-colors" data-testid="country-code-btn">
          <span className="text-lg">{countryCode.flag}</span>
          <span className="text-white font-medium text-sm">{countryCode.code}</span>
          <CaretDown size={12} className="text-gray-400" />
        </button>
        <input
          type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="6 12 34 56 78"
          className="flex-1 bg-transparent px-3 py-4 text-white text-base outline-none placeholder:text-gray-500"
          data-testid="phone-input" autoFocus onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        />
      </div>

      {showCountryPicker && (
        <div className="mt-2 bg-[#2a2a3e] border border-white/10 rounded-xl max-h-48 overflow-y-auto shadow-xl z-50">
          {COUNTRIES.map((c) => (
            <button key={c.code} onClick={() => { setCountryCode(c); setShowCountryPicker(false); }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
              <span className="text-lg">{c.flag}</span>
              <span className="text-white text-sm font-medium">{c.name}</span>
              <span className="text-gray-400 text-sm ml-auto">{c.code}</span>
            </button>
          ))}
        </div>
      )}

      {/* E-mail login made visible up-front (was previously hidden behind the
          "other options" modal). */}
      {onEmail && (
        <button onClick={onEmail} data-testid="email-login-btn"
          className="w-full mt-5 flex items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-xl py-3.5 hover:bg-white/10 transition-colors">
          <EnvelopeSimple size={18} className="text-white" weight="bold" />
          <span className="text-white font-semibold text-sm">{t('login.email_continue')}</span>
        </button>
      )}

      {onOtp && (
        <button onClick={onOtp} data-testid="otp-login-btn"
          className="w-full mt-3 flex items-center justify-center gap-2 bg-[#FF5000]/10 border border-[#FF5000]/30 rounded-xl py-3.5 hover:bg-[#FF5000]/20 transition-colors">
          <ChatCircleDots size={18} className="text-[#FF5000]" weight="bold" />
          <span className="text-[#FF5000] font-semibold text-sm">Connexion par code SMS</span>
        </button>
      )}

      <button onClick={onOtherOptions} className="flex items-center gap-1.5 mt-4 mx-auto" data-testid="other-login-options-btn">
        <span className="text-[#FF5000] font-bold text-sm">{t('login.other_options')}</span>
        <CaretRight size={14} className="text-[#FF5000]" weight="bold" />
      </button>

      {error && <p className="text-red-400 text-sm mt-3" data-testid="error-message">{error}</p>}
    </div>

    <div className="px-6 mt-auto mb-4">
      <p className="text-xs text-gray-500 leading-relaxed">{t('login.terms_agree')} <span className="text-[#FF5000] underline">{t('login.terms_link')}</span></p>
    </div>

    <div className="px-6 pb-8 flex justify-end">
      <Fab onClick={onSubmit} loading={loading} Icon={ArrowRight} />
    </div>
  </div>
  );
};

export default PhoneStep;
