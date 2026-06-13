import React, { useState, useRef } from 'react';
import { X, ChatCircleDots, ShieldCheck } from '@phosphor-icons/react';
import { sendOtp, confirmOtp, clearRecaptcha, firebaseConfigured } from '../../lib/firebase';
import { authAPI } from '../../services/api';

/**
 * Modale de connexion/vérification par OTP SMS (Firebase Phone Auth).
 * mode='login'  → connexion/inscription sans mot de passe (onSuccess reçoit le user)
 * mode='verify' → vérification du numéro pour le compte connecté (onSuccess reçoit {phone})
 */
const PhoneOtpModal = ({ open, onClose, defaultPhone = '', mode = 'login', onSuccess }) => {
  const [phone, setPhone] = useState(defaultPhone);
  const [code, setCode] = useState('');
  const [step, setStep] = useState('phone'); // 'phone' | 'code'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const confirmRef = useRef(null);

  if (!open) return null;
  if (!firebaseConfigured()) return null;

  const normalized = () => phone.trim().replace(/\s+/g, '');

  const handleSend = async () => {
    setError('');
    if (!normalized().startsWith('+')) { setError('Format international requis (ex: +596…)'); return; }
    setLoading(true);
    try {
      confirmRef.current = await sendOtp(normalized(), 'sb-recaptcha-container');
      setStep('code');
    } catch (e) {
      setError("Échec d'envoi du code. Vérifiez le numéro et réessayez.");
      clearRecaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setError('');
    if (code.trim().length < 4) { setError('Code invalide'); return; }
    setLoading(true);
    try {
      const idToken = await confirmOtp(confirmRef.current, code.trim());
      if (mode === 'login') {
        const { data } = await authAPI.firebaseLogin({ id_token: idToken });
        onSuccess?.(data.user);
      } else {
        const { data } = await authAPI.firebaseVerifyPhone(idToken);
        onSuccess?.(data);
      }
      clearRecaptcha();
    } catch (e) {
      const detail = e?.response?.data?.detail;
      setError(detail || 'Code incorrect ou expiré.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-end sm:items-center justify-center" data-testid="otp-modal">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center" data-testid="otp-close-btn"><X size={18} /></button>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={22} weight="fill" className="text-[#FF5000]" />
          <h3 className="text-lg font-extrabold text-gray-900">{mode === 'login' ? 'Connexion par SMS' : 'Vérifier mon numéro'}</h3>
        </div>
        <p className="text-sm text-gray-500 mb-5">Un code de vérification vous sera envoyé par SMS.</p>

        {step === 'phone' && (
          <>
            <label className="text-xs font-semibold text-gray-600">Numéro de téléphone</label>
            <input
              value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+596 696 12 34 56"
              className="w-full border border-gray-200 rounded-xl px-3 py-3 mt-1 text-sm" data-testid="otp-phone-input"
            />
            <button onClick={handleSend} disabled={loading}
              className="w-full mt-4 bg-[#FF5000] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60" data-testid="otp-send-btn">
              <ChatCircleDots size={18} weight="bold" />{loading ? 'Envoi…' : 'Recevoir le code'}
            </button>
          </>
        )}

        {step === 'code' && (
          <>
            <label className="text-xs font-semibold text-gray-600">Code reçu par SMS</label>
            <input
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" inputMode="numeric" maxLength={6}
              className="w-full border border-gray-200 rounded-xl px-3 py-3 mt-1 text-lg tracking-widest text-center" data-testid="otp-code-input"
            />
            <button onClick={handleVerify} disabled={loading}
              className="w-full mt-4 bg-[#FF5000] text-white font-bold py-3 rounded-xl disabled:opacity-60" data-testid="otp-verify-btn">
              {loading ? 'Vérification…' : 'Vérifier'}
            </button>
            <button onClick={() => { setStep('phone'); setCode(''); clearRecaptcha(); }} className="w-full mt-2 text-sm text-gray-500" data-testid="otp-back-btn">Modifier le numéro</button>
          </>
        )}

        {error && <p className="text-red-500 text-sm mt-3" data-testid="otp-error">{error}</p>}
        <div id="sb-recaptcha-container" />
      </div>
    </div>
  );
};

export default PhoneOtpModal;
