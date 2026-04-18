import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, ArrowRight, Eye, EyeSlash, CaretDown, CaretRight, SteeringWheel, X } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const COUNTRIES = [
  { code: '+33', flag: '\u{1F1EB}\u{1F1F7}', name: 'France' },
  { code: '+1', flag: '\u{1F1FA}\u{1F1F8}', name: 'USA' },
  { code: '+44', flag: '\u{1F1EC}\u{1F1E7}', name: 'UK' },
  { code: '+49', flag: '\u{1F1E9}\u{1F1EA}', name: 'Allemagne' },
  { code: '+237', flag: '\u{1F1E8}\u{1F1F2}', name: 'Cameroun' },
  { code: '+225', flag: '\u{1F1E8}\u{1F1EE}', name: "C\u00f4te d'Ivoire" },
  { code: '+221', flag: '\u{1F1F8}\u{1F1F3}', name: 'S\u00e9n\u00e9gal' },
  { code: '+212', flag: '\u{1F1F2}\u{1F1E6}', name: 'Maroc' },
];

const ChauffeurLogin = () => {
  const navigate = useNavigate();
  const { setUser, loginWithGoogle } = useAuth();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState(COUNTRIES[0]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getFullPhone = () => `${countryCode.code} ${phone.trim()}`;

  const handleCheckPhone = async () => {
    if (!phone.trim()) { setError('Entrez votre num\u00e9ro de mobile'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/check-phone`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: getFullPhone() }),
      });
      const data = await res.json();
      setIsNewUser(!data.exists);
      setStep('password');
    } catch { setError('Erreur de connexion'); }
    finally { setLoading(false); }
  };

  const handlePassword = async () => {
    if (!password) { setError('Entrez un mot de passe'); return; }
    if (isNewUser) {
      if (password.length < 6) { setError('Min. 6 caract\u00e8res'); return; }
      if (password !== confirmPassword) { setError('Mots de passe diff\u00e9rents'); return; }
      setStep('profile'); setError(''); return;
    }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/phone-login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ phone: getFullPhone(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Mot de passe incorrect'); return; }
      if (data.user.role !== 'driver') {
        setError("Ce compte n'est pas un compte chauffeur");
        return;
      }
      setUser(data.user);
      navigate('/chauffeur/home');
    } catch (err) { console.error('Login error:', err); setError('Erreur de connexion'); }
    finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!name.trim()) { setError('Entrez votre nom'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/phone-register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          phone: getFullPhone(), password, name: name.trim(),
          email: email.trim() || undefined, role: 'driver',
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Erreur d'inscription"); return; }
      setUser(data.user);
      navigate('/chauffeur/home');
    } catch (err) { console.error('Register error:', err); setError('Erreur de connexion'); }
    finally { setLoading(false); }
  };

  const goBack = () => {
    setError('');
    if (step === 'profile') setStep('password');
    else if (step === 'password') { setStep('phone'); setPassword(''); setConfirmPassword(''); }
    else navigate('/chauffeur');
  };

  // ══════════════════════════════════════
  //  PHONE STEP - Dark Theme (Amber accent)
  // ══════════════════════════════════════
  if (step === 'phone') {
    return (
      <div className="mobile-container min-h-screen bg-[#1a1a2e] flex flex-col relative" data-testid="chauffeur-login-page">
        <div className="px-4 pt-5 flex items-center gap-3">
          <button onClick={goBack} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center" data-testid="back-btn">
            <ArrowLeft size={20} className="text-white" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <SteeringWheel size={18} className="text-white" weight="bold" />
            </div>
            <span className="text-white font-bold text-sm">CHAUFFEUR</span>
          </div>
        </div>
        <div className="px-6 mt-6">
          <h1 className="text-2xl font-bold text-white leading-tight" data-testid="login-title">
            Entrez votre num&eacute;ro{'\n'}de mobile
          </h1>
          <p className="text-sm text-gray-400 mt-1">Connexion chauffeur</p>
        </div>
        <div className="px-6 mt-4">
          <div className="flex items-center gap-0 bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <button onClick={() => setShowCountryPicker(!showCountryPicker)}
              className="flex items-center gap-1.5 px-3 py-4 border-r border-white/10 hover:bg-white/5 transition-colors" data-testid="country-code-btn">
              <span className="text-lg">{countryCode.flag}</span>
              <span className="text-white font-medium text-sm">{countryCode.code}</span>
              <CaretDown size={12} className="text-gray-400" />
            </button>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="6 12 34 56 78"
              className="flex-1 bg-transparent px-3 py-4 text-white text-base outline-none placeholder:text-gray-500"
              data-testid="phone-input" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleCheckPhone()} />
          </div>
          {showCountryPicker && (
            <div className="mt-2 bg-[#2a2a3e] border border-white/10 rounded-xl max-h-48 overflow-y-auto shadow-xl z-50">
              {COUNTRIES.map((c) => (
                <button key={c.code} onClick={() => { setCountryCode(c); setShowCountryPicker(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
                  <span className="text-lg">{c.flag}</span>
                  <span className="text-white text-sm font-medium">{c.name}</span>
                  <span className="text-gray-400 text-sm ml-auto">{c.code}</span>
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-red-400 text-sm mt-3" data-testid="error-message">{error}</p>}

          {/* Other login options */}
          <button onClick={() => setShowAccountModal(true)} className="flex items-center gap-1.5 mt-5" data-testid="other-login-options-btn">
            <span className="text-amber-500 font-bold text-sm">Ou choisir une autre option de connexion</span>
            <CaretRight size={14} className="text-amber-500" weight="bold" />
          </button>
        </div>
        <div className="px-6 mt-auto mb-4">
          <p className="text-xs text-gray-500">
            Vous &ecirc;tes passager ?{' '}
            <button onClick={() => navigate('/login')} className="text-amber-500 font-medium" data-testid="switch-to-client">
              SB Drive Client
            </button>
          </p>
        </div>
        <div className="px-6 pb-8 flex justify-end">
          <button onClick={handleCheckPhone} disabled={loading}
            className="w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30 transition-all disabled:opacity-60"
            data-testid="submit-btn">
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> :
              <ArrowRight size={22} className="text-white" weight="bold" />}
          </button>
        </div>

        {/* ═══ Account Modal ═══ */}
        {showAccountModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" data-testid="account-modal">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowAccountModal(false)} />
            <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl pb-8 animate-slide-up">
              <div className="flex items-center justify-between px-6 pt-6 pb-4">
                <h3 className="text-lg font-bold text-gray-900">Choisir un compte</h3>
                <button onClick={() => setShowAccountModal(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="close-modal-btn">
                  <X size={16} className="text-gray-600" />
                </button>
              </div>
              <div className="px-2">
                <button onClick={() => toast.info('Apple Sign-In bientot disponible')} className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 rounded-xl transition-colors" data-testid="login-apple-btn">
                  <div className="w-10 h-10 rounded-full bg-black" />
                  <span className="text-base font-medium text-gray-900 flex-1 text-left">Apple</span>
                  <CaretRight size={18} className="text-gray-400" />
                </button>
                <button onClick={() => { setShowAccountModal(false); loginWithGoogle && loginWithGoogle(); }} className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 rounded-xl transition-colors" data-testid="login-google-btn">
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
                <button onClick={() => toast.info('Facebook Login bientot disponible')} className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 rounded-xl transition-colors" data-testid="login-facebook-btn">
                  <div className="w-10 h-10 rounded-full bg-[#1877F2] flex items-center justify-center text-white font-bold text-lg">f</div>
                  <span className="text-base font-medium text-gray-900 flex-1 text-left">Facebook</span>
                  <CaretRight size={18} className="text-gray-400" />
                </button>
                <button onClick={() => toast.info('Connectez-vous d\'abord par mobile pour activer Face ID / Touch ID')} className="w-full flex items-center gap-4 px-4 py-4 hover:bg-gray-50 rounded-xl transition-colors" data-testid="login-biometric-btn">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                      <path d="M7 3H5a2 2 0 00-2 2v2M17 3h2a2 2 0 012 2v2M7 21H5a2 2 0 01-2-2v-2M17 21h2a2 2 0 002-2v-2"/>
                      <circle cx="12" cy="12" r="3"/>
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
  //  PASSWORD STEP
  // ══════════════════════════════════════
  if (step === 'password') {
    return (
      <div className="mobile-container min-h-screen bg-[#1a1a2e] flex flex-col" data-testid="chauffeur-login-page">
        <div className="px-4 pt-5">
          <button onClick={goBack} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center" data-testid="back-btn">
            <ArrowLeft size={20} className="text-white" />
          </button>
        </div>
        <div className="px-6 mt-6">
          <h1 className="text-2xl font-bold text-white mb-2" data-testid="password-title">
            {isNewUser ? 'Cr\u00e9er un mot de passe' : 'Entrez votre mot de passe'}
          </h1>
          <p className="text-gray-400 text-sm mb-8">
            {isNewUser ? 'Choisissez un mot de passe s\u00e9curis\u00e9' : `Num\u00e9ro: ${countryCode.code} ${phone}`}
          </p>
          <div className="space-y-4">
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-amber-500 transition-colors">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="flex-1 bg-transparent px-4 py-4 text-white text-base outline-none placeholder:text-gray-500"
                data-testid="password-input" autoFocus onKeyDown={(e) => e.key === 'Enter' && !isNewUser && handlePassword()} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="px-3 text-gray-400">
                {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {isNewUser && (
              <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-amber-500 transition-colors">
                <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmer le mot de passe"
                  className="flex-1 bg-transparent px-4 py-4 text-white text-base outline-none placeholder:text-gray-500"
                  data-testid="confirm-password-input" onKeyDown={(e) => e.key === 'Enter' && handlePassword()} />
              </div>
            )}
            {error && <p className="text-red-400 text-sm" data-testid="error-message">{error}</p>}
          </div>
        </div>
        <div className="mt-auto px-6 pb-8 flex justify-end">
          <button onClick={handlePassword} disabled={loading}
            className="w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30 transition-all disabled:opacity-60"
            data-testid="submit-btn">
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> :
              <ArrowRight size={22} className="text-white" weight="bold" />}
          </button>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════
  //  PROFILE STEP
  // ══════════════════════════════════════
  return (
    <div className="mobile-container min-h-screen bg-[#1a1a2e] flex flex-col" data-testid="chauffeur-login-page">
      <div className="px-4 pt-5">
        <button onClick={goBack} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={20} className="text-white" />
        </button>
      </div>
      <div className="px-6 mt-6 flex-1 overflow-y-auto pb-4">
        <h1 className="text-2xl font-bold text-white mb-2" data-testid="profile-title">Compl&eacute;tez votre profil</h1>
        <p className="text-gray-400 text-sm mb-6">Devenez chauffeur SB Drive</p>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">Nom complet *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jean Dupont"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base outline-none focus:border-amber-500 transition-colors placeholder:text-gray-500"
              data-testid="name-input" autoFocus />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">
              Email <span className="text-gray-500 font-normal lowercase">(facultatif)</span>
            </label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="chauffeur@exemple.fr"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base outline-none focus:border-amber-500 transition-colors placeholder:text-gray-500"
              data-testid="email-input" />
          </div>
          {error && <p className="text-red-400 text-sm" data-testid="error-message">{error}</p>}
        </div>
      </div>
      <div className="px-6 pb-8">
        <button onClick={handleRegister} disabled={loading}
          className="w-full h-14 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-base font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-60"
          data-testid="submit-btn">
          {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> :
            <>Devenir chauffeur<ArrowRight size={20} className="ml-1" /></>}
        </button>
      </div>
    </div>
  );
};

export default ChauffeurLogin;
