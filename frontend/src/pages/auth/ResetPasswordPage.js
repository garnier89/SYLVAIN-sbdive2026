import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeSlash, ShieldCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (password.length < 6) {
      toast.error('Le mot de passe doit faire au moins 6 caractères');
      return;
    }
    if (password !== confirm) {
      toast.error('Les mots de passe ne correspondent pas');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/auth/reset-password`, { token, new_password: password });
      toast.success('Mot de passe réinitialisé ! Connectez-vous.');
      navigate('/login/email', { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Lien invalide ou expiré');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="mobile-container min-h-screen !bg-[#1a1a2e] flex flex-col items-center justify-center px-6 text-center" data-testid="reset-no-token">
        <h1 className="text-xl font-bold text-white mb-2">Lien invalide</h1>
        <p className="text-gray-400 text-sm mb-6">Ce lien de réinitialisation est incomplet ou a expiré.</p>
        <button onClick={() => navigate('/mot-de-passe-oublie')} className="bg-cyan-500 text-white rounded-full px-6 py-3 font-bold" data-testid="reset-restart-btn">
          Refaire une demande
        </button>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen !bg-[#1a1a2e] flex flex-col" data-testid="reset-password-page">
      <div className="px-6 mt-12 flex-1">
        <div className="w-14 h-14 rounded-2xl bg-cyan-500/15 flex items-center justify-center mb-4">
          <ShieldCheck size={30} className="text-cyan-400" weight="duotone" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2" data-testid="reset-page-title">Nouveau mot de passe</h1>
        <p className="text-gray-400 text-sm mb-8">Choisissez un nouveau mot de passe sécurisé pour votre compte.</p>

        <form onSubmit={submit} className="space-y-4">
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
                autoFocus
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" data-testid="toggle-password-btn">
                {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Confirmer le mot de passe</label>
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white/10 text-white rounded-2xl px-4 py-3.5 outline-none border border-white/10 focus:border-cyan-400"
              data-testid="reset-confirm-password-input"
            />
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
      </div>
    </div>
  );
};

export default ResetPasswordPage;
