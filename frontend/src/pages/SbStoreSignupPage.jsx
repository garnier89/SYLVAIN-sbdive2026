import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { merchantAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Storefront, ArrowLeft, ArrowRight, CheckCircle, Spinner, User, Lock, EnvelopeSimple, Phone, MapPin, ForkKnife } from '@phosphor-icons/react';

const STORE_TYPES = [
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'grocery', label: 'Épicerie / Supérette' },
  { id: 'bakery', label: 'Boulangerie' },
  { id: 'pharmacy', label: 'Pharmacie' },
  { id: 'florist', label: 'Fleuriste' },
  { id: 'other', label: 'Autre commerce' },
];

const Field = ({ icon: Icon, ...props }) => (
  <div className="relative">
    {Icon && <Icon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />}
    <input
      {...props}
      className={`w-full ${Icon ? 'pl-10' : 'pl-3'} pr-3 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#FF4500] transition-colors`}
    />
  </div>
);

const SbStoreSignupPage = () => {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '',
    store_name: '', store_type: 'restaurant', address: '', description: '',
  });

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const validStep1 = form.name.trim() && form.email.trim() && form.password.length >= 6;
  const validStep2 = form.store_name.trim() && form.address.trim();

  const submit = async () => {
    if (!validStep2) { toast.error('Renseignez le nom et l\'adresse de la boutique'); return; }
    setLoading(true);
    try {
      const res = await merchantAPI.signup(form);
      if (res.data?.user) setUser({ ...res.data.user });
      setDone(true);
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : "Échec de l'inscription");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] text-white flex items-center justify-center px-5" data-testid="sbstore-signup-success">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 rounded-3xl bg-green-500/15 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={48} weight="fill" className="text-green-400" />
          </div>
          <h1 className="text-3xl font-black mb-3">Compte créé 🎉</h1>
          <p className="text-gray-400 mb-2">Votre boutique <b className="text-white">{form.store_name}</b> est en attente de validation par notre équipe.</p>
          <p className="text-gray-500 text-sm mb-8">Vous recevrez une notification dès qu'elle sera activée. En attendant, vous pouvez préparer votre catalogue.</p>
          <button onClick={() => navigate('/merchant')} className="w-full py-3 rounded-xl bg-[#FF4500] text-white font-bold hover:bg-[#e63e00] transition-colors" data-testid="goto-dashboard-btn">
            Accéder à mon espace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white relative overflow-hidden" data-testid="sbstore-signup-page">
      <div className="pointer-events-none absolute -top-32 -right-32 w-96 h-96 rounded-full bg-[#FF4500]/15 blur-3xl" />
      <div className="relative max-w-lg mx-auto px-5 py-10">
        <button onClick={() => navigate('/connexion')} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8 text-sm" data-testid="signup-back">
          <ArrowLeft size={18} /> Retour
        </button>

        <div className="flex items-center gap-3 mb-2">
          <img src="/sb-store-logo.jpg" alt="SB Store" className="h-11 w-11 rounded-2xl object-cover" />
          <div>
            <h1 className="text-2xl font-black leading-tight">Ouvrir ma boutique SB Store</h1>
            <p className="text-gray-400 text-sm">Vendez en ligne en quelques minutes.</p>
          </div>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 my-6">
          {[1, 2].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${step >= s ? 'bg-[#FF4500]' : 'bg-white/10'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4" data-testid="signup-step-1">
            <p className="text-xs font-bold tracking-widest uppercase text-[#FF4500]">Étape 1 · Votre compte</p>
            <Field icon={User} placeholder="Nom complet" value={form.name} onChange={(e) => upd('name', e.target.value)} data-testid="signup-name" />
            <Field icon={EnvelopeSimple} type="email" placeholder="Email" value={form.email} onChange={(e) => upd('email', e.target.value)} data-testid="signup-email" />
            <Field icon={Lock} type="password" placeholder="Mot de passe (min. 6 caractères)" value={form.password} onChange={(e) => upd('password', e.target.value)} data-testid="signup-password" />
            <Field icon={Phone} placeholder="Téléphone (optionnel)" value={form.phone} onChange={(e) => upd('phone', e.target.value)} data-testid="signup-phone" />
            <button
              onClick={() => validStep1 ? setStep(2) : toast.error('Remplissez nom, email et mot de passe (min. 6 caractères)')}
              className="w-full py-3 rounded-xl bg-[#FF4500] text-white font-bold hover:bg-[#e63e00] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              data-testid="signup-next-btn"
            >
              Continuer <ArrowRight size={18} />
            </button>
            <p className="text-center text-sm text-gray-500">
              Déjà un compte ? <button onClick={() => navigate('/login/email')} className="text-[#FF4500] font-semibold" data-testid="signup-login-link">Se connecter</button>
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4" data-testid="signup-step-2">
            <p className="text-xs font-bold tracking-widest uppercase text-[#FF4500]">Étape 2 · Votre boutique</p>
            <Field icon={Storefront} placeholder="Nom de la boutique" value={form.store_name} onChange={(e) => upd('store_name', e.target.value)} data-testid="signup-store-name" />
            <div className="relative">
              <ForkKnife size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <select
                value={form.store_type} onChange={(e) => upd('store_type', e.target.value)}
                className="w-full pl-10 pr-3 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#FF4500]"
                data-testid="signup-store-type"
              >
                {STORE_TYPES.map((t) => <option key={t.id} value={t.id} className="bg-[#0a0e1a]">{t.label}</option>)}
              </select>
            </div>
            <Field icon={MapPin} placeholder="Adresse de la boutique" value={form.address} onChange={(e) => upd('address', e.target.value)} data-testid="signup-address" />
            <textarea
              placeholder="Description (optionnel)" value={form.description} onChange={(e) => upd('description', e.target.value)} rows={3}
              className="w-full px-3 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#FF4500]"
              data-testid="signup-description"
            />
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="px-5 py-3 rounded-xl border border-white/15 text-gray-300 hover:bg-white/5 transition-colors" data-testid="signup-back-btn">Retour</button>
              <button
                onClick={submit} disabled={loading}
                className="flex-1 py-3 rounded-xl bg-[#FF4500] text-white font-bold hover:bg-[#e63e00] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                data-testid="signup-submit-btn"
              >
                {loading ? <Spinner size={18} className="animate-spin" /> : <Storefront size={18} weight="fill" />}
                {loading ? 'Création…' : 'Créer ma boutique'}
              </button>
            </div>
            <p className="text-center text-xs text-gray-600">Votre boutique sera examinée puis validée par notre équipe avant sa mise en ligne.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SbStoreSignupPage;
