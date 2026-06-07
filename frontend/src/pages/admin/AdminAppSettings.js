import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { FloppyDisk, SlidersHorizontal, Gear, MagnifyingGlass } from '@phosphor-icons/react';
import { configAPI, adminAPI } from '../../services/api';

// Yes/No + select option maps (parité V3Cube)
const YESNO = [{ v: true, l: 'Oui' }, { v: false, l: 'Non' }];
const SELECTS = {
  driver_request_algorithm: [
    { v: 'distance', l: 'Le plus proche (distance)' },
    { v: 'broadcast', l: 'Diffusion à tous' },
    { v: 'manual', l: 'Manuel' },
  ],
  mobile_verification_method: [{ v: 'firebase', l: 'Firebase' }, { v: 'twilio', l: 'Twilio' }],
  sign_in_option: [{ v: 'password', l: 'Mot de passe' }, { v: 'otp', l: 'OTP' }],
  calling_method: [{ v: 'voip', l: 'VoIP' }, { v: 'masked', l: 'Numéro masqué' }, { v: 'direct', l: 'Appel direct' }],
  referral_earn_strategy: [{ v: 'fixed', l: 'Montant fixe' }, { v: 'percentage', l: 'Pourcentage' }],
  delivery_verification_method: [{ v: 'code', l: 'Code' }, { v: 'signature', l: 'Signature' }, { v: 'none', l: 'Aucune' }],
  default_distance_unit: [{ v: 'km', l: 'Kilomètres (km)' }, { v: 'mi', l: 'Miles (mi)' }],
};

// type: 'bool' | 'int' | 'text' | 'time' | key-of-SELECTS
const F = (key, label, type = 'bool', help = '') => ({ key, label, type, help });

const GENERAL_GROUPS = [
  {
    title: 'Identité & branding', fields: [
      F('project_name', 'Nom du projet', 'text'),
      F('support_email', 'E-mail support', 'text'),
      F('support_phone', 'Téléphone support', 'text'),
      F('support_whatsapp', 'WhatsApp support', 'text'),
      F('company_address', 'Adresse société', 'text'),
      F('email_from_name', "Nom de l'expéditeur e-mail", 'text'),
      F('copyright_admin', 'Copyright (admin)', 'text'),
      F('copyright_website', 'Copyright (site web)', 'text'),
    ],
  },
  {
    title: 'Localisation & affichage', fields: [
      F('country_code', 'Code pays', 'text'),
      F('default_distance_unit', 'Unité de distance', 'default_distance_unit'),
      F('records_per_page', 'Lignes par page', 'int'),
      F('enable_24hr_format', 'Format 24 heures'),
    ],
  },
  {
    title: 'Maintenance & liens', fields: [
      F('maintenance_mode_website', 'Mode maintenance — site web'),
      F('maintenance_mode_apps', 'Mode maintenance — apps'),
      F('enable_high_demand_areas', 'Zones de forte demande'),
      F('high_demand_radius_km', 'Rayon forte demande (km)', 'int'),
      F('android_app_link', 'Lien app Android', 'text'),
      F('ios_app_link', 'Lien app iOS', 'text'),
      F('google_analytics_id', 'Google Analytics ID', 'text'),
    ],
  },
];

const APP_GROUPS = [
  {
    title: 'Réservation & course', fields: [
      F('destination_changeable_anytime', "Destination modifiable à tout moment (app rider)"),
      F('taxi_hail_option', 'Option Taxi Hail (héler un taxi)'),
      F('book_for_someone', 'Réserver pour quelqu\u2019un'),
      F('show_service_estimation', 'Afficher l\u2019estimation du service'),
      F('send_pickup_location_photo', 'Photo du lieu de prise en charge'),
      F('restrict_passenger_limit', 'Limiter le nombre de passagers'),
      F('ride_later_hide_cancel_before_min', 'Réservation différée — masquer Annuler avant (min)', 'int'),
      F('ride_later_show_start_before_min', 'Réservation différée — afficher Démarrer avant (min)', 'int'),
      F('min_minutes_later_booking', 'Réservation différée min (minutes)', 'int'),
      F('max_minutes_later_booking', 'Réservation différée max (minutes)', 'int'),
      F('expire_scheduled_booking_after_min', 'Expirer la réservation programmée après (min)', 'int'),
      F('min_hours_later_booking_intercity', 'Intercité — délai min réservation (heures)', 'int'),
      F('radius_intercity_ride', 'Intercité — rayon (km)', 'int'),
      F('max_pickup_days_intercity', 'Intercité — jours max prise en charge', 'int'),
      F('max_round_trip_days_intercity', 'Intercité — jours max aller-retour', 'int'),
    ],
  },
  {
    title: 'Destinations, arrêts & Pool', fields: [
      F('enable_pool', 'Activer le Pool (covoiturage)'),
      F('enable_driver_destinations', 'Destinations chauffeur'),
      F('max_drive_destinations', 'Nombre max de destinations chauffeur', 'int'),
      F('enable_stop_over', 'Points d\u2019arrêt (stop-over)'),
      F('max_stop_over_points', 'Nombre max de points d\u2019arrêt', 'int'),
      F('reset_time_driver_destinations', 'Heure de réinit. des destinations chauffeur', 'time'),
      F('radius_show_online_drivers_km', 'Rayon chauffeurs en ligne (km)', 'int'),
      F('radius_pool_km', 'Rayon chauffeurs en ligne — Pool (km)', 'int'),
      F('radius_destination_driver_km', 'Rayon chauffeurs avec destination (km)', 'int'),
      F('destination_location_update_interval_min', 'Intervalle MAJ localisation destination (min)', 'int'),
      F('provider_availability_location_customize', 'Personnaliser la localisation de disponibilité chauffeur'),
    ],
  },
  {
    title: 'Dispatch', fields: [
      F('driver_request_algorithm', 'Algorithme de demande chauffeur', 'driver_request_algorithm'),
      F('driver_timeout', 'Délai d\u2019expiration chauffeur (s)', 'int'),
      F('rider_timeout_bid_taxi', 'Délai rider (enchère taxi) (s)', 'int'),
      F('show_route_on_driver_request', 'Afficher l\u2019itinéraire sur la demande chauffeur'),
      F('restrict_drivers_confirm_before_arrival', 'Bloquer la confirmation chauffeur avant arrivée'),
      F('driver_arrival_distance_limit_m', 'Distance limite d\u2019arrivée chauffeur (m)', 'int'),
      F('approx_time_driver_reach_per_km_min', 'Temps approx. chauffeur par km (min)', 'int'),
      F('reassign_after_accept', 'Réassigner un autre chauffeur après acceptation'),
      F('enable_send_request_before_trip_end', 'Envoyer une demande avant la fin de course'),
      F('send_request_before_trip_end_min', 'Avant fin de course — délai (min)', 'int'),
      F('send_request_before_trip_end_distance_km', 'Avant fin de course — distance (km)', 'int'),
    ],
  },
  {
    title: 'Chauffeur / Prestataire', fields: [
      F('allow_driver_edit_profile', 'Autoriser le chauffeur à modifier son profil (société/licence)'),
      F('allow_driver_edit_vehicle', 'Autoriser le chauffeur à modifier son véhicule'),
      F('driver_subscription_feature', 'Abonnement chauffeur'),
      F('driver_subscription_expiry_reminder_days', 'Rappel expiration abonnement (jours)', 'int'),
      F('enable_idle_insurance_report', 'Rapport assurance — temps d\u2019inactivité'),
      F('enable_trip_accept_insurance_report', 'Rapport assurance — acceptation course'),
      F('enable_trip_insurance_report', 'Rapport assurance — course'),
      F('ad_banner_driver', 'Bannière publicitaire chauffeur'),
      F('enable_driver_reward_program', 'Programme de récompenses chauffeur'),
      F('enable_driver_wallet_withdrawal', 'Demande de retrait portefeuille chauffeur'),
      F('driver_wallet_withdrawal_restriction_min', 'Retrait min portefeuille chauffeur', 'int'),
    ],
  },
  {
    title: 'Accessibilité', fields: [
      F('enable_handicap', 'Option accessibilité handicap'),
      F('enable_child_seat', 'Option siège enfant'),
      F('enable_gender_based_female', 'Course selon le genre (femmes uniquement)'),
    ],
  },
  {
    title: 'Tarifs & frais', fields: [
      F('enable_ride_fare_model_strategy', 'Stratégie de modèle tarifaire'),
      F('want_surge_on_flat_fare', 'Surcharge sur tarif fixe'),
      F('enable_extra_charges_scheduled_rides', 'Frais supplémentaires sur courses programmées'),
      F('extra_charges_amount_pct', 'Montant des frais supplémentaires (%)', 'int'),
      F('enable_surge_on_rental', 'Surcharge sur la location'),
      F('enable_waiting_charge_rental', 'Frais d\u2019attente — location'),
      F('enable_waiting_charge_flat_fare', 'Frais d\u2019attente — tarif fixe'),
      F('enable_manual_toll', 'Péage manuel'),
      F('enable_other_charges', 'Autres frais'),
      F('airport_surcharge', 'Surcharge aéroport'),
      F('manage_rounding', 'Gérer l\u2019arrondi'),
    ],
  },
  {
    title: 'Pourboire', fields: [
      F('enable_tip', 'Activer le pourboire'),
      F('ride_tip_amount_1', 'Pourboire — montant 1', 'int'),
      F('ride_tip_amount_2', 'Pourboire — montant 2', 'int'),
      F('ride_tip_amount_3', 'Pourboire — montant 3', 'int'),
      F('tip_duration_on_receipt', 'Durée du pourboire sur le reçu (jours)', 'int'),
    ],
  },
  {
    title: 'Récompenses & parrainage', fields: [
      F('enable_rider_reward_program', 'Programme de récompenses rider'),
      F('max_trips_rider_rewards', 'Courses max pour récompenses rider', 'int'),
      F('trip_specific_max_reward_amount', 'Récompense max par course', 'int'),
      F('coin_to_rider_amount', 'Valeur d\u20191 pièce (montant)', 'int'),
      F('coins_per_km_rider_reward', 'Pièces par km (récompense rider)', 'int'),
      F('enable_gift_card', 'Cartes cadeaux'),
      F('gift_card_max_amount', 'Montant max carte cadeau', 'int'),
      F('enable_favorite_driver', 'Chauffeur favori'),
      F('enable_referral_system', 'Système de parrainage'),
      F('enable_multi_level_referral', 'Parrainage multi-niveaux'),
      F('referral_amount_credit', 'Montant crédité au parrainage', 'int'),
      F('referral_level', 'Niveau de parrainage', 'int'),
      F('referral_earn_strategy', 'Stratégie de gain (multi-niveaux)', 'referral_earn_strategy'),
      F('bid_price_avg_deduction_pct', 'Déduction moyenne du prix d\u2019enchère (%)', 'int'),
    ],
  },
  {
    title: 'Fonctionnalités', fields: [
      F('enable_live_chat', 'Chat en direct'),
      F('live_chat_licence_number', 'Numéro de licence Live Chat', 'text'),
      F('enable_news', 'Fonction Actualités'),
      F('enable_donation', 'Fonction Don'),
      F('enable_corporate_profile', 'Profil entreprise'),
      F('in_transit_shopping', 'Achat en cours de trajet'),
      F('newsletter_subscription', 'Abonnement newsletter'),
      F('waybill_configuration', 'Configuration du bon de commande (waybill)'),
      F('enable_app_home_layout_2024', 'Nouvel accueil app'),
      F('enable_location_wise_promo', 'Promotions par localisation'),
      F('enable_smart_login', 'Smart login'),
      F('enable_skip_rating', 'Autoriser à passer la notation'),
      F('rating_duration_on_receipt', 'Durée notation sur le reçu (jours)', 'int'),
      F('ask_otp_before_start', 'Demander l\u2019OTP avant de démarrer la course'),
      F('country_wise_notification', 'Notification par pays'),
      F('location_wise_banner', 'Bannière par localisation'),
      F('ad_banner_rider', 'Bannière publicitaire rider'),
      F('ad_frequency_min', 'Fréquence des publicités (min)', 'int'),
    ],
  },
  {
    title: 'Sécurité & vérification', fields: [
      F('ask_otp_before_start', 'Demander l\u2019OTP avant de démarrer'),
      F('enable_safety_rating', 'Note de sécurité'),
      F('enable_face_mask_verification', 'Vérification du masque'),
      F('enable_safety_checklist_covid', 'Checklist sécurité (Covid)'),
      F('enable_cookie_consent', 'Consentement aux cookies'),
      F('delivery_verification_method', 'Méthode de vérification livraison', 'delivery_verification_method'),
      F('mobile_verification_method', 'Méthode de vérification mobile', 'mobile_verification_method'),
      F('sign_in_option', 'Option de connexion', 'sign_in_option'),
      F('calling_method', 'Méthode d\u2019appel', 'calling_method'),
      F('verification_code_resend_time_sec', 'Renvoi du code — délai (s)', 'int'),
      F('verification_code_resend_count', 'Renvoi du code — nombre', 'int'),
      F('verification_code_resend_restriction_min', 'Renvoi du code — restriction (min)', 'int'),
      F('verification_resend_time_sec_emergency', 'Renvoi (contacts urgence) — délai (s)', 'int'),
      F('verification_resend_count_emergency', 'Renvoi (contacts urgence) — nombre', 'int'),
      F('verification_resend_restriction_min_emergency', 'Renvoi (contacts urgence) — restriction (min)', 'int'),
      F('kiosk_booking_confirm_display_sec', 'Borne — durée d\u2019affichage confirmation (s)', 'int'),
      F('flag_riders_hours', 'Signaler les riders (heures)', 'int'),
      F('show_contacts_selected_count', 'Nombre de contacts affichés à la sélection', 'int'),
      F('disable_language_option', 'Désactiver l\u2019option de langue'),
      F('currency_update_ratio_app_id', 'Currency update ratio app id', 'text'),
    ],
  },
];

const TABS = [
  { key: 'general', label: 'Général', icon: Gear, groups: GENERAL_GROUPS },
  { key: 'app', label: 'App Settings', icon: SlidersHorizontal, groups: APP_GROUPS },
];

const Field = ({ field, value, onChange }) => {
  const tid = `setting-${field.key}`;
  const base = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400 bg-white';
  if (field.type === 'bool') {
    return (
      <select className={base} value={value ? 'true' : 'false'} onChange={(e) => onChange(field.key, e.target.value === 'true')} data-testid={tid}>
        {YESNO.map((o) => <option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}
      </select>
    );
  }
  if (SELECTS[field.type]) {
    return (
      <select className={base} value={value ?? ''} onChange={(e) => onChange(field.key, e.target.value)} data-testid={tid}>
        {SELECTS[field.type].map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    );
  }
  if (field.type === 'int') {
    return <input type="number" className={base} value={value ?? 0} onChange={(e) => onChange(field.key, e.target.value === '' ? 0 : parseInt(e.target.value, 10))} data-testid={tid} />;
  }
  if (field.type === 'time') {
    return <input type="time" className={base} value={value ?? ''} onChange={(e) => onChange(field.key, e.target.value)} data-testid={tid} />;
  }
  return <input type="text" className={base} value={value ?? ''} onChange={(e) => onChange(field.key, e.target.value)} data-testid={tid} />;
};

const AdminAppSettings = () => {
  const [activeTab, setActiveTab] = useState('general');
  const [general, setGeneral] = useState(null);
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [g, a] = await Promise.all([configAPI.getGeneralSettings(), configAPI.getAppSettings()]);
        if (!alive) return;
        setGeneral(g.data);
        setApp(a.data);
      } catch {
        toast.error('Échec du chargement des paramètres');
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, []);

  const tab = TABS.find((t) => t.key === activeTab);
  const isGeneral = activeTab === 'general';
  const values = isGeneral ? general : app;
  const setValues = isGeneral ? setGeneral : setApp;

  const onChange = (key, val) => setValues((prev) => ({ ...(prev || {}), [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isGeneral) {
        const r = await adminAPI.updateGeneralSettings(general);
        setGeneral(r.data);
      } else {
        const r = await adminAPI.updateAppSettings(app);
        setApp(r.data);
      }
      toast.success('Paramètres enregistrés');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec de l\u2019enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const groups = useMemo(() => {
    if (!tab) return [];
    const q = query.trim().toLowerCase();
    if (!q) return tab.groups;
    return tab.groups
      .map((g) => ({ ...g, fields: g.fields.filter((f) => f.label.toLowerCase().includes(q) || f.key.includes(q)) }))
      .filter((g) => g.fields.length > 0);
  }, [tab, query]);

  if (loading) {
    return <div className="p-8 text-center text-gray-400" data-testid="app-settings-loading">Chargement des paramètres…</div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto" data-testid="admin-app-settings-page">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Paramètres généraux</h1>
          <p className="text-sm text-gray-500">Configuration de l\u2019application (parité V3Cube) — branchée sur l\u2019app.</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-5 py-2.5 disabled:opacity-50 transition-colors"
          data-testid="app-settings-save-btn">
          <FloppyDisk size={18} weight="fill" />{saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-gray-200 mb-4">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.key === activeTab;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${active ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              data-testid={`app-settings-tab-${t.key}`}>
              <Icon size={18} weight={active ? 'fill' : 'regular'} />{t.label}
            </button>
          );
        })}
      </div>

      <div className="relative mb-5 max-w-sm">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un réglage…"
          className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-emerald-400"
          data-testid="app-settings-search" />
      </div>

      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.title} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5" data-testid={`settings-group-${g.title}`}>
            <h2 className="text-sm font-extrabold text-gray-800 uppercase tracking-wide mb-4">{g.title}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {g.fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{f.label}</label>
                  <Field field={f} value={values?.[f.key]} onChange={onChange} />
                </div>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="text-center text-gray-400 py-8">Aucun réglage ne correspond à « {query} ».</p>}
      </div>
    </div>
  );
};

export default AdminAppSettings;
