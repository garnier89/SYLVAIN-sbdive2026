// FR base bundle (mirror of backend routes/i18n.py BASE_BUNDLE_FR).
// Embedded so t() resolves instantly in French with no network flash and
// acts as a fallback for any key missing from a translated bundle.
export const BASE_BUNDLE_FR = {
  app_name: 'SB Drive VTC',
  common: { loading: 'Chargement...', error: 'Une erreur est survenue', retry: 'Reessayer', save: 'Enregistrer', cancel: 'Annuler', confirm: 'Confirmer', continue: 'Continuer', back: 'Retour', close: 'Fermer', next: 'Suivant', skip: 'Passer', search: 'Rechercher', yes: 'Oui', no: 'Non', ok: 'OK' },
  auth: { welcome: 'Bienvenue', subtitle: 'Votre super-app de mobilite', login: 'Connexion', register: "S'inscrire", logout: 'Deconnexion', email: 'Email', phone: 'Telephone', password: 'Mot de passe', name: 'Nom complet', forgot_password: 'Mot de passe oublie ?', no_account: 'Pas de compte ?', have_account: 'Deja un compte ?', continue_with_google: 'Continuer avec Google', continue_with_email: 'Continuer avec Email', continue_with_phone: 'Continuer avec Telephone', phone_login_title: 'Saisissez votre numero', phone_login_hint: 'Vous recevrez un code de verification', otp_title: 'Code de verification', otp_hint: 'Saisissez le code envoye au {{phone}}', send_otp: 'Envoyer le code', verify_otp: 'Verifier', select_role: 'Je suis...', role_user: 'Client', role_driver: 'Chauffeur', role_merchant: 'Marchand' },
  tabs: { home: 'Accueil', services: 'Services', orders: 'Mes courses', wallet: 'Portefeuille', profile: 'Profil', rides: 'Courses', earnings: 'Gains', jobs: 'Missions', dashboard: 'Tableau de bord' },
  user_home: { hello: 'Bonjour {{name}}', where_to: 'Ou allez-vous ?', categories: 'Categories', promos: 'Promotions', recent: 'Recents', taxi: 'Taxi', moto: 'Moto', carpool: 'Covoiturage', food: 'Food', delivery: 'Livraison', runner: 'Coursier', beauty: 'Beaute', pet: 'Animaux', car_care: 'Auto', towing: 'Depannage', marketplace: 'Marketplace', nearby: 'Pres de moi', on_demand: 'Services' },
  booking: { title: 'Reserver un taxi', pickup: 'Lieu de prise en charge', dropoff: 'Destination', vehicle_type: 'Type de vehicule', estimate: 'Estimer', book_now: 'Reserver', confirm_pickup: 'Confirmer le depart', confirm_dropoff: "Confirmer l'arrivee", fare_estimate: 'Tarif estime', distance: 'Distance', duration: 'Duree', no_drivers: 'Aucun chauffeur disponible', searching_driver: "Recherche d'un chauffeur..." },
  driver: { online: 'En ligne', offline: 'Hors ligne', go_online: 'Passer en ligne', go_offline: 'Passer hors ligne', new_ride: 'Nouvelle course', accept: 'Accepter', decline: 'Refuser', navigate: 'Naviguer', start_ride: 'Demarrer la course', complete_ride: 'Terminer la course', earnings_today: 'Gains du jour', earnings_week: 'Cette semaine', rides_today: 'Courses du jour', rating: 'Note', acceptance: 'Acceptation', cancellation: 'Annulation', activity_score: "Score d'activite", my_activity: 'Mon activite', priority: 'Priorite', palette_beginner: 'Debutant', palette_standard: 'Standard', palette_confirmed: 'Confirme', palette_expert: 'Expert' },
  merchant: { dashboard: 'Tableau de bord', orders: 'Commandes', products: 'Produits', today_orders: 'Commandes du jour', today_revenue: 'CA du jour', pending: 'En attente', preparing: 'En preparation', ready: 'Pret', delivered: 'Livre' },
  wallet: { title: 'Portefeuille', balance: 'Solde', topup: 'Recharger', history: 'Historique', amount: 'Montant' },
  profile: { title: 'Profil', settings: 'Parametres', language: 'Langue', help: 'Aide', about: 'A propos', rate_app: "Noter l'application" },
  voice: { title: 'Assistant vocal', listening: 'Ecoute en cours...', tap_to_speak: 'Appuyez pour parler', say_something: 'Dites "reserver un taxi pour ..."' },
  login: { phone_title: 'Entrez votre numéro de mobile', mobile: 'Mobile', other_options: 'Ou choisir une autre option de connexion', terms_agree: "En continuant, j'accepte les", terms_link: 'Conditions Générales', create_password: 'Créer un mot de passe', enter_password: 'Entrez votre mot de passe', create_password_hint: 'Choisissez un mot de passe sécurisé pour votre compte', login_with_number: 'Connectez-vous avec le numéro {{number}}', confirm_password: 'Confirmer le mot de passe', complete_profile: 'Complétez votre profil', complete_profile_hint: 'Quelques informations pour personnaliser votre expérience', lastname: 'Nom', firstname: 'Prénom', optional: '(facultatif)', referral_code: 'Code de parrainage', create_account: 'Créer mon compte', choose_account: 'Choisir un compte', email_password: 'Email & mot de passe' },
  menu: { wallet_balance: 'Balance de portefeuille', general_settings: 'Réglages généraux', buy_sell_rent: 'Acheter, vendre et louer', account_settings: 'Paramètre du compte', payment: 'Paiement', gift_card: 'Carte cadeau', favorite_places: 'Lieux favoris', support: 'Soutien', other: 'Autre', about_you: 'À propos de vous', carpool_only: 'Requis uniquement pour le covoiturage', my_bookings: 'Mes réservations', the_bookings: 'Les réservations', company_profile: "Profil de l'entreprise", my_cart: 'Mon panier', notifications: 'Les notifications', news: 'Actualités', favorite_drivers: 'Chauffeurs favoris', invite_friends: 'Inviter des amis', invite: 'Inviter', emergency_contacts: "Contacts d'urgence", make_donation: 'Faire un don', items_list: "Votre liste générale d'articles", properties_list: 'Votre liste de propriétés', cars_list: 'Votre liste de voitures', enable_faceid: 'Activer Face ID/Touch ID', manage_account: 'Gérer son compte', manage_documents: 'Gérer les documents', change_password: 'Changer le mot de passe', change_currency: 'Changer de devise', change_language: 'Changer de langue', payment_method: 'Mode de paiement', my_wallet: 'Mon portefeuille', add_money: "Ajouter de l'argent", send_money: "Envoyer de l'argent", send_gift: 'Envoyer une carte-cadeau', redeem_gift: 'Échanger une carte-cadeau', add_home: 'Ajouter une maison', add_work: 'Ajouter du travail', about_us: 'À propos de nous', privacy: 'Politique de confidentialité', terms: 'Termes et conditions', faq: 'FAQ', live_chat: 'Parler en direct', contact_us: 'Contactez-nous', logout: 'Se déconnecter', topup: 'Recharger' },
};

export function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = `${prefix}${k}`;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, `${key}.`));
    else out[key] = v;
  }
  return out;
}

export const BASE_FLAT_FR = flatten(BASE_BUNDLE_FR);

// Interpolate {{var}} and {var} placeholders.
export function interpolate(str, vars) {
  if (!str || !vars) return str;
  return String(str).replace(/\{\{?\s*(\w+)\s*\}?\}/g, (m, name) => (vars[name] != null ? String(vars[name]) : m));
}
