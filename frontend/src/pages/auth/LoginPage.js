import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { COUNTRIES, formatApiErrorDetail } from './login/loginConstants';
import { PhoneStep } from './login/PhoneStep';
import { PasswordStep } from './login/PasswordStep';
import { ProfileStep } from './login/ProfileStep';
import { AccountOptionsModal } from './login/AccountOptionsModal';

const API_URL = process.env.REACT_APP_BACKEND_URL;

/**
 * Phone-based JWT auth (httpOnly cookies). This container owns ALL state and the
 * auth handlers; the step views and the account modal are presentation only.
 */
const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginWithGoogle, setUser } = useAuth();
  // Where the user was headed before being bounced to /login (set by ProtectedRoute).
  const from = location.state?.from;
  const backTo = from ? `${from.pathname || ''}${from.search || ''}` : null;

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

  const getFullPhone = () => `${countryCode.code}${phone.trim().replace(/\s+/g, '')}`;

  /* ── Step 1: Check phone ── */
  const handleCheckPhone = async () => {
    if (!phone.trim()) { setError('Veuillez entrer votre numéro de mobile'); return; }
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
    if (!password) { setError('Veuillez entrer un mot de passe'); return; }
    if (isNewUser) {
      if (password.length < 6) { setError('Le mot de passe doit contenir au moins 6 caractères'); return; }
      if (password !== confirmPassword) { setError('Les mots de passe ne correspondent pas'); return; }
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
      let data = {};
      try { data = await res.json(); } catch { /* non-JSON error body */ }
      if (!res.ok) {
        if (res.status === 429) {
          setError(formatApiErrorDetail(data.detail) || 'Trop de tentatives. Patientez ~15 minutes avant de réessayer.');
        } else {
          setError(formatApiErrorDetail(data.detail) || 'Mot de passe incorrect');
        }
        return;
      }
      // Token managed via httpOnly cookies set by backend
      setUser(data.user);
      // Route based on user role so drivers/admins/merchants land on their own app
      const role = data.user?.role;
      const panelPref = data.user?.panel_preference;
      if (role === 'driver') navigate('/chauffeur/home');
      else if (role === 'admin') navigate(panelPref || '/admin');
      else if (role === 'dispatcher') navigate('/dispatch');
      else if (role === 'merchant') navigate('/merchant');
      else navigate(backTo || '/home');
    } catch (err) {
      console.error('Phone login error:', err);
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  /* ── Step 3: Complete profile ── */
  const handleRegister = async () => {
    if (!lastName.trim()) { setError('Veuillez entrer votre nom'); return; }
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
      if (!res.ok) { setError(formatApiErrorDetail(data.detail) || "Erreur lors de l'inscription"); return; }
      setUser(data.user);
      navigate(backTo || '/home');
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

  if (step === 'password') {
    return (
      <PasswordStep
        isNewUser={isNewUser}
        password={password} setPassword={setPassword}
        confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
        showPassword={showPassword} setShowPassword={setShowPassword}
        countryCode={countryCode} phone={phone}
        error={error} loading={loading}
        onSubmit={handlePassword} onBack={goBack}
      />
    );
  }

  if (step === 'profile') {
    return (
      <ProfileStep
        lastName={lastName} setLastName={setLastName}
        firstName={firstName} setFirstName={setFirstName}
        email={email} setEmail={setEmail}
        referralCode={referralCode} setReferralCode={setReferralCode}
        error={error} loading={loading}
        onSubmit={handleRegister} onBack={goBack}
      />
    );
  }

  return (
    <>
      <PhoneStep
        phone={phone} setPhone={setPhone}
        countryCode={countryCode} setCountryCode={setCountryCode}
        showCountryPicker={showCountryPicker} setShowCountryPicker={setShowCountryPicker}
        error={error} loading={loading}
        onSubmit={handleCheckPhone} onBack={goBack}
        onEmail={() => navigate('/login/email', { state: from ? { from } : undefined })}
        onGoogle={() => loginWithGoogle()}
        onOtherOptions={() => setShowAccountModal(true)}
      />
      {showAccountModal && (
        <AccountOptionsModal
          onClose={() => setShowAccountModal(false)}
          onEmail={() => { setShowAccountModal(false); navigate('/login/email'); }}
          onGoogle={() => { setShowAccountModal(false); loginWithGoogle(); }}
        />
      )}
    </>
  );
};

export default LoginPage;
