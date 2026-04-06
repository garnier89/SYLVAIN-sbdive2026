import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  ArrowLeft, ArrowRight, Envelope, Lock, X,
  GoogleLogo, Fingerprint
} from '@phosphor-icons/react';
import { toast } from 'sonner';

const LoginPage = () => {
  const [mode, setMode] = useState('phone'); // 'phone' | 'email'
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      // For phone mode, use phone as email (MVP)
      const loginEmail = mode === 'phone' ? phone + '@sbdrive.local' : email;
      const result = await login(loginEmail, password);
      const roleRedirects = {
        user: '/home',
        driver: '/chauffeur/home',
        merchant: '/merchant',
        admin: '/admin',
        dispatcher: '/dispatcher',
      };
      navigate(roleRedirects[result.user.role] || '/home');
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (mode === 'phone') {
        setError('Numéro non reconnu. Essayez avec votre email.');
        setMode('email');
      } else {
        setError(typeof detail === 'string' ? detail : 'Identifiants incorrects');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    await handleSubmit();
  };

  return (
    <div className="mobile-container min-h-screen bg-white flex flex-col relative">
      {/* Back button */}
      <div className="px-4 pt-5">
        <button
          onClick={() => navigate('/')}
          className="w-11 h-11 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50"
          data-testid="login-back-btn"
        >
          <ArrowLeft size={22} className="text-gray-700" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 pt-6">
        {mode === 'phone' ? (
          <>
            <h1 className="text-2xl font-bold text-gray-900">Entrez votre numéro de téléphone</h1>
            <div className="mt-6">
              <p className="text-sm text-gray-400 mb-1">Mobile</p>
              <div className="flex items-center gap-3 border-b-2 border-gray-200 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-lg">🇫🇷</span>
                  <span className="text-gray-600 text-sm">+33</span>
                  <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
                <input
                  type="tel"
                  placeholder="6 12 34 56 78"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="flex-1 text-lg outline-none text-gray-900 placeholder:text-gray-300"
                  data-testid="login-phone-input"
                  autoFocus
                />
              </div>
            </div>

            <button
              onClick={() => setShowOptions(true)}
              className="mt-5 text-blue-600 font-medium text-base flex items-center gap-2"
              data-testid="other-login-options-btn"
            >
              Ou choisir d'autres options <ArrowRight size={18} />
            </button>

            <p className="mt-4 text-sm text-gray-400 leading-relaxed">
              En continuant, j'accepte les{' '}
              <span className="text-blue-600">Conditions d'utilisation & Politique de confidentialité</span>
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900">Connectez-vous avec votre email</h1>
            {error && (
              <div className="mt-3 p-3 rounded-xl bg-red-50 text-red-600 text-sm">{error}</div>
            )}
            <form onSubmit={handleEmailSubmit} className="mt-6 space-y-4">
              <div>
                <p className="text-sm text-gray-400 mb-1">Email</p>
                <div className="flex items-center gap-3 border-b-2 border-gray-200 pb-2">
                  <Envelope size={20} className="text-gray-400" />
                  <input
                    type="email"
                    placeholder="votre@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 text-lg outline-none text-gray-900 placeholder:text-gray-300"
                    data-testid="login-email-input"
                    autoFocus
                    required
                  />
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">Mot de passe</p>
                <div className="flex items-center gap-3 border-b-2 border-gray-200 pb-2">
                  <Lock size={20} className="text-gray-400" />
                  <input
                    type="password"
                    placeholder="Mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="flex-1 text-lg outline-none text-gray-900 placeholder:text-gray-300"
                    data-testid="login-password-input"
                    required
                  />
                </div>
              </div>
              <button type="submit" className="hidden" />
            </form>

            <button
              onClick={() => { setMode('phone'); setError(''); }}
              className="mt-4 text-blue-600 font-medium text-sm"
              data-testid="switch-to-phone-btn"
            >
              Se connecter par téléphone
            </button>

            <p className="mt-3 text-sm text-gray-400">
              Pas encore de compte ?{' '}
              <Link to="/register" className="text-blue-600 font-medium" data-testid="register-link">S'inscrire</Link>
            </p>
          </>
        )}
      </div>

      {/* FAB Button */}
      <div className="px-6 pb-8 flex justify-end">
        <button
          onClick={mode === 'email' ? handleEmailSubmit : () => { if (phone.length >= 6) setMode('email'); else toast.error('Entrez un numéro valide'); }}
          className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center shadow-lg hover:bg-blue-700 transition-colors"
          disabled={loading}
          data-testid="login-submit-btn"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <ArrowRight size={24} className="text-white" />
          )}
        </button>
      </div>

      {/* Social Login Modal */}
      {showOptions && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={() => setShowOptions(false)}>
          <div
            className="w-full max-w-[430px] bg-white rounded-t-3xl p-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
            data-testid="social-login-modal"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-gray-900">Choisir un compte</h3>
              <button onClick={() => setShowOptions(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X size={18} className="text-gray-600" />
              </button>
            </div>

            <div className="space-y-1">
              <button
                onClick={() => { setShowOptions(false); loginWithGoogle(); }}
                className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-gray-50 transition-colors"
                data-testid="google-login-btn"
              >
                <div className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center">
                  <GoogleLogo size={22} weight="bold" className="text-blue-500" />
                </div>
                <span className="font-semibold text-gray-900 flex-1 text-left">Google</span>
                <ArrowRight size={18} className="text-blue-500" />
              </button>

              <button
                onClick={() => { setShowOptions(false); setMode('email'); }}
                className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-gray-50 transition-colors"
                data-testid="email-login-btn"
              >
                <div className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center">
                  <Envelope size={22} className="text-gray-600" />
                </div>
                <span className="font-semibold text-gray-900 flex-1 text-left">Email</span>
                <ArrowRight size={18} className="text-blue-500" />
              </button>

              <button
                className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-gray-50 transition-colors"
                data-testid="biometric-login-btn"
              >
                <div className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center">
                  <Fingerprint size={22} className="text-teal-500" />
                </div>
                <span className="font-semibold text-gray-900 flex-1 text-left">Face ID / Touch ID</span>
                <ArrowRight size={18} className="text-blue-500" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
