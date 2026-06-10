import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Eye, EyeSlash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState('email'); // email -> reset
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const requestCode = async (e) => {
    e?.preventDefault?.();
    if (!email.trim()) {
      toast.error('Entrez votre email');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/auth/forgot-password`, { email: email.trim().toLowerCase() });
      toast.success('Si un compte existe, un code vous a été envoyé.');
      setStep('reset');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const doReset = async (e) => {
    e?.preventDefault?.();
    if (code.trim().length !== 6) {
      toast.error('Entrez le code à 6 chiffres');
      return;
    }
    if (password.length < 6) {
      toast.error('Le mot de passe doit faire au moins 6 caractères');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/auth/reset-password`, {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        new_password: password,
      });
      toast.success('Mot de passe réinitialisé ! Connectez-vous.');
      navigate('/login/email', { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Code invalide');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mobile-container min-h-screen !bg-[#1a1a2e] flex flex-col" data-testid="forgot-password-page">
      <div className="px-4 pt-5">
        <button
          onClick={() => (step === 'reset' ? setStep('email') : navigate('/login/email'))}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
          data-testid="back-btn"
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
      </div>
      <div className="px-6 mt-6 flex-1">
        <h1 className="text-2xl font-bold text-white mb-2" data-testid="forgot-title">Mot de passe oublié</h1>

        {step === 'email' ? (
          <>
            <p className="text-gray-400 text-sm mb-8">Entrez votre email pour recevoir un code de réinitialisation.</p>
            <form onSubmit={requestCode} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Email</label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  className="w-full bg-white/10 text-white rounded-2xl px-4 py-3.5 outline-none border border-white/10 focus:border-cyan-400"
                  data-testid="forgot-email-input"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-cyan-500 text-white rounded-full py-3.5 font-bold disabled:opacity-50"
                data-testid="forgot-submit-btn"
              >
                {loading ? 'Envoi...' : 'Envoyer le code'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="text-gray-400 text-sm mb-8">
              Saisissez le code reçu par email et votre nouveau mot de passe. Vous pouvez aussi cliquer
              sur le lien dans l'email.
            </p>
            <form onSubmit={doReset} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Code de vérification</label>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="• • • • • •"
                  className="w-full bg-white/10 text-white text-center text-xl tracking-[0.4em] rounded-2xl px-4 py-3.5 outline-none border border-white/10 focus:border-cyan-400"
                  data-testid="reset-code-input"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Nouveau mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white/10 text-white rounded-2xl pl-10 pr-12 py-3.5 outline-none border border-white/10 focus:border-cyan-400"
                    data-testid="reset-new-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    data-testid="toggle-password-btn"
                  >
                    {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-cyan-500 text-white rounded-full py-3.5 font-bold disabled:opacity-50"
                data-testid="reset-submit-btn"
              >
                {loading ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
              </button>
            </form>
            <div className="mt-5 text-center">
              <button onClick={requestCode} disabled={loading} className="text-cyan-400 text-sm font-semibold disabled:opacity-50" data-testid="forgot-resend-btn">
                Renvoyer le code
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
