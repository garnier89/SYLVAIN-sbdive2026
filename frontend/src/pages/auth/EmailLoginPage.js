import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, Eye, EyeSlash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const EmailLoginPage = () => {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!email || !password) {
      toast.error('Email et mot de passe requis');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(
        `${API_URL}/api/auth/login`,
        { email: email.trim().toLowerCase(), password },
        { withCredentials: true },
      );
      const { user } = res.data;
      // Token is set as httpOnly cookie by the backend; no need to store in localStorage (XSS-safe).
      setUser(user);
      // Role-based redirect
      const r = user.role;
      if (r === 'admin') navigate('/admin', { replace: true });
      else if (r === 'driver') navigate('/chauffeur/home', { replace: true });
      else if (r === 'merchant') navigate('/merchant/dashboard', { replace: true });
      else navigate('/home', { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Identifiants invalides');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mobile-container min-h-screen bg-[#1a1a2e] flex flex-col" data-testid="email-login-page">
      <div className="px-4 pt-5">
        <button
          onClick={() => navigate('/login')}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
          data-testid="back-btn"
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
      </div>
      <div className="px-6 mt-6 flex-1">
        <h1 className="text-2xl font-bold text-white mb-2" data-testid="email-login-title">
          Connexion par email
        </h1>
        <p className="text-gray-400 text-sm mb-8">Pour les comptes admin, marchand ou utilisateur classique</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              className="w-full bg-white/10 text-white rounded-2xl px-4 py-3.5 outline-none border border-white/10 focus:border-cyan-400"
              data-testid="email-input"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Mot de passe</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white/10 text-white rounded-2xl px-4 py-3.5 pr-12 outline-none border border-white/10 focus:border-cyan-400"
                data-testid="password-input"
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
            className="w-full bg-cyan-500 text-white rounded-full py-3.5 font-bold mt-2 disabled:opacity-50"
            data-testid="email-login-submit-btn"
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default EmailLoginPage;
