import React from 'react';
import { ArrowRight } from '@phosphor-icons/react';
import { BackBtn } from './loginConstants';

const Field = ({ label, hint, ...props }) => (
  <div>
    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">
      {label} {hint && <span className="text-gray-500 font-normal lowercase">{hint}</span>}
    </label>
    <input className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base outline-none focus:border-[#4a9eff] transition-colors placeholder:text-gray-500" {...props} />
  </div>
);

/** Step 3 — profile completion (new user). Auth logic (onSubmit) lives in the parent. */
export const ProfileStep = ({
  lastName, setLastName, firstName, setFirstName, email, setEmail,
  referralCode, setReferralCode, error, loading, onSubmit, onBack,
}) => (
  <div className="mobile-container min-h-screen bg-[#1a1a2e] flex flex-col" data-testid="login-page">
    <BackBtn onClick={onBack} />

    <div className="px-6 mt-6 flex-1 overflow-y-auto pb-4">
      <h1 className="text-2xl font-bold text-white mb-2" data-testid="profile-title">Complétez votre profil</h1>
      <p className="text-gray-400 text-sm mb-6">Quelques informations pour personnaliser votre expérience</p>

      <div className="space-y-4">
        <Field label="Nom *" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Dupont" data-testid="lastname-input" autoFocus />
        <Field label="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jean" data-testid="firstname-input" />
        <Field label="Email" hint="(facultatif)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jean@exemple.fr" data-testid="email-input" />
        <Field label="Code de parrainage" hint="(facultatif)" value={referralCode} onChange={(e) => setReferralCode(e.target.value)} placeholder="SB-ABC123" data-testid="referral-input" />
        {error && <p className="text-red-400 text-sm" data-testid="error-message">{error}</p>}
      </div>
    </div>

    <div className="px-6 pb-8">
      <button
        onClick={onSubmit} disabled={loading}
        className="w-full h-14 rounded-xl bg-[#4a9eff] hover:bg-[#3a8eef] text-white text-base font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-60"
        data-testid="submit-btn"
      >
        {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Créer mon compte<ArrowRight size={20} className="ml-1" /></>}
      </button>
    </div>
  </div>
);

export default ProfileStep;
