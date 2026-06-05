import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import {
  MagicWand, Truck, Lightning, VideoCamera, Gavel, Storefront,
  FirstAid, UsersThree, MapPin, Path, CurrencyEur, Airplane,
  Globe, Flag, XCircle, FileText, House, Slideshow, Tag, Translate, MagnifyingGlass, WhatsappLogo
} from '@phosphor-icons/react';
import { toast } from 'sonner';

const serviceConfigs = {
  genie: { title: 'Genie / Personal Assistant', icon: MagicWand, color: '#8B5CF6', desc: 'Service d\'assistant personnel a la demande', settings: [
    { key: 'enabled', label: 'Service actif', type: 'toggle', value: true },
    { key: 'base_fee', label: 'Frais de base (EUR)', type: 'number', value: 5 },
    { key: 'per_hour', label: 'Tarif horaire (EUR)', type: 'number', value: 15 },
    { key: 'commission', label: 'Commission (%)', type: 'number', value: 20 },
  ]},
  runner: { title: 'Runner / Coursier', icon: Truck, color: '#F59E0B', desc: 'Service de coursier express pour livraisons rapides', settings: [
    { key: 'enabled', label: 'Service actif', type: 'toggle', value: true },
    { key: 'base_fee', label: 'Frais de base (EUR)', type: 'number', value: 3 },
    { key: 'per_km', label: 'Prix par km (EUR)', type: 'number', value: 1.2 },
    { key: 'max_weight', label: 'Poids max (kg)', type: 'number', value: 25 },
  ]},
  ondemand: { title: 'On-Demand Services', icon: Lightning, color: '#EF4444', desc: 'Services a la demande (menage, reparation, etc.)', settings: [
    { key: 'enabled', label: 'Service actif', type: 'toggle', value: true },
    { key: 'min_booking', label: 'Reservation minimum (EUR)', type: 'number', value: 20 },
    { key: 'categories', label: 'Categories actives', type: 'text', value: 'Menage, Plomberie, Electricite, Jardinage' },
  ]},
  video: { title: 'Video Consultation', icon: VideoCamera, color: '#06B6D4', desc: 'Consultations video en direct avec des professionnels', settings: [
    { key: 'enabled', label: 'Service actif', type: 'toggle', value: true },
    { key: 'per_min', label: 'Tarif par minute (EUR)', type: 'number', value: 2 },
    { key: 'max_duration', label: 'Duree max (min)', type: 'number', value: 60 },
  ]},
  bids: { title: 'Bidding / Encheres', icon: Gavel, color: '#10B981', desc: 'Systeme d\'encheres pour services et courses', settings: [
    { key: 'enabled', label: 'Service actif', type: 'toggle', value: true },
    { key: 'min_bid', label: 'Enchere minimum (EUR)', type: 'number', value: 5 },
    { key: 'bid_duration', label: 'Duree enchere (min)', type: 'number', value: 5 },
  ]},
  marketplace: { title: 'Marketplace', icon: Storefront, color: '#EC4899', desc: 'Place de marche pour produits et services', settings: [
    { key: 'enabled', label: 'Service actif', type: 'toggle', value: true },
    { key: 'commission', label: 'Commission (%)', type: 'number', value: 15 },
    { key: 'min_price', label: 'Prix min produit (EUR)', type: 'number', value: 1 },
  ]},
  medical: { title: 'Medical / Sante', icon: FirstAid, color: '#EF4444', desc: 'Services de sante et consultations medicales', settings: [
    { key: 'enabled', label: 'Service actif', type: 'toggle', value: false },
    { key: 'consultation_fee', label: 'Frais consultation (EUR)', type: 'number', value: 25 },
  ]},
  rideshare: { title: 'Rideshare / Covoiturage', icon: UsersThree, color: '#3B82F6', desc: 'Partage de trajets entre utilisateurs', settings: [
    { key: 'enabled', label: 'Service actif', type: 'toggle', value: true },
    { key: 'max_passengers', label: 'Passagers max', type: 'number', value: 4 },
    { key: 'discount', label: 'Reduction pool (%)', type: 'number', value: 30 },
  ]},
  nearby: { title: 'Nearby / A proximite', icon: MapPin, color: '#F59E0B', desc: 'Decouvrir commerces et services a proximite', settings: [
    { key: 'enabled', label: 'Service actif', type: 'toggle', value: true },
    { key: 'radius', label: 'Rayon par defaut (km)', type: 'number', value: 5 },
  ]},
  tracking: { title: 'Live Tracking', icon: Path, color: '#10B981', desc: 'Suivi en temps reel des courses et livraisons', settings: [
    { key: 'enabled', label: 'Service actif', type: 'toggle', value: true },
    { key: 'refresh_interval', label: 'Intervalle refresh (s)', type: 'number', value: 5 },
  ]},
  'location-fare': { title: 'Location Based Fare', icon: CurrencyEur, color: '#8B5CF6', desc: 'Tarification dynamique par zone geographique', settings: [
    { key: 'enabled', label: 'Service actif', type: 'toggle', value: true },
    { key: 'surge_max', label: 'Multiplicateur max', type: 'number', value: 3.0 },
    { key: 'peak_hours', label: 'Heures de pointe', type: 'text', value: '07:00-09:00, 17:00-19:00' },
  ]},
  country: { title: 'Country Settings', icon: Globe, color: '#06B6D4', desc: 'Configuration par pays', settings: [
    { key: 'default_country', label: 'Pays par defaut', type: 'text', value: 'France' },
    { key: 'supported', label: 'Pays supportes', type: 'text', value: 'France, Martinique, Guadeloupe, Guyane, Reunion' },
  ]},
  state: { title: 'State / Region Settings', icon: Flag, color: '#F59E0B', desc: 'Configuration par region/departement', settings: [
    { key: 'default_state', label: 'Region par defaut', type: 'text', value: 'Martinique' },
    { key: 'active_regions', label: 'Regions actives', type: 'text', value: 'Ile-de-France, Martinique, Guadeloupe' },
  ]},
  'cancel-reasons': { title: 'Raisons d\'annulation', icon: XCircle, color: '#EF4444', desc: 'Motifs d\'annulation configures', settings: [
    { key: 'reasons_client', label: 'Raisons client', type: 'text', value: 'Chauffeur trop loin, Changement de plan, Tarif trop eleve, Erreur de destination' },
    { key: 'reasons_driver', label: 'Raisons chauffeur', type: 'text', value: 'Client introuvable, Probleme vehicule, Urgence personnelle, Client agressif' },
    { key: 'penalty', label: 'Penalite annulation (EUR)', type: 'number', value: 5 },
  ]},
  pages: { title: 'Manage Pages', icon: FileText, color: '#374151', desc: 'Pages statiques du site et de l\'app', settings: [
    { key: 'about', label: 'Page A propos', type: 'text', value: 'Active' },
    { key: 'terms', label: 'Conditions generales', type: 'text', value: 'Active' },
    { key: 'privacy', label: 'Politique de confidentialite', type: 'text', value: 'Active' },
    { key: 'faq', label: 'FAQ', type: 'text', value: 'Active' },
  ]},
  'app-home': { title: 'App Home Customization', icon: House, color: '#10B981', desc: 'Personnaliser l\'ecran d\'accueil de l\'app', settings: [
    { key: 'banner_enabled', label: 'Banniere active', type: 'toggle', value: true },
    { key: 'services_grid', label: 'Grille services (colonnes)', type: 'number', value: 4 },
    { key: 'promo_section', label: 'Section promo active', type: 'toggle', value: true },
  ]},
  intro: { title: 'Intro / Onboarding', icon: Slideshow, color: '#8B5CF6', desc: 'Ecrans d\'introduction de l\'application', settings: [
    { key: 'enabled', label: 'Onboarding actif', type: 'toggle', value: true },
    { key: 'slides', label: 'Nombre de slides', type: 'number', value: 3 },
    { key: 'skip_enabled', label: 'Bouton Ignorer', type: 'toggle', value: true },
  ]},
  labels: { title: 'Labels & Translations', icon: Tag, color: '#F59E0B', desc: 'Gerer les traductions et labels de l\'application', settings: [
    { key: 'default_lang', label: 'Langue par defaut', type: 'text', value: 'fr' },
    { key: 'supported', label: 'Langues supportees', type: 'text', value: 'fr, en, es, de, pt, ar' },
    { key: 'rtl_support', label: 'Support RTL', type: 'toggle', value: true },
  ]},
  currency: { title: 'Devise (Currency)', icon: CurrencyEur, color: '#10B981', desc: 'Devise par defaut et taux de change de la plateforme', settings: [
    { key: 'default_currency', label: 'Devise par defaut (code ISO)', type: 'text', value: 'EUR' },
    { key: 'symbol', label: 'Symbole', type: 'text', value: '€' },
    { key: 'position', label: 'Position symbole (before/after)', type: 'text', value: 'after' },
    { key: 'exchange_rate', label: 'Taux de change (vs EUR)', type: 'number', value: 1 },
    { key: 'supported', label: 'Devises supportees', type: 'text', value: 'EUR, USD, XOF, XAF' },
  ]},
  language: { title: 'Langue (Language)', icon: Translate, color: '#8B5CF6', desc: 'Langues disponibles dans les apps et le panneau', settings: [
    { key: 'default_lang', label: 'Langue par defaut', type: 'text', value: 'fr' },
    { key: 'supported', label: 'Langues actives', type: 'text', value: 'fr, en, es' },
    { key: 'auto_detect', label: 'Detection auto (navigateur/appareil)', type: 'toggle', value: true },
    { key: 'rtl_support', label: 'Support RTL', type: 'toggle', value: false },
  ]},
  seo: { title: 'Parametres SEO', icon: MagnifyingGlass, color: '#3B82F6', desc: 'Meta-donnees pour le referencement du site web', settings: [
    { key: 'meta_title', label: 'Titre meta (Home)', type: 'text', value: 'SB Drive VTC — Reservez votre chauffeur' },
    { key: 'meta_description', label: 'Description meta', type: 'text', value: 'Plateforme VTC, livraisons et services a la demande en Martinique, Guadeloupe et Guyane.' },
    { key: 'meta_keywords', label: 'Mots-cles', type: 'text', value: 'VTC, taxi, livraison, Martinique, chauffeur' },
    { key: 'og_image', label: 'Image Open Graph (URL)', type: 'text', value: '' },
    { key: 'sitemap_enabled', label: 'Sitemap actif', type: 'toggle', value: true },
  ]},
  'maps-api': { title: 'Parametres Maps / Geo API', icon: MapPin, color: '#EF4444', desc: 'Configuration des services de cartographie et geolocalisation', settings: [
    { key: 'provider', label: 'Fournisseur (google/leaflet)', type: 'text', value: 'google' },
    { key: 'google_maps_key', label: 'Cle API Google Maps', type: 'text', value: '' },
    { key: 'geocoding_enabled', label: 'Geocodage actif', type: 'toggle', value: true },
    { key: 'directions_enabled', label: 'Itineraires (Directions) actifs', type: 'toggle', value: true },
    { key: 'default_zoom', label: 'Zoom par defaut', type: 'number', value: 12 },
  ]},
  pool: { title: 'Configuration Pool (Course partagée)', icon: UsersThree, color: '#FF5000', desc: 'Paramètres du taxi partagé : activation, tarif par siège et capacité (parité V3Cube)', settings: [
    { key: 'enable_pool', label: 'Activer le Pool (Shared Ride)', type: 'toggle', value: true },
    { key: 'pool_percentage', label: 'Pool Percentage (% du 1er siège facturé par siège suppl.)', type: 'number', value: 90 },
    { key: 'available_seats', label: 'Sièges disponibles (capacité, hors chauffeur)', type: 'number', value: 4 },
    { key: 'fare_model', label: 'Modèle tarifaire (Fixed si Pool actif)', type: 'text', value: 'Fixed' },
    { key: 'share_discount_enabled', label: 'Réduction covoiturage active (manuel on/off)', type: 'toggle', value: true },
    { key: 'share_discount_percent', label: 'Réduction covoiturage de base (%) à 2 passagers', type: 'number', value: 30 },
    { key: 'share_discount_step_percent', label: 'Bonus par passager supplémentaire (%)', type: 'number', value: 15 },
    { key: 'share_discount_max_percent', label: 'Réduction maximale (%) plafond', type: 'number', value: 60 },
    { key: 'share_discount_hours', label: 'Programmation (plages, ex: 07:00-10:00,17:00-20:00 — vide = toujours)', type: 'text', value: '' },
  ]},
  ride_search: { title: 'Recherche chauffeur (Relances)', icon: MagnifyingGlass, color: '#3B82F6', desc: 'Cadence des relances et options proposées (Proposer votre tarif / Planifier) quand aucun chauffeur n\'accepte', settings: [
    { key: 'enabled', label: 'Activer les options après 3 relances (modal Proposer/Planifier)', type: 'toggle', value: true },
    { key: 'relance_interval_seconds', label: 'Intervalle entre relances (secondes, min 5)', type: 'number', value: 20 },
    { key: 'max_relances', label: 'Nombre de relances avant de proposer les options', type: 'number', value: 3 },
  ]},
  no_driver_alerts: { title: 'Alertes pénurie chauffeurs', icon: MapPin, color: '#EF4444', desc: 'Alerter l\'admin quand une zone dépasse un seuil de courses sans chauffeur, et déclencher une prime chauffeur temporaire', settings: [
    { key: 'enabled', label: 'Activer les alertes de zone', type: 'toggle', value: true },
    { key: 'zone_threshold', label: 'Seuil (nb de courses sans chauffeur par zone)', type: 'number', value: 3 },
    { key: 'window_minutes', label: 'Fenêtre d\'observation (minutes)', type: 'number', value: 60 },
    { key: 'auto_bonus_enabled', label: 'Déclencher automatiquement une prime chauffeur', type: 'toggle', value: false },
    { key: 'bonus_amount', label: 'Montant de la prime chauffeur (€)', type: 'number', value: 5 },
    { key: 'bonus_duration_minutes', label: 'Durée de la prime (minutes)', type: 'number', value: 60 },
  ]},
};

const API = process.env.REACT_APP_BACKEND_URL;

const AdminServiceConfig = ({ serviceKey = 'genie' }) => {
  const config = serviceConfigs[serviceKey];
  const [settings, setSettings] = useState(() => (config?.settings || []).map(s => ({ ...s })));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!config) return;
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceKey]);

  if (!config) {
    return (
      <div className="p-8" data-testid={`placeholder-${serviceKey}`}>
        <div className="max-w-md mx-auto text-center bg-white rounded-2xl p-8 shadow-sm">
          <div className="text-5xl mb-3">🚧</div>
          <h2 className="text-lg font-bold text-gray-800 mb-1">Configuration bientot disponible</h2>
          <p className="text-sm text-gray-500">La page de configuration pour <code className="bg-gray-100 px-2 py-0.5 rounded">{serviceKey}</code> n'est pas encore implementee.</p>
        </div>
      </div>
    );
  }
  const Icon = config.icon;

  const loadConfig = async () => {
    try {
      const res = await fetch(`${API}/api/admin/service-config/${serviceKey}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.settings && Object.keys(data.settings).length > 0) {
          setSettings(prev => prev.map(s => ({
            ...s,
            value: data.settings[s.key] !== undefined ? data.settings[s.key] : s.value,
          })));
        }
      }
    } catch (err) { console.error('Failed to load config:', err); }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const settingsObj = {};
      settings.forEach(s => { settingsObj[s.key] = s.value; });
      const res = await fetch(`${API}/api/admin/service-config/${serviceKey}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ settings: settingsObj }),
      });
      if (!res.ok) throw new Error('save failed');
      toast.success('Parametres sauvegardes !');
    } catch (err) { console.error('Save error:', err); toast.error('Erreur de sauvegarde'); }
    finally { setSaving(false); }
  };

  return (
    <div className="p-6" data-testid={`admin-service-${serviceKey}`}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: config.color + '15' }}>
          <Icon size={24} style={{ color: config.color }} weight="duotone" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{config.title}</h1>
          <p className="text-sm text-gray-500">{config.desc}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-2xl space-y-5">
        {settings.map(s => (
          <div key={s.key}>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">{s.label}</label>
            {s.type === 'toggle' ? (
              <button onClick={() => updateSetting(s.key, !s.value)} className={`w-12 h-7 rounded-full relative transition-colors ${s.value ? 'bg-green-500' : 'bg-gray-300'}`}>
                <div className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${s.value ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            ) : s.type === 'number' ? (
              <Input type="number" value={s.value} onChange={e => updateSetting(s.key, parseFloat(e.target.value) || 0)} />
            ) : s.type === 'textarea' ? (
              <Textarea value={s.value} onChange={e => updateSetting(s.key, e.target.value)} rows={6} data-testid={`config-${s.key}`} />
            ) : (
              <Input value={s.value} onChange={e => updateSetting(s.key, e.target.value)} />
            )}
          </div>
        ))}
        <Button onClick={handleSave} disabled={saving} className="bg-[#3b82f6] text-white w-full">
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </Button>
      </div>
    </div>
  );
};

export default AdminServiceConfig;
