import React from 'react';
import { ArrowRight, Eye, EyeSlash } from '@phosphor-icons/react';
import { Fab, BackBtn } from './loginConstants';
import { useLocale } from '../../../contexts/LocaleContext';

/** Step 2 — login / create password. Auth logic (onSubmit) lives in the parent. */
export const PasswordStep = ({
  isNewUser, password, setPassword, confirmPassword, setConfirmPassword,
  showPassword, setShowPassword, countryCode, phone, error, loading, onSubmit, onBack,
}) => {
  const { t } = useLocale();
  return (
  <div className="mobile-container min-h-screen !bg-[#1a1a2e] flex flex-col" data-testid="login-page">
    <BackBtn onClick={onBack} />

    <div className="px-6 mt-6">
      <h1 className="text-2xl font-bold text-white mb-2" data-testid="password-title">
        {isNewUser ? t('login.create_password') : t('login.enter_password')}
      </h1>
      <p className="text-gray-400 text-sm mb-8">
        {isNewUser ? t('login.create_password_hint') : t('login.login_with_number', { number: `${countryCode.code} ${phone}` })}
      </p>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">{t('auth.password')}</label>
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-[#4a9eff] transition-colors">
            <input
              type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
              className="flex-1 bg-transparent px-4 py-4 text-white text-base outline-none placeholder:text-gray-500"
              data-testid="password-input" autoFocus onKeyDown={(e) => e.key === 'Enter' && !isNewUser && onSubmit()}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="px-3 text-gray-400" data-testid="toggle-password-btn">
              {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {isNewUser && (
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">{t('login.confirm_password')}</label>
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-[#4a9eff] transition-colors">
              <input
                type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••"
                className="flex-1 bg-transparent px-4 py-4 text-white text-base outline-none placeholder:text-gray-500"
                data-testid="confirm-password-input" onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
              />
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm" data-testid="error-message">{error}</p>}
      </div>
    </div>

    <div className="mt-auto px-6 pb-8 flex justify-end">
      <Fab onClick={onSubmit} loading={loading} Icon={ArrowRight} />
    </div>
  </div>
  );
};

export default PasswordStep;
