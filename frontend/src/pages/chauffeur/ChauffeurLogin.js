import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, ArrowRight, Eye, EyeSlash, CaretDown, SteeringWheel } from '@phosphor-icons/react';

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
  const { setUser } = useAuth();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState(COUNTRIES[0]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
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
      if (data.access_token) localStorage.setItem('token', data.access_token); // kept for backward compat
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
      if (data.access_token) localStorage.setItem('token', data.access_token); // kept for backward compat
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
