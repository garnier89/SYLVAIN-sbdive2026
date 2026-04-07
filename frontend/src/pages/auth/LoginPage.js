import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, ArrowRight, Eye, EyeSlash } from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const LoginPage = () => {
  const navigate = useNavigate();
  const { checkAuth, setUser } = useAuth();

  // Steps: 'phone' → 'password' → 'profile' (profile only for new users)
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
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

  /* ── Step 1: Check phone ── */
  const getFullPhone = () => `+33 ${phone.trim()}`;
  
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
      // Go to profile step
      setError('');
      setStep('profile');
      return;
    }

    // Existing user → login
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
        localStorage.setItem('token', data.access_token);
      }
      setUser(data.user);
      navigate('/home');
    } catch {
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  /* ── Step 3: Complete profile (new users only) ── */
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
        setError(data.detail || 'Erreur lors de l\'inscription');
        return;
      }
      if (data.access_token) {
        localStorage.setItem('token', data.access_token);
      }
      setUser(data.user);
      navigate('/home');
    } catch {
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

  return (
    <div className="mobile-container min-h-screen bg-white flex flex-col" data-testid="login-page">
      {/* Header */}
      <div className="flex items-center px-4 pt-5 pb-2">
        <button
          onClick={goBack}
          className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
          data-testid="back-btn"
        >
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
      </div>

      <div className="flex-1 px-6 pt-4">
        {/* ═══ STEP 1: PHONE ═══ */}
        {step === 'phone' && (
          <div data-testid="step-phone">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Entrez votre mobile</h1>
            <p className="text-gray-500 text-sm mb-8">
              Nous vérifierons si vous avez déjà un compte
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Numéro de mobile
                </label>
                <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden focus-within:border-[#FF4500] transition-colors">
                  <span className="px-3 py-3.5 bg-gray-50 text-sm font-semibold text-gray-600 border-r border-gray-200">
                    +33
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="6 12 34 56 78"
                    className="flex-1 px-3 py-3.5 text-base outline-none"
                    data-testid="phone-input"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleCheckPhone()}
                  />
                </div>
              </div>

              {error && (
                <p className="text-red-500 text-sm" data-testid="error-message">{error}</p>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP 2: PASSWORD ═══ */}
        {step === 'password' && (
          <div data-testid="step-password">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {isNewUser ? 'Créer un mot de passe' : 'Entrez votre mot de passe'}
            </h1>
            <p className="text-gray-500 text-sm mb-8">
              {isNewUser
                ? 'Choisissez un mot de passe sécurisé pour votre compte'
                : `Connectez-vous avec le numéro ${phone}`}
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Mot de passe
                </label>
                <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden focus-within:border-[#FF4500] transition-colors">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="flex-1 px-4 py-3.5 text-base outline-none"
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
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                    Confirmer le mot de passe
                  </label>
                  <div className="flex items-center border-2 border-gray-200 rounded-xl overflow-hidden focus-within:border-[#FF4500] transition-colors">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="flex-1 px-4 py-3.5 text-base outline-none"
                      data-testid="confirm-password-input"
                      onKeyDown={(e) => e.key === 'Enter' && handlePassword()}
                    />
                  </div>
                </div>
              )}

              {error && (
                <p className="text-red-500 text-sm" data-testid="error-message">{error}</p>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP 3: PROFILE (New users only) ═══ */}
        {step === 'profile' && (
          <div data-testid="step-profile">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Complétez votre profil</h1>
            <p className="text-gray-500 text-sm mb-8">
              Quelques informations pour personnaliser votre expérience
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Nom *
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Dupont"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3.5 text-base outline-none focus:border-[#FF4500] transition-colors"
                  data-testid="lastname-input"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Prénom
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jean"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3.5 text-base outline-none focus:border-[#FF4500] transition-colors"
                  data-testid="firstname-input"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Email <span className="text-gray-400 font-normal lowercase">(facultatif)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jean@exemple.fr"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3.5 text-base outline-none focus:border-[#FF4500] transition-colors"
                  data-testid="email-input"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Code de parrainage <span className="text-gray-400 font-normal lowercase">(facultatif)</span>
                </label>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  placeholder="ABC123"
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3.5 text-base outline-none focus:border-[#FF4500] transition-colors"
                  data-testid="referral-input"
                />
              </div>

              {error && (
                <p className="text-red-500 text-sm" data-testid="error-message">{error}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom FAB */}
      <div className="px-6 pb-8 pt-4">
        <button
          onClick={step === 'phone' ? handleCheckPhone : step === 'password' ? handlePassword : handleRegister}
          disabled={loading}
          className="w-full h-14 rounded-xl bg-[#FF4500] hover:bg-[#E03D00] text-white text-base font-bold flex items-center justify-center gap-2 transition-colors shadow-lg disabled:opacity-60"
          data-testid="submit-btn"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              {step === 'phone' && 'Suivant'}
              {step === 'password' && (isNewUser ? 'Suivant' : 'Se connecter')}
              {step === 'profile' && 'Créer mon compte'}
              <ArrowRight size={20} className="ml-1" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default LoginPage;
