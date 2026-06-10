import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, Envelope, ArrowLeft } from '@phosphor-icons/react';
import { toast } from 'sonner';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const roleHome = (r) =>
  r === 'admin' ? '/admin'
  : r === 'driver' ? '/chauffeur/home'
  : r === 'merchant' ? '/merchant/dashboard'
  : '/home';

const VerifyEmailPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, checkAuth } = useAuth();
  const status = params.get('status'); // ok | expired | invalid (from email link)
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const linkHandled = useRef(false);

  useEffect(() => {
    if (status === 'ok' && !linkHandled.current) {
      linkHandled.current = true;
      checkAuth?.();
      toast.success('Email vérifié avec succès !');
    }
  }, [status, checkAuth]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (code.trim().length !== 6) {
      toast.error('Entrez le code à 6 chiffres');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/auth/verify-otp`, { code: code.trim() }, { withCredentials: true });
      await checkAuth?.();
      toast.success('Email vérifié avec succès !');
      navigate(roleHome(user?.role), { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Code invalide');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/auth/send-verification`, {}, { withCredentials: true });
      if (data.already_verified) {
        toast.success('Votre email est déjà vérifié.');
        await checkAuth?.();
        navigate(roleHome(user?.role), { replace: true });
        return;
      }
      setCooldown(data.cooldown || 60);
      toast.success('Un nouveau code vous a été envoyé.');
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Impossible d'envoyer le code");
    } finally {
      setResending(false);
    }
  };

  if (status === 'ok') {
    return (
      <div className="mobile-container min-h-screen !bg-[#1a1a2e] flex flex-col items-center justify-center px-6 text-center" data-testid="verify-email-success">
        <CheckCircle size={72} weight="fill" className="text-green-400 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Email vérifié ✅</h1>
        <p className="text-gray-400 text-sm mb-8">Votre compte est désormais activé. Merci !</p>
        <button
          onClick={() => navigate(roleHome(user?.role), { replace: true })}
          className="w-full max-w-xs bg-cyan-500 text-white rounded-full py-3.5 font-bold"
          data-testid="verify-continue-btn"
        >
          Continuer
        </button>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen !bg-[#1a1a2e] flex flex-col" data-testid="verify-email-page">
      <div className="px-4 pt-5">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={20} className="text-white" />
        </button>
      </div>
      <div className="px-6 mt-6 flex-1">
        <div className="w-14 h-14 rounded-2xl bg-[#FF4500]/15 flex items-center justify-center mb-4">
          <Envelope size={30} className="text-[#FF4500]" weight="duotone" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2" data-testid="verify-email-title">Vérifiez votre email</h1>
        <p className="text-gray-400 text-sm mb-2">
          Nous avons envoyé un code à 6 chiffres{user?.email ? ` à ${user.email}` : ''}. Saisissez-le ci-dessous,
          ou cliquez sur le lien dans l'email.
        </p>

        {(status === 'expired' || status === 'invalid') && (
          <div className="mt-3 mb-2 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3" data-testid="verify-link-error">
            <XCircle size={18} className="text-red-400 shrink-0" />
            <p className="text-red-300 text-xs">
              {status === 'expired' ? 'Le lien a expiré.' : 'Lien invalide.'} Demandez un nouveau code ci-dessous.
            </p>
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          <input
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="• • • • • •"
            className="w-full bg-white/10 text-white text-center text-2xl tracking-[0.5em] rounded-2xl px-4 py-4 outline-none border border-white/10 focus:border-cyan-400"
            data-testid="verify-otp-input"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan-500 text-white rounded-full py-3.5 font-bold disabled:opacity-50"
            data-testid="verify-otp-submit-btn"
          >
            {loading ? 'Vérification...' : 'Vérifier mon email'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <button
            onClick={resend}
            disabled={resending || cooldown > 0}
            className="text-cyan-400 text-sm font-semibold disabled:opacity-50"
            data-testid="verify-resend-btn"
          >
            {cooldown > 0 ? `Renvoyer le code (${cooldown}s)` : resending ? 'Envoi...' : 'Renvoyer le code'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
