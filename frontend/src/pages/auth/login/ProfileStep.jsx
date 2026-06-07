import React from 'react';
import { ArrowRight } from '@phosphor-icons/react';
import { BackBtn } from './loginConstants';
import { useLocale } from '../../../contexts/LocaleContext';

const Field = ({ label, hint, ...props }) => (
  <div>
    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">
      {label} {hint && <span className="text-gray-500 font-normal lowercase">{hint}</span>}
    </label>
    <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base outline-none focus:border-[#FF5000] transition-colors placeholder:text-gray-500" {...props} />
  </div>
);

/** Step 3 — profile completion (new user). Auth logic (onSubmit) lives in the parent. */
export const ProfileStep = ({
  lastName, setLastName, firstName, setFirstName, email, setEmail,
  referralCode, setReferralCode, error, loading, onSubmit, onBack,
}) => {
  const { t } = useLocale();
  return (
  <div className="mobile-container min-h-screen !bg-[#1a1a2e] flex flex-col" data-testid="login-page">
    <BackBtn onClick={onBack} />

    <div className="px-6 mt-6 flex-1 overflow-y-auto pb-4">
      <h1 className="text-2xl font-bold text-white mb-2" data-testid="profile-title">{t('login.complete_profile')}</h1>
      <p className="text-gray-400 text-sm mb-6">{t('login.complete_profile_hint')}</p>

      <div className="space-y-4">
        <Field label={`${t('login.lastname')} *`} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Dupont" data-testid="lastname-input" autoFocus />
        <Field label={t('login.firstname')} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jean" data-testid="firstname-input" />
        <Field label={t('auth.email')} hint={t('login.optional')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jean@exemple.fr" data-testid="email-input" />
        <Field label={t('login.referral_code')} hint={t('login.optional')} value={referralCode} onChange={(e) => setReferralCode(e.target.value)} placeholder="SB-ABC123" data-testid="referral-input" />
        {error && <p className="text-red-400 text-sm" data-testid="error-message">{error}</p>}
      </div>
    </div>

    <div className="px-6 pb-8">
      <button
        onClick={onSubmit} disabled={loading}
        className="w-full h-14 rounded-xl bg-[#FF5000] hover:bg-[#E54800] text-white text-base font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-60"
        data-testid="submit-btn"
      >
        {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>{t('login.create_account')}<ArrowRight size={20} className="ml-1" /></>}
      </button>
    </div>
  </div>
  );
};

export default ProfileStep;
