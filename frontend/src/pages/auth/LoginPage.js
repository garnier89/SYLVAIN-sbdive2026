import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, ArrowRight, Eye, EyeSlash, X, CaretRight, CaretDown } from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Country codes with flags
const COUNTRIES = [
  { code: '+33', flag: '🇫🇷', name: 'France' },
  { code: '+1', flag: '🇺🇸', name: 'USA' },
  { code: '+44', flag: '🇬🇧', name: 'UK' },
  { code: '+49', flag: '🇩🇪', name: 'Allemagne' },
  { code: '+34', flag: '🇪🇸', name: 'Espagne' },
  { code: '+39', flag: '🇮🇹', name: 'Italie' },
  { code: '+32', flag: '🇧🇪', name: 'Belgique' },
  { code: '+41', flag: '🇨🇭', name: 'Suisse' },
  { code: '+212', flag: '🇲🇦', name: 'Maroc' },
  { code: '+237', flag: '🇨🇲', name: 'Cameroun' },
  { code: '+225', flag: '🇨🇮', name: "Côte d'Ivoire" },
  { code: '+221', flag: '🇸🇳', name: 'Sénégal' },
];

const LoginPage = () => {
  const navigate = useNavigate();
  const { loginWithGoogle, setUser } = useAuth();

  // Steps: 'phone' → 'password' → 'profile'
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState(COUNTRIES[0]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getFullPhone = () => `${countryCode.code} ${phone.trim()}`;

  /* ── Step 1: Check phone ── */
  const handleCheckPhone = async () => {
    if (!phone.trim()) {
      setError('Veuillez entrer votre numéro de mobile');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/check-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: getFullPhone() }),
      });
      const data = await res.json();
      setIsNewUser(!data.exists);
      setStep('password');
    } catch {
      setError('Erreur de connexion. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  /* ── Step 2: Login or create password ── */
  const handlePassword = async () => {
    if (!password) {
      setError('Veuillez entrer un mot de passe');
      return;
    }
    if (isNewUser) {
      if (password.length < 6) {
        setError('Le mot de passe doit contenir au moins 6 caractères');
        return;
      }
      if (password !== confirmPassword) {
        setError('Les mots de passe ne correspondent pas');
        return;
      }
      setError('');
      setStep('profile');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/phone-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone: getFullPhone(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Mot de passe incorrect');
        return;
      }
      if (data.access_token) {
        // Token managed via httpOnly cookies set by backend
      }
      setUser(data.user);
      navigate('/home');
    } catch (err) {
      console.error('Phone login error:', err);
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  /* ── Step 3: Complete profile ── */
  const handleRegister = async () => {
    if (!lastName.trim()) {
      setError('Veuillez entrer votre nom');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/phone-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          phone: getFullPhone(),
          password,
          name: lastName.trim(),
          first_name: firstName.trim(),
          email: email.trim() || undefined,
          referral_code: referralCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Erreur lors de l'inscription");
        return;
      }
      setUser(data.user);
      navigate('/home');
    } catch (err) {
      console.error('Register error:', err);
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setError('');
    if (step === 'profile') setStep('password');
    else if (step === 'password') { setStep('phone'); setPassword(''); setConfirmPassword(''); }
    else navigate(-1);
  };

  // ══════════════════════════════════════
  //  PHONE STEP (V3Cube Dark Theme)
  // ══════════════════════════════════════
  if (step === 'phone') {
    return (
      <div className="mobile-container min-h-screen bg-[#1a1a2e] flex flex-col relative" data-testid="login-page">
        {/* Back Button */}
        <div className="px-4 pt-5">
          <button
            onClick={goBack}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
            data-testid="back-btn"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
        </div>

        {/* Title */}
        <div className="px-6 mt-6">
          <h1 className="text-2xl font-bold text-white leading-tight" data-testid="login-title">
            Entrez votre numéro{'\n'}de mobile
          </h1>
          <p className="text-sm text-gray-400 mt-1">Mobile</p>
        </div>

        {/* Phone Input */}
        <div className="px-6 mt-4">
          <div className="flex items-center gap-0 bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            {/* Country code selector */}
            <button
              onClick={() => setShowCountryPicker(!showCountryPicker)}
              className="flex items-center gap-1.5 px-3 py-4 border-r border-white/10 hover:bg-white/5 transition-colors"
              data-testid="country-code-btn"
            >
              <span className="text-lg">{countryCode.flag}</span>
              <span className="text-white font-medium text-sm">{countryCode.code}</span>
              <CaretDown size={12} className="text-gray-400" />
            </button>
            {/* Phone input */}
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="6 12 34 56 78"
              className="flex-1 bg-transparent px-3 py-4 text-white text-base outline-none placeholder:text-gray-500"
              data-testid="phone-input"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCheckPhone()}
            />
          </div>

          {/* Country Picker Dropdown */}
          {showCountryPicker && (
            <div className="mt-2 bg-[#2a2a3e] border border-white/10 rounded-xl max-h-48 overflow-y-auto shadow-xl z-50">
              {COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  onClick={() => { setCountryCode(c); setShowCountryPicker(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                >
                  <span className="text-lg">{c.flag}</span>
                  <span className="text-white text-sm font-medium">{c.name}</span>
                  <span className="text-gray-400 text-sm ml-auto">{c.code}</span>
                </button>
              ))}
            </div>
          )}

          {/* Other Login Options Link */}
          <button
            onClick={() => setShowAccountModal(true)}
            className="flex items-center gap-1.5 mt-5"
            data-testid="other-login-options-btn"
          >
            <span className="text-[#4a9eff] font-bold text-sm">Ou choisir une autre option de connexion</span>
            <CaretRight size={14} className="text-[#4a9eff]" weight="bold" />
          </button>

          {error && (
            <p className="text-red-400 text-sm mt-3" data-testid="error-message">{error}</p>
          )}
        </div>

        {/* Terms */}
        <div className="px-6 mt-auto mb-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            En continuant, j'accepte les{' '}
            <span className="text-[#4a9eff] underline">Conditions Générales</span>
          </p>
        </div>

        {/* FAB Button */}
        <div className="px-6 pb-8 flex justify-end">
          <button
            onClick={handleCheckPhone}
            disabled={loading}
            className="w-14 h-14 rounded-full bg-[#4a9eff] hover:bg-[#3a8eef] flex items-center justify-center shadow-lg shadow-blue-500/30 transition-all disabled:opacity-60"
            data-testid="submit-btn"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <ArrowRight size={22} className="text-white" weight="bold" />
            )}
          </button>
        </div>

        {/* ═══ "Choose an account" Modal ═══ */}
        {showAccountModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" data-testid="account-modal">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowAccountModal(false)} />
            <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl pb-8 animate-slide-up">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4">
                <h3 className="text-lg font-bold text-gray-900">Choisir un compte</h3>
                <button
                  onClick={() => setShowAccountModal(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
                  data-testid="close-modal-btn"
                >
                  <X size={16} className="text-gray-600" />
                </button>
              </div>

              {/* Account Options */}
              <div className="px-2">
                {/* Apple */}
                <button className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 rounded-xl transition-colors" data-testid="login-apple-btn">
                  <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center">
                    <svg width="18" height="22" viewBox="0 0 18 22" fill="white">
                      <path d="M14.94 11.58c-.03-2.87 2.34-4.25 2.45-4.32-1.33-1.95-3.41-2.22-4.15-2.25-1.76-.18-3.45 1.04-4.34 1.04-.9 0-2.28-1.01-3.75-.99-1.93.03-3.72 1.13-4.71 2.86-2.01 3.5-.51 8.68 1.45 11.52.96 1.39 2.1 2.95 3.61 2.89 1.45-.06 1.99-.94 3.74-.94 1.74 0 2.24.94 3.76.91 1.56-.03 2.54-1.41 3.49-2.81 1.1-1.61 1.55-3.17 1.58-3.25-.03-.01-3.03-1.16-3.06-4.62l-.07-.04z"/>
                      <path d="M12.14 3.54C12.95 2.55 13.5 1.2 13.35 0c-1.18.05-2.62.79-3.46 1.78-.76.88-1.42 2.28-1.24 3.62 1.31.1 2.65-.67 3.49-1.86z"/>
                    </svg>
                  </div>
                  <span className="text-base font-medium text-gray-900 flex-1 text-left">Apple</span>
                  <CaretRight size={18} className="text-gray-400" />
                </button>

                {/* Google */}
                <button
                  onClick={() => { setShowAccountModal(false); loginWithGoogle(); }}
                  className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 rounded-xl transition-colors"
                  data-testid="login-google-btn"
                >
                  <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  </div>
                  <span className="text-base font-medium text-gray-900 flex-1 text-left">Google</span>
                  <CaretRight size={18} className="text-gray-400" />
                </button>

                {/* Facebook */}
                <button className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 rounded-xl transition-colors" data-testid="login-facebook-btn">
                  <div className="w-10 h-10 rounded-full bg-[#1877F2] flex items-center justify-center">
                    <svg width="12" height="22" viewBox="0 0 12 22" fill="white">
                      <path d="M11.34 0H8.5C6.06 0 3.88 1.34 3.88 4.36v2.14H1v3.64h2.88V22h4.12V10.14h3.06l.36-3.64H8V4.68c0-1.18.36-1.88 1.64-1.88H11.34V0z"/>
                    </svg>
                  </div>
                  <span className="text-base font-medium text-gray-900 flex-1 text-left">Facebook</span>
                  <CaretRight size={18} className="text-gray-400" />
                </button>

                {/* Face ID / Touch ID */}
                <button className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 rounded-xl transition-colors" data-testid="login-biometric-btn">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                      <path d="M7 3H5a2 2 0 00-2 2v2M17 3h2a2 2 0 012 2v2M7 21H5a2 2 0 01-2-2v-2M17 21h2a2 2 0 002-2v-2"/>
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M12 5v2M12 17v2M5 12h2M17 12h2"/>
                    </svg>
                  </div>
                  <span className="text-base font-medium text-gray-900 flex-1 text-left">Face ID / Touch ID</span>
                  <CaretRight size={18} className="text-gray-400" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════
  //  PASSWORD STEP (Dark Theme)
  // ══════════════════════════════════════
  if (step === 'password') {
    return (
      <div className="mobile-container min-h-screen bg-[#1a1a2e] flex flex-col" data-testid="login-page">
        <div className="px-4 pt-5">
          <button
            onClick={goBack}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
            data-testid="back-btn"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
        </div>

        <div className="px-6 mt-6">
          <h1 className="text-2xl font-bold text-white mb-2" data-testid="password-title">
            {isNewUser ? 'Créer un mot de passe' : 'Entrez votre mot de passe'}
          </h1>
          <p className="text-gray-400 text-sm mb-8">
            {isNewUser
              ? 'Choisissez un mot de passe sécurisé pour votre compte'
              : `Connectez-vous avec le numéro ${countryCode.code} ${phone}`}
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">
                Mot de passe
              </label>
              <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-[#4a9eff] transition-colors">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="flex-1 bg-transparent px-4 py-4 text-white text-base outline-none placeholder:text-gray-500"
                  data-testid="password-input"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && !isNewUser && handlePassword()}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="px-3 text-gray-400"
                  data-testid="toggle-password-btn"
                >
                  {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {isNewUser && (
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">
                  Confirmer le mot de passe
                </label>
                <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-[#4a9eff] transition-colors">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="flex-1 bg-transparent px-4 py-4 text-white text-base outline-none placeholder:text-gray-500"
                    data-testid="confirm-password-input"
                    onKeyDown={(e) => e.key === 'Enter' && handlePassword()}
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="text-red-400 text-sm" data-testid="error-message">{error}</p>
            )}
          </div>
        </div>

        {/* FAB */}
        <div className="mt-auto px-6 pb-8 flex justify-end">
          <button
            onClick={handlePassword}
            disabled={loading}
            className="w-14 h-14 rounded-full bg-[#4a9eff] hover:bg-[#3a8eef] flex items-center justify-center shadow-lg shadow-blue-500/30 transition-all disabled:opacity-60"
            data-testid="submit-btn"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <ArrowRight size={22} className="text-white" weight="bold" />
            )}
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════
  //  PROFILE STEP (Dark Theme)
  // ══════════════════════════════════════
  return (
    <div className="mobile-container min-h-screen bg-[#1a1a2e] flex flex-col" data-testid="login-page">
      <div className="px-4 pt-5">
        <button
          onClick={goBack}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
          data-testid="back-btn"
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
      </div>

      <div className="px-6 mt-6 flex-1 overflow-y-auto pb-4">
        <h1 className="text-2xl font-bold text-white mb-2" data-testid="profile-title">Complétez votre profil</h1>
        <p className="text-gray-400 text-sm mb-6">
          Quelques informations pour personnaliser votre expérience
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">Nom *</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Dupont"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base outline-none focus:border-[#4a9eff] transition-colors placeholder:text-gray-500"
              data-testid="lastname-input"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">Prénom</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Jean"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base outline-none focus:border-[#4a9eff] transition-colors placeholder:text-gray-500"
              data-testid="firstname-input"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">
              Email <span className="text-gray-500 font-normal lowercase">(facultatif)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jean@exemple.fr"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base outline-none focus:border-[#4a9eff] transition-colors placeholder:text-gray-500"
              data-testid="email-input"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">
              Code de parrainage <span className="text-gray-500 font-normal lowercase">(facultatif)</span>
            </label>
            <input
              type="text"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              placeholder="SB-ABC123"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base outline-none focus:border-[#4a9eff] transition-colors placeholder:text-gray-500"
              data-testid="referral-input"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm" data-testid="error-message">{error}</p>
          )}
        </div>
      </div>

      {/* Register Button */}
      <div className="px-6 pb-8">
        <button
          onClick={handleRegister}
          disabled={loading}
          className="w-full h-14 rounded-xl bg-[#4a9eff] hover:bg-[#3a8eef] text-white text-base font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-60"
          data-testid="submit-btn"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>Créer mon compte<ArrowRight size={20} className="ml-1" /></>
          )}
        </button>
      </div>
    </div>
  );
};

export default LoginPage;
