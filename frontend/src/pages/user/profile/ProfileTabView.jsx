import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Switch } from '../../../components/ui/switch';
import {
  CaretLeft, EnvelopeOpen, Key, Globe, CurrencyCircleDollar, FileText,
  Bell, ShoppingCart, User, Briefcase, House, CarSimple, Buildings, Package,
  CheckCircle, Warning,
} from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const LOCALES = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
];

const CURRENCIES = [
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'XOF', symbol: 'CFA', label: 'Franc CFA (Ouest)' },
  { code: 'XAF', symbol: 'FCFA', label: 'Franc CFA (Centre)' },
  { code: 'MAD', symbol: 'DH', label: 'Dirham marocain' },
];

const TAB_META = {
  'verify-email':   { title: 'Vérifier votre e-mail',   icon: EnvelopeOpen },
  'password':       { title: 'Changer le mot de passe', icon: Key },
  'language':       { title: 'Changer la langue',       icon: Globe },
  'currency':       { title: 'Changer la devise',       icon: CurrencyCircleDollar },
  'documents':      { title: 'Gérer les documents',     icon: FileText },
  'notifications':  { title: 'Notifications',           icon: Bell },
  'cart':           { title: 'Mon panier',              icon: ShoppingCart },
  'about':          { title: 'À propos de vous',        icon: User },
  'company':        { title: "Profil de l'entreprise",  icon: Briefcase },
  'fav-home':       { title: 'Domicile',                icon: House },
  'fav-work':       { title: 'Travail',                 icon: Briefcase },
  'articles':       { title: "Liste générale d'articles", icon: Package },
  'properties':     { title: 'Liste de propriétés',     icon: Buildings },
  'vehicles':       { title: 'Liste de voitures',       icon: CarSimple },
};

const VerifyEmailView = ({ user }) => {
  const [sent, setSent] = useState(false);
  const verified = !!user?.email_verified;
  return (
    <div className="space-y-4">
      <div className={`p-4 rounded-2xl ${verified ? 'bg-emerald-50' : 'bg-amber-50'}`}>
        <div className="flex items-center gap-2 mb-1">
          {verified ? <CheckCircle size={20} weight="fill" className="text-emerald-600" /> : <Warning size={20} weight="fill" className="text-amber-600" />}
          <p className={`text-sm font-bold ${verified ? 'text-emerald-700' : 'text-amber-700'}`}>
            {verified ? 'E-mail vérifié' : 'E-mail non vérifié'}
          </p>
        </div>
        <p className="text-sm text-gray-600">{user?.email || 'Aucun e-mail enregistré'}</p>
      </div>
      {!verified && (
        <>
          <p className="text-sm text-gray-600">
            Pour sécuriser votre compte et recevoir vos reçus, vérifiez votre adresse e-mail.
          </p>
          <Button
            className="w-full bg-[#FF4500] hover:bg-orange-600"
            disabled={sent}
            onClick={() => { setSent(true); toast.success('E-mail de vérification envoyé'); }}
            data-testid="send-verify-email-btn"
          >
            {sent ? 'E-mail envoyé ✓' : 'Envoyer le lien de vérification'}
          </Button>
        </>
      )}
    </div>
  );
};

const PasswordView = () => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < 6) return toast.error('Au moins 6 caractères requis');
    if (next !== confirm) return toast.error('Les mots de passe ne correspondent pas');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/change-password`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erreur');
      toast.success(data.message || 'Mot de passe modifié');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  return (
    <form className="space-y-3" onSubmit={submit} data-testid="password-form">
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Mot de passe actuel</label>
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required data-testid="current-password-input" />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Nouveau mot de passe</label>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} data-testid="new-password-input" />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Confirmer le nouveau mot de passe</label>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} data-testid="confirm-password-input" />
      </div>
      <Button type="submit" className="w-full bg-[#FF4500] hover:bg-orange-600" disabled={loading} data-testid="submit-password-btn">
        {loading ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
      </Button>
    </form>
  );
};

const ListSelectView = ({ items, storageKey, defaultCode, renderLabel, testIdPrefix }) => {
  const [active, setActive] = useState(() => localStorage.getItem(storageKey) || defaultCode);
  const select = (code) => {
    setActive(code);
    localStorage.setItem(storageKey, code);
    toast.success('Préférence enregistrée');
  };
  return (
    <div className="bg-white rounded-2xl divide-y divide-gray-100 overflow-hidden">
      {items.map(it => (
        <button
          key={it.code}
          onClick={() => select(it.code)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
          data-testid={`${testIdPrefix}-${it.code}`}
        >
          <span className="text-sm">{renderLabel(it)}</span>
          {active === it.code && <CheckCircle size={20} weight="fill" className="text-[#FF4500]" />}
        </button>
      ))}
    </div>
  );
};

const LanguageView = () => (
  <ListSelectView
    items={LOCALES}
    storageKey="sb_lang"
    defaultCode="fr"
    renderLabel={(it) => <><span className="mr-2">{it.flag}</span>{it.label}</>}
    testIdPrefix="lang"
  />
);

const CurrencyView = () => (
  <ListSelectView
    items={CURRENCIES}
    storageKey="sb_currency"
    defaultCode="EUR"
    renderLabel={(it) => <><span className="font-bold mr-2">{it.symbol}</span>{it.label}</>}
    testIdPrefix="currency"
  />
);

const NotificationsView = () => {
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [prefs, setPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sb_notif_prefs')) || { push: true, email: true, sms: false, promos: true }; }
    catch { return { push: true, email: true, sms: false, promos: true }; }
  });

  // Load the inbox and auto-mark everything as read on open (resets the badge).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API}/api/push/list`, { credentials: 'include' });
        const data = res.ok ? await res.json() : [];
        if (alive) setItems(Array.isArray(data) ? data : []);
        fetch(`${API}/api/push/read-all`, { method: 'POST', credentials: 'include' }).catch(() => {});
      } catch { /* ignore */ }
      finally { if (alive) setLoadingList(false); }
    })();
    return () => { alive = false; };
  }, []);

  const timeAgo = (iso) => {
    try {
      const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
      if (s < 60) return "à l'instant";
      if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
      if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
      return `il y a ${Math.floor(s / 86400)} j`;
    } catch { return ''; }
  };

  const toggle = (k) => {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    localStorage.setItem('sb_notif_prefs', JSON.stringify(next));
  };
  const rows = [
    { key: 'push', label: 'Notifications push (courses, messages)' },
    { key: 'email', label: 'Notifications par e-mail' },
    { key: 'sms', label: 'Alertes SMS importantes' },
    { key: 'promos', label: 'Offres promotionnelles et codes promo' },
  ];
  return (
    <div className="space-y-5" data-testid="client-notifications-view">
      {/* Inbox */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 px-1">Reçues</p>
        {loadingList ? (
          <div className="bg-white rounded-2xl p-6 text-center text-sm text-gray-400">Chargement…</div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center" data-testid="notifications-empty">
            <Bell size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Aucune notification pour le moment.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl divide-y divide-gray-100 overflow-hidden">
            {items.map((n, i) => (
              <div key={n.id || i} className="flex items-start gap-3 px-4 py-3" data-testid="notification-item">
                <div className="w-9 h-9 rounded-full bg-[#FF4500]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bell size={18} className="text-[#FF4500]" weight="duotone" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 leading-tight">{n.title || 'Notification'}</p>
                  {n.body && <p className="text-xs text-gray-600 leading-snug mt-0.5">{n.body}</p>}
                  <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Preferences */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 px-1">Préférences</p>
        <div className="bg-white rounded-2xl divide-y divide-gray-100 overflow-hidden">
          {rows.map(r => (
            <div key={r.key} className="flex items-center justify-between px-4 py-3">
              <p className="text-sm text-gray-800 pr-3">{r.label}</p>
              <Switch checked={prefs[r.key]} onCheckedChange={() => toggle(r.key)} data-testid={`notif-${r.key}-toggle`} className="data-[state=checked]:bg-[#FF4500]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ComingSoonView = ({ icon: Icon, message, cta, onClick }) => (
  <div className="bg-white rounded-2xl p-6 text-center">
    {Icon && <Icon size={48} weight="duotone" className="text-gray-300 mx-auto mb-3" />}
    <p className="text-sm text-gray-600 mb-4">{message}</p>
    {cta && <Button onClick={onClick} className="bg-[#FF4500] hover:bg-orange-600" data-testid="tab-cta-btn">{cta}</Button>}
  </div>
);

const ProfileTabView = () => {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { user } = useAuth();
  const tab = search.get('tab');
  const meta = TAB_META[tab];

  // Render content for known tabs; unknown tabs fall back to a placeholder
  const renderContent = () => {
    switch (tab) {
      case 'verify-email': return <VerifyEmailView user={user} />;
      case 'password':     return <PasswordView />;
      case 'language':     return <LanguageView />;
      case 'currency':     return <CurrencyView />;
      case 'notifications':return <NotificationsView />;
      case 'documents':    return <ComingSoonView icon={FileText} message="Gestion des documents bientôt disponible. Pour le moment, contactez le support pour vérifier vos pièces." cta="Contacter le support" onClick={() => navigate('/support')} />;
      case 'cart':         return <ComingSoonView icon={ShoppingCart} message="Votre panier est géré directement depuis chaque commerçant." cta="Parcourir les commerces" onClick={() => navigate('/food')} />;
      case 'about':        return <ComingSoonView icon={User} message="Renseignez ici les infos requises pour le covoiturage : âge, fumeur/non-fumeur, animaux acceptés..." />;
      case 'company':      return <ComingSoonView icon={Briefcase} message="Liez votre compte à un profil d'entreprise pour facturer vos trajets en B2B." />;
      case 'articles':     return <ComingSoonView icon={Package} message="Retrouvez ici tous vos articles publiés sur la marketplace." cta="Aller à la marketplace" onClick={() => navigate('/marketplace/general')} />;
      case 'properties':   return <ComingSoonView icon={Buildings} message="Listez ici vos biens immobiliers en vente ou en location." cta="Voir les biens" onClick={() => navigate('/marketplace/real-estate')} />;
      case 'vehicles':     return <ComingSoonView icon={CarSimple} message="Listez ici vos véhicules à louer." cta="Voir les véhicules" onClick={() => navigate('/marketplace/car-rental')} />;
      case 'fav-home':     return <ComingSoonView icon={House} message="Ajoutez votre adresse domicile pour des trajets plus rapides." />;
      case 'fav-work':     return <ComingSoonView icon={Briefcase} message="Ajoutez votre adresse travail pour des trajets plus rapides." />;
      default:             return <ComingSoonView message="Cet écran n'est pas encore disponible." />;
    }
  };

  if (!meta) return null;
  const Icon = meta.icon;

  return (
    <div className="mobile-container min-h-screen bg-[#F2F2F7] pb-24" data-testid={`profile-tab-${tab}`}>
      {/* Header */}
      <div className="bg-[#FF4500] px-4 pt-6 pb-6 flex items-center gap-3">
        <button onClick={() => navigate('/profile')} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center" data-testid="tab-back-btn">
          <CaretLeft size={22} weight="bold" className="text-white" />
        </button>
        <div className="flex items-center gap-2">
          <Icon size={22} weight="fill" className="text-white" />
          <h1 className="text-lg font-bold text-white">{meta.title}</h1>
        </div>
      </div>
      <div className="px-4 py-5">{renderContent()}</div>
    </div>
  );
};

export default ProfileTabView;
