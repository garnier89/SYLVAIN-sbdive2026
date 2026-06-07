"""
Internationalization engine (i18n) — 30+ langues + traduction automatique LLM.

- Catalogue de 32 langues populaires (avec drapeau + sens RTL).
- Bundle de base FR/EN = source de vérité des libellés de l'app mobile.
- Moteur de traduction automatique (Claude via Emergent LLM key) : 1 clic
  traduit TOUTES les clés vers une langue cible (placeholders préservés),
  stocké en base (collection `i18n_app_bundles`).
- Endpoints publics consommés par les apps (mobile) : /languages, /bundle/{lang}.
- Endpoints admin : overview, activate, auto-translate, override d'une clé.

Collections: i18n_languages, i18n_app_bundles
"""
import os
import json as _json
import uuid
from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone

from core.config import db
from core.permissions import require_permission

router = APIRouter(prefix="/i18n", tags=["i18n"])

# ------------------------------------------------------------------
# Catalogue de langues populaires (native name + flag + RTL)
# ------------------------------------------------------------------
LANGUAGE_CATALOG = [
    {"code": "fr", "name": "Français", "flag": "🇫🇷", "is_rtl": False},
    {"code": "en", "name": "English", "flag": "🇬🇧", "is_rtl": False},
    {"code": "es", "name": "Español", "flag": "🇪🇸", "is_rtl": False},
    {"code": "pt", "name": "Português", "flag": "🇵🇹", "is_rtl": False},
    {"code": "de", "name": "Deutsch", "flag": "🇩🇪", "is_rtl": False},
    {"code": "it", "name": "Italiano", "flag": "🇮🇹", "is_rtl": False},
    {"code": "nl", "name": "Nederlands", "flag": "🇳🇱", "is_rtl": False},
    {"code": "pl", "name": "Polski", "flag": "🇵🇱", "is_rtl": False},
    {"code": "ru", "name": "Русский", "flag": "🇷🇺", "is_rtl": False},
    {"code": "uk", "name": "Українська", "flag": "🇺🇦", "is_rtl": False},
    {"code": "ro", "name": "Română", "flag": "🇷🇴", "is_rtl": False},
    {"code": "el", "name": "Ελληνικά", "flag": "🇬🇷", "is_rtl": False},
    {"code": "tr", "name": "Türkçe", "flag": "🇹🇷", "is_rtl": False},
    {"code": "ar", "name": "العربية", "flag": "🇸🇦", "is_rtl": True},
    {"code": "fa", "name": "فارسی", "flag": "🇮🇷", "is_rtl": True},
    {"code": "ur", "name": "اردو", "flag": "🇵🇰", "is_rtl": True},
    {"code": "he", "name": "עברית", "flag": "🇮🇱", "is_rtl": True},
    {"code": "hi", "name": "हिन्दी", "flag": "🇮🇳", "is_rtl": False},
    {"code": "bn", "name": "বাংলা", "flag": "🇧🇩", "is_rtl": False},
    {"code": "ta", "name": "தமிழ்", "flag": "🇮🇳", "is_rtl": False},
    {"code": "zh", "name": "中文", "flag": "🇨🇳", "is_rtl": False},
    {"code": "ja", "name": "日本語", "flag": "🇯🇵", "is_rtl": False},
    {"code": "ko", "name": "한국어", "flag": "🇰🇷", "is_rtl": False},
    {"code": "th", "name": "ไทย", "flag": "🇹🇭", "is_rtl": False},
    {"code": "vi", "name": "Tiếng Việt", "flag": "🇻🇳", "is_rtl": False},
    {"code": "id", "name": "Bahasa Indonesia", "flag": "🇮🇩", "is_rtl": False},
    {"code": "ms", "name": "Bahasa Melayu", "flag": "🇲🇾", "is_rtl": False},
    {"code": "tl", "name": "Filipino", "flag": "🇵🇭", "is_rtl": False},
    {"code": "sw", "name": "Kiswahili", "flag": "🇰🇪", "is_rtl": False},
    {"code": "ha", "name": "Hausa", "flag": "🇳🇬", "is_rtl": False},
    {"code": "yo", "name": "Yorùbá", "flag": "🇳🇬", "is_rtl": False},
    {"code": "am", "name": "አማርኛ", "flag": "🇪🇹", "is_rtl": False},
    # Suédois, Grec (déjà el), Slovène
    {"code": "sv", "name": "Svenska", "flag": "🇸🇪", "is_rtl": False},
    {"code": "sl", "name": "Slovenščina", "flag": "🇸🇮", "is_rtl": False},
    # Créoles à base française (DOM-TOM + Haïti)
    {"code": "gcf", "name": "Kréyòl Gwadloupéyen", "flag": "🇬🇵", "is_rtl": False},
    {"code": "gcf-mq", "name": "Kréyòl Matinik", "flag": "🇲🇶", "is_rtl": False},
    {"code": "ht", "name": "Kreyòl Ayisyen", "flag": "🇭🇹", "is_rtl": False},
    {"code": "rcf", "name": "Kréol Rénioné", "flag": "🇷🇪", "is_rtl": False},
    {"code": "gcr", "name": "Kriyòl Giyanè", "flag": "🇬🇫", "is_rtl": False},
    # Langues africaines
    {"code": "ln", "name": "Lingála", "flag": "🇨🇩", "is_rtl": False},
    {"code": "wo", "name": "Wolof", "flag": "🇸🇳", "is_rtl": False},
    {"code": "bci", "name": "Baoulé", "flag": "🇨🇮", "is_rtl": False},
    {"code": "dyu", "name": "Dioula", "flag": "🇨🇮", "is_rtl": False},
]

# Langues actives par défaut (les autres : activables par l'admin)
DEFAULT_ACTIVE = {"fr", "en", "es"}
DEFAULT_LANG = "fr"

# ------------------------------------------------------------------
# Bundles de base (source de vérité) — miroir des locales mobiles.
# ------------------------------------------------------------------
BASE_BUNDLE_FR = {
    "app_name": "SB Drive VTC",
    "common": {"loading": "Chargement...", "error": "Une erreur est survenue", "retry": "Reessayer", "save": "Enregistrer", "cancel": "Annuler", "confirm": "Confirmer", "continue": "Continuer", "back": "Retour", "close": "Fermer", "next": "Suivant", "skip": "Passer", "search": "Rechercher", "yes": "Oui", "no": "Non", "ok": "OK"},
    "auth": {"welcome": "Bienvenue", "subtitle": "Votre super-app de mobilite", "login": "Connexion", "register": "S'inscrire", "logout": "Deconnexion", "email": "Email", "phone": "Telephone", "password": "Mot de passe", "name": "Nom complet", "forgot_password": "Mot de passe oublie ?", "no_account": "Pas de compte ?", "have_account": "Deja un compte ?", "continue_with_google": "Continuer avec Google", "continue_with_email": "Continuer avec Email", "continue_with_phone": "Continuer avec Telephone", "phone_login_title": "Saisissez votre numero", "phone_login_hint": "Vous recevrez un code de verification", "otp_title": "Code de verification", "otp_hint": "Saisissez le code envoye au {{phone}}", "send_otp": "Envoyer le code", "verify_otp": "Verifier", "select_role": "Je suis...", "role_user": "Client", "role_driver": "Chauffeur", "role_merchant": "Marchand"},
    "tabs": {"home": "Accueil", "services": "Services", "orders": "Mes courses", "wallet": "Portefeuille", "profile": "Profil", "rides": "Courses", "earnings": "Gains", "jobs": "Missions", "dashboard": "Tableau de bord"},
    "user_home": {"hello": "Bonjour {{name}}", "where_to": "Ou allez-vous ?", "categories": "Categories", "promos": "Promotions", "recent": "Recents", "taxi": "Taxi", "moto": "Moto", "carpool": "Covoiturage", "food": "Food", "delivery": "Livraison", "runner": "Coursier", "beauty": "Beaute", "pet": "Animaux", "car_care": "Auto", "towing": "Depannage", "marketplace": "Marketplace", "nearby": "Pres de moi", "on_demand": "Services"},
    "booking": {"title": "Reserver un taxi", "pickup": "Lieu de prise en charge", "dropoff": "Destination", "vehicle_type": "Type de vehicule", "estimate": "Estimer", "book_now": "Reserver", "confirm_pickup": "Confirmer le depart", "confirm_dropoff": "Confirmer l'arrivee", "fare_estimate": "Tarif estime", "distance": "Distance", "duration": "Duree", "no_drivers": "Aucun chauffeur disponible", "searching_driver": "Recherche d'un chauffeur..."},
    "driver": {"online": "En ligne", "offline": "Hors ligne", "go_online": "Passer en ligne", "go_offline": "Passer hors ligne", "new_ride": "Nouvelle course", "accept": "Accepter", "decline": "Refuser", "navigate": "Naviguer", "start_ride": "Demarrer la course", "complete_ride": "Terminer la course", "earnings_today": "Gains du jour", "earnings_week": "Cette semaine", "rides_today": "Courses du jour", "rating": "Note", "acceptance": "Acceptation", "cancellation": "Annulation", "activity_score": "Score d'activite", "my_activity": "Mon activite", "priority": "Priorite", "palette_beginner": "Debutant", "palette_standard": "Standard", "palette_confirmed": "Confirme", "palette_expert": "Expert", "trips_today": "Voyages/emplois d'aujourd'hui", "avg_rating": "Moy. Evaluation", "jobs_upcoming": "Emplois a venir", "jobs_pending": "Emplois en attente", "ride_in_progress": "Course en cours", "ride_active": "Course active", "resume": "Reprendre", "pool_request": "Demande Pool ({{seats}} pers.)", "demande": "Demande", "bidding_request": "Enchère", "passenger_offer": "Tarif proposé par le passager", "est_price": "Prix estime", "pickup_estimate": "Estimation du ramassage", "trip_estimate": "Estimation du voyage", "minutes": "minute(s)", "no_distance": "— de distance", "pickup_location": "Lieu de ramassage", "destination_address": "Adresse de destination", "passenger": "Passager", "your_offer_sent": "Votre offre envoyee", "offer_expired": "Offre expiree — renvoyez-la", "offer_expires_in": "Expire dans {{s}}s · en attente du client", "renew_offer": "Renouveler mon offre", "propose_other_price": "Proposer un autre prix", "send": "Envoyer", "header_in_progress": "COURSE EN COURS", "header_enroute": "EN ROUTE", "header_pickup": "Prendre le passager", "destination": "Destination", "live": "En direct", "reconnecting": "Reconnexion…", "waiting": "Attente", "billed": "facture", "record_video": "Enregistrer une video a l'interieur d'un taxi", "slide_arrive": "GLISSEZ POUR ARRIVER", "slide_start": "GLISSEZ POUR COMMENCER LE VOYAGE", "slide_finish": "GLISSER POUR TERMINER LE VOYAGE", "finish_trip_q": "Terminer la course ?", "finish_far_warn": "Vous etes encore a {{dist}} de la destination. Etes-vous sur de vouloir terminer le voyage maintenant ?", "yes_finish": "Oui, terminer", "minutes_full": "minutes", "passenger_details": "Voir les details du passager", "waybill": "Lettre de voiture", "cancel_trip": "Annuler le voyage", "choose_call_type": "Choisissez le type d'appel", "video_call": "Appel video", "voice_call": "Appel vocal", "safety_tools": "Outils de securite", "call_112": "Appel 112", "send_sos": "Envoyer un message SOS", "audio_recording": "Enregistrement audio", "share_trip_status": "Partager le statut du voyage", "otp_phone_title": "Verification par telephone", "otp_phone_hint": "Le passager ne peut pas donner le code (telephone eteint ?). Saisissez les 4 derniers chiffres de son numero de telephone enregistre.", "otp_hint": "Demandez au passager son code OTP a 4 chiffres pour demarrer la course.", "verify_start": "Verifier & demarrer", "start": "Demarrer", "my_earnings": "Mes gains", "weekly_reports": "Rapports hebdo", "total_earnings": "Gains totaux", "rides_word": "courses", "today": "Aujourd'hui", "week": "Semaine", "month": "Mois", "earnings_day_title": "Gains du jour", "earnings_week_title": "Gains de la semaine", "earnings_month_title": "Gains du mois", "trips": "Courses", "recent_rides": "Courses recentes", "no_completed_rides": "Aucune course terminee", "earnings_nav": "Gains", "manage_services": "Gerer les services", "my_info": "Mes informations (societe, licence)", "manage_workplace": "Gerer le lieu de travail", "manage_gallery": "Gerer la galerie", "my_availability": "Ma disponibilite", "statistics": "Statistiques", "user_comments": "Les commentaires des utilisateurs", "reward_program": "Programme de recompense", "my_score": "Mon score", "bank_details": "Coordonnees bancaires", "role_taxi": "Taxi", "role_taxi_desc": "Transport de personnes", "role_delivery": "Livreur", "role_delivery_desc": "Commandes marchands", "role_courier": "Coursier", "role_courier_desc": "Colis & express", "score_short": "Score", "total_trips_label": "Total courses", "refused": "Refus", "points": "Points"},
    "merchant": {"dashboard": "Tableau de bord", "orders": "Commandes", "products": "Produits", "today_orders": "Commandes du jour", "today_revenue": "CA du jour", "pending": "En attente", "preparing": "En preparation", "ready": "Pret", "delivered": "Livre"},
    "wallet": {"title": "Portefeuille", "balance": "Solde", "topup": "Recharger", "history": "Historique", "amount": "Montant"},
    "profile": {"title": "Profil", "settings": "Parametres", "language": "Langue", "help": "Aide", "about": "A propos", "rate_app": "Noter l'application"},
    "voice": {"title": "Assistant vocal", "listening": "Ecoute en cours...", "tap_to_speak": "Appuyez pour parler", "say_something": "Dites \"reserver un taxi pour ...\""},
    "login": {"phone_title": "Entrez votre numéro de mobile", "mobile": "Mobile", "other_options": "Ou choisir une autre option de connexion", "terms_agree": "En continuant, j'accepte les", "terms_link": "Conditions Générales", "create_password": "Créer un mot de passe", "enter_password": "Entrez votre mot de passe", "create_password_hint": "Choisissez un mot de passe sécurisé pour votre compte", "login_with_number": "Connectez-vous avec le numéro {{number}}", "confirm_password": "Confirmer le mot de passe", "complete_profile": "Complétez votre profil", "complete_profile_hint": "Quelques informations pour personnaliser votre expérience", "lastname": "Nom", "firstname": "Prénom", "optional": "(facultatif)", "referral_code": "Code de parrainage", "create_account": "Créer mon compte", "choose_account": "Choisir un compte", "email_password": "Email & mot de passe"},
    "menu": {"wallet_balance": "Balance de portefeuille", "general_settings": "Réglages généraux", "buy_sell_rent": "Acheter, vendre et louer", "account_settings": "Paramètre du compte", "payment": "Paiement", "gift_card": "Carte cadeau", "favorite_places": "Lieux favoris", "support": "Soutien", "other": "Autre", "about_you": "À propos de vous", "carpool_only": "Requis uniquement pour le covoiturage", "my_bookings": "Mes réservations", "the_bookings": "Les réservations", "company_profile": "Profil de l'entreprise", "my_cart": "Mon panier", "notifications": "Les notifications", "news": "Actualités", "favorite_drivers": "Chauffeurs favoris", "invite_friends": "Inviter des amis", "invite": "Inviter", "emergency_contacts": "Contacts d'urgence", "make_donation": "Faire un don", "items_list": "Votre liste générale d'articles", "properties_list": "Votre liste de propriétés", "cars_list": "Votre liste de voitures", "enable_faceid": "Activer Face ID/Touch ID", "manage_account": "Gérer son compte", "manage_documents": "Gérer les documents", "change_password": "Changer le mot de passe", "change_currency": "Changer de devise", "change_language": "Changer de langue", "payment_method": "Mode de paiement", "my_wallet": "Mon portefeuille", "add_money": "Ajouter de l'argent", "send_money": "Envoyer de l'argent", "send_gift": "Envoyer une carte-cadeau", "redeem_gift": "Échanger une carte-cadeau", "add_home": "Ajouter une maison", "add_work": "Ajouter du travail", "about_us": "À propos de nous", "privacy": "Politique de confidentialité", "terms": "Termes et conditions", "faq": "FAQ", "live_chat": "Parler en direct", "contact_us": "Contactez-nous", "logout": "Se déconnecter", "topup": "Recharger"},
    "ride": {"plan_title": "Planifier votre course", "cancel": "Annuler", "now": "Maintenant", "for_me": "Pour moi", "for_name": "Pour {{name}}", "pickup_placeholder": "Adresse de départ", "dropoff_placeholder": "Où allez-vous ?", "stop": "Arrêt {{n}}", "fav_places": "Lieux Favoris", "home": "Domicile", "work": "Travail", "promo_first_ride": "-20% sur votre première course", "promo_code_valid": "Code: SB20 - Valable 7 jours", "current_location": "Localisation actuelle", "choose_on_map": "Choisir sur la carte", "destination_later": "Entrer la destination plus tard", "recent_places": "Lieux Récents", "for_whom": "Pour qui est cette course ?", "book_for_other": "Réserver pour quelqu'un d'autre", "passenger_name": "Nom du passager", "passenger_phone": "Téléphone (+33...)", "location_taxi": "Location Taxi", "touch_map_for": "Touchez la carte pour {{target}}", "target_pickup": "le départ", "target_dropoff": "la destination", "select_point": "Sélectionnez un point sur la carte", "choose_range": "Choisir une gamme ou faites glisser vers le haut", "min_s": "min(s)", "eta_for": "Pour", "share_ride": "Partager la course (Taxi Pool)", "pool_hint": "Jusqu'à -30% si un autre passager part dans la même direction", "airport_surcharge": "Supplément aéroport", "propose_price": "Proposer un prix différent", "taxi_auction": "(Enchères Taxi)", "cash_payment": "Paiement en espèces", "card_payment": "Carte bancaire", "wallet_payment": "Portefeuille SB", "auto_promo": "Promo auto", "applied": "appliquée", "voucher_placeholder": "Code voucher", "apply": "Appliquer", "remove": "Retirer", "booking_in_progress": "Réservation en cours...", "schedule_ride": "Programmer la course", "request_now": "Demander maintenant", "negotiation_title": "Négociation en cours", "your_offer": "Votre offre", "sent_to_drivers": "Envoyée aux chauffeurs à proximité", "offers_received": "Propositions reçues", "proposals_count": "{{count}} proposition(s)", "waiting_drivers": "En attente des chauffeurs...", "waiting_drivers_hint": "Les chauffeurs vont accepter ou contre-proposer dans quelques secondes", "vs_your_offer": "vs votre offre", "accept_offer": "Accepter cette offre", "searching_driver": "Recherche d'un chauffeur", "searching_hint": "Cela peut prendre un moment...", "otp_code": "Code OTP", "cancel_ride": "Annuler la course"},
}

BASE_BUNDLE_EN = {
    "app_name": "SB Drive VTC",
    "common": {"loading": "Loading...", "error": "An error occurred", "retry": "Retry", "save": "Save", "cancel": "Cancel", "confirm": "Confirm", "continue": "Continue", "back": "Back", "close": "Close", "next": "Next", "skip": "Skip", "search": "Search", "yes": "Yes", "no": "No", "ok": "OK"},
    "auth": {"welcome": "Welcome", "subtitle": "Your all-in-one mobility super app", "login": "Sign in", "register": "Sign up", "logout": "Sign out", "email": "Email", "phone": "Phone", "password": "Password", "name": "Full name", "forgot_password": "Forgot password?", "no_account": "No account?", "have_account": "Have an account?", "continue_with_google": "Continue with Google", "continue_with_email": "Continue with email", "continue_with_phone": "Continue with phone", "phone_login_title": "Enter your phone", "phone_login_hint": "We'll send you a verification code", "otp_title": "Verification code", "otp_hint": "Enter the code sent to {{phone}}", "send_otp": "Send code", "verify_otp": "Verify", "select_role": "I am a...", "role_user": "Rider", "role_driver": "Driver", "role_merchant": "Merchant"},
    "tabs": {"home": "Home", "services": "Services", "orders": "My rides", "wallet": "Wallet", "profile": "Profile", "rides": "Rides", "earnings": "Earnings", "jobs": "Jobs", "dashboard": "Dashboard"},
    "user_home": {"hello": "Hi {{name}}", "where_to": "Where to?", "categories": "Categories", "promos": "Promotions", "recent": "Recent", "taxi": "Taxi", "moto": "Bike", "carpool": "Carpool", "food": "Food", "delivery": "Delivery", "runner": "Runner", "beauty": "Beauty", "pet": "Pet", "car_care": "Car care", "towing": "Towing", "marketplace": "Marketplace", "nearby": "Nearby", "on_demand": "Services"},
    "booking": {"title": "Book a taxi", "pickup": "Pickup", "dropoff": "Destination", "vehicle_type": "Vehicle type", "estimate": "Estimate", "book_now": "Book now", "confirm_pickup": "Confirm pickup", "confirm_dropoff": "Confirm dropoff", "fare_estimate": "Estimated fare", "distance": "Distance", "duration": "Duration", "no_drivers": "No drivers available", "searching_driver": "Searching for a driver..."},
    "driver": {"online": "Online", "offline": "Offline", "go_online": "Go online", "go_offline": "Go offline", "new_ride": "New ride", "accept": "Accept", "decline": "Decline", "navigate": "Navigate", "start_ride": "Start ride", "complete_ride": "Complete ride", "earnings_today": "Today's earnings", "earnings_week": "This week", "rides_today": "Today's rides", "rating": "Rating", "acceptance": "Acceptance", "cancellation": "Cancellation", "activity_score": "Activity score", "my_activity": "My activity", "priority": "Priority", "palette_beginner": "Beginner", "palette_standard": "Standard", "palette_confirmed": "Confirmed", "palette_expert": "Expert", "trips_today": "Today's trips/jobs", "avg_rating": "Avg. rating", "jobs_upcoming": "Upcoming jobs", "jobs_pending": "Pending jobs", "ride_in_progress": "Ride in progress", "ride_active": "Active ride", "resume": "Resume", "pool_request": "Pool request ({{seats}} pax)", "demande": "Request", "bidding_request": "Bid", "passenger_offer": "Fare offered by the passenger", "est_price": "Estimated price", "pickup_estimate": "Pickup estimate", "trip_estimate": "Trip estimate", "minutes": "minute(s)", "no_distance": "— away", "pickup_location": "Pickup location", "destination_address": "Destination address", "passenger": "Passenger", "your_offer_sent": "Your offer sent", "offer_expired": "Offer expired — resend it", "offer_expires_in": "Expires in {{s}}s · waiting for client", "renew_offer": "Renew my offer", "propose_other_price": "Propose another price", "send": "Send", "header_in_progress": "RIDE IN PROGRESS", "header_enroute": "EN ROUTE", "header_pickup": "Pick up the passenger", "destination": "Destination", "live": "Live", "reconnecting": "Reconnecting…", "waiting": "Waiting", "billed": "billed", "record_video": "Record a video inside the taxi", "slide_arrive": "SLIDE TO ARRIVE", "slide_start": "SLIDE TO START THE TRIP", "slide_finish": "SLIDE TO FINISH THE TRIP", "finish_trip_q": "Finish the ride?", "finish_far_warn": "You are still {{dist}} from the destination. Are you sure you want to finish the trip now?", "yes_finish": "Yes, finish", "minutes_full": "minutes", "passenger_details": "View passenger details", "waybill": "Waybill", "cancel_trip": "Cancel the trip", "choose_call_type": "Choose the call type", "video_call": "Video call", "voice_call": "Voice call", "safety_tools": "Safety tools", "call_112": "Call 112", "send_sos": "Send an SOS message", "audio_recording": "Audio recording", "share_trip_status": "Share trip status", "otp_phone_title": "Phone verification", "otp_phone_hint": "The passenger can't give the code (phone off?). Enter the last 4 digits of their registered phone number.", "otp_hint": "Ask the passenger for their 4-digit OTP code to start the ride.", "verify_start": "Verify & start", "start": "Start", "my_earnings": "My earnings", "weekly_reports": "Weekly reports", "total_earnings": "Total earnings", "rides_word": "rides", "today": "Today", "week": "Week", "month": "Month", "earnings_day_title": "Today's earnings", "earnings_week_title": "This week's earnings", "earnings_month_title": "This month's earnings", "trips": "Rides", "recent_rides": "Recent rides", "no_completed_rides": "No completed rides", "earnings_nav": "Earnings", "manage_services": "Manage services", "my_info": "My info (company, license)", "manage_workplace": "Manage workplace", "manage_gallery": "Manage gallery", "my_availability": "My availability", "statistics": "Statistics", "user_comments": "User comments", "reward_program": "Reward program", "my_score": "My score", "bank_details": "Bank details", "role_taxi": "Taxi", "role_taxi_desc": "Passenger transport", "role_delivery": "Delivery", "role_delivery_desc": "Merchant orders", "role_courier": "Courier", "role_courier_desc": "Parcels & express", "score_short": "Score", "total_trips_label": "Total rides", "refused": "Declined", "points": "Points"},
    "merchant": {"dashboard": "Dashboard", "orders": "Orders", "products": "Products", "today_orders": "Today's orders", "today_revenue": "Today's revenue", "pending": "Pending", "preparing": "Preparing", "ready": "Ready", "delivered": "Delivered"},
    "wallet": {"title": "Wallet", "balance": "Balance", "topup": "Top up", "history": "History", "amount": "Amount"},
    "profile": {"title": "Profile", "settings": "Settings", "language": "Language", "help": "Help", "about": "About", "rate_app": "Rate the app"},
    "voice": {"title": "Voice assistant", "listening": "Listening...", "tap_to_speak": "Tap to speak", "say_something": "Say \"book a taxi to ...\""},
    "login": {"phone_title": "Enter your mobile number", "mobile": "Mobile", "other_options": "Or choose another sign-in option", "terms_agree": "By continuing, I accept the", "terms_link": "Terms & Conditions", "create_password": "Create a password", "enter_password": "Enter your password", "create_password_hint": "Choose a secure password for your account", "login_with_number": "Sign in with number {{number}}", "confirm_password": "Confirm password", "complete_profile": "Complete your profile", "complete_profile_hint": "A few details to personalize your experience", "lastname": "Last name", "firstname": "First name", "optional": "(optional)", "referral_code": "Referral code", "create_account": "Create my account", "choose_account": "Choose an account", "email_password": "Email & password"},
    "menu": {"wallet_balance": "Wallet balance", "general_settings": "General settings", "buy_sell_rent": "Buy, sell & rent", "account_settings": "Account settings", "payment": "Payment", "gift_card": "Gift card", "favorite_places": "Favorite places", "support": "Support", "other": "Other", "about_you": "About you", "carpool_only": "Required only for carpooling", "my_bookings": "My bookings", "the_bookings": "Bookings", "company_profile": "Company profile", "my_cart": "My cart", "notifications": "Notifications", "news": "News", "favorite_drivers": "Favorite drivers", "invite_friends": "Invite friends", "invite": "Invite", "emergency_contacts": "Emergency contacts", "make_donation": "Make a donation", "items_list": "Your general items list", "properties_list": "Your properties list", "cars_list": "Your cars list", "enable_faceid": "Enable Face ID/Touch ID", "manage_account": "Manage account", "manage_documents": "Manage documents", "change_password": "Change password", "change_currency": "Change currency", "change_language": "Change language", "payment_method": "Payment method", "my_wallet": "My wallet", "add_money": "Add money", "send_money": "Send money", "send_gift": "Send a gift card", "redeem_gift": "Redeem a gift card", "add_home": "Add home", "add_work": "Add work", "about_us": "About us", "privacy": "Privacy policy", "terms": "Terms & conditions", "faq": "FAQ", "live_chat": "Live chat", "contact_us": "Contact us", "logout": "Sign out", "topup": "Top up"},
    "ride": {"plan_title": "Plan your ride", "cancel": "Cancel", "now": "Now", "for_me": "For me", "for_name": "For {{name}}", "pickup_placeholder": "Pickup address", "dropoff_placeholder": "Where to?", "stop": "Stop {{n}}", "fav_places": "Favorite places", "home": "Home", "work": "Work", "promo_first_ride": "-20% on your first ride", "promo_code_valid": "Code: SB20 - Valid 7 days", "current_location": "Current location", "choose_on_map": "Choose on map", "destination_later": "Enter destination later", "recent_places": "Recent places", "for_whom": "Who is this ride for?", "book_for_other": "Book for someone else", "passenger_name": "Passenger name", "passenger_phone": "Phone (+33...)", "location_taxi": "Rent a taxi", "touch_map_for": "Tap the map for {{target}}", "target_pickup": "pickup", "target_dropoff": "destination", "select_point": "Select a point on the map", "choose_range": "Choose a category or swipe up", "min_s": "min(s)", "eta_for": "To", "share_ride": "Share the ride (Taxi Pool)", "pool_hint": "Up to -30% if another passenger goes the same way", "airport_surcharge": "Airport surcharge", "propose_price": "Propose a different price", "taxi_auction": "(Taxi Bidding)", "cash_payment": "Cash payment", "card_payment": "Bank card", "wallet_payment": "SB Wallet", "auto_promo": "Auto promo", "applied": "applied", "voucher_placeholder": "Voucher code", "apply": "Apply", "remove": "Remove", "booking_in_progress": "Booking in progress...", "schedule_ride": "Schedule ride", "request_now": "Request now", "negotiation_title": "Negotiation in progress", "your_offer": "Your offer", "sent_to_drivers": "Sent to nearby drivers", "offers_received": "Offers received", "proposals_count": "{{count}} offer(s)", "waiting_drivers": "Waiting for drivers...", "waiting_drivers_hint": "Drivers will accept or counter-offer within seconds", "vs_your_offer": "vs your offer", "accept_offer": "Accept this offer", "searching_driver": "Searching for a driver", "searching_hint": "This may take a moment...", "otp_code": "OTP code", "cancel_ride": "Cancel ride"},
}


# ------------------------------------------------------------------
# Helpers flatten / unflatten
# ------------------------------------------------------------------
def _flatten(d: dict, prefix: str = "") -> dict:
    out = {}
    for k, v in d.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            out.update(_flatten(v, key + "."))
        else:
            out[key] = v
    return out


def _unflatten(flat: dict) -> dict:
    root: dict = {}
    for k, v in flat.items():
        parts = k.split(".")
        node = root
        for p in parts[:-1]:
            node = node.setdefault(p, {})
        node[parts[-1]] = v
    return root


BASE_FLAT_FR = _flatten(BASE_BUNDLE_FR)
BASE_TOTAL = len(BASE_FLAT_FR)


# ------------------------------------------------------------------
# Seed (idempotent) : langues + bundles fr/en
# ------------------------------------------------------------------
async def seed_i18n():
    for lang in LANGUAGE_CATALOG:
        await db.i18n_languages.update_one(
            {"code": lang["code"]},
            {
                # champs d'affichage : toujours à jour
                "$set": {"name": lang["name"], "flag": lang["flag"], "is_rtl": lang["is_rtl"]},
                # état mutable : seulement à la création (ne pas écraser les choix admin)
                "$setOnInsert": {
                    "is_active": lang["code"] in DEFAULT_ACTIVE,
                    "is_default": lang["code"] == DEFAULT_LANG,
                },
            },
            upsert=True,
        )
    # Bundles fr/en (source de vérité) — réécrits à chaque boot
    for code, bundle in (("fr", BASE_BUNDLE_FR), ("en", BASE_BUNDLE_EN)):
        await db.i18n_app_bundles.update_one(
            {"lang": code},
            {"$set": {"lang": code, "bundle": bundle, "coverage": BASE_TOTAL,
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )


async def _get_bundle(lang: str) -> dict:
    if lang == "fr":
        return BASE_BUNDLE_FR
    if lang == "en":
        return BASE_BUNDLE_EN
    doc = await db.i18n_app_bundles.find_one({"lang": lang}, {"_id": 0, "bundle": 1})
    return (doc or {}).get("bundle") or {}


# ------------------------------------------------------------------
# Public (consommé par les apps)
# ------------------------------------------------------------------
@router.get("/languages")
async def list_languages():
    items = await db.i18n_languages.find({"is_active": True}, {"_id": 0}).to_list(100)
    # N'exposer que les langues prêtes : FR/EN (base) ou ayant un bundle traduit (coverage > 0).
    ready_codes = {"fr", "en"}
    async for b in db.i18n_app_bundles.find({"coverage": {"$gt": 0}}, {"_id": 0, "lang": 1}):
        ready_codes.add(b["lang"])
    items = [i for i in items if i["code"] in ready_codes]
    items.sort(key=lambda x: (not x.get("is_default"), x.get("name", "")))
    return {"items": items, "default": DEFAULT_LANG}


@router.get("/bundle/{lang}")
async def get_bundle(lang: str):
    bundle = await _get_bundle(lang)
    meta = await db.i18n_languages.find_one({"code": lang}, {"_id": 0, "is_rtl": 1})
    return {"lang": lang, "bundle": bundle, "is_rtl": bool((meta or {}).get("is_rtl"))}


# ------------------------------------------------------------------
# Admin
# ------------------------------------------------------------------
@router.get("/admin/overview")
async def admin_overview(current_user: dict = Depends(require_permission("server.settings.edit"))):
    langs = await db.i18n_languages.find({}, {"_id": 0}).to_list(200)
    bundles = {d["lang"]: d for d in await db.i18n_app_bundles.find({}, {"_id": 0, "lang": 1, "coverage": 1}).to_list(500)}
    out = []
    for lng in langs:
        code = lng["code"]
        if code in ("fr", "en"):
            coverage = BASE_TOTAL
        else:
            coverage = (bundles.get(code) or {}).get("coverage", 0)
        out.append({**lng, "coverage": coverage, "total": BASE_TOTAL})
    out.sort(key=lambda x: (not x.get("is_default"), x.get("name", "")))
    return {"items": out, "total": BASE_TOTAL}


class ActivateBody(BaseModel):
    is_active: bool


@router.post("/admin/languages/{code}/activate")
async def toggle_language(code: str, body: ActivateBody, current_user: dict = Depends(require_permission("server.settings.edit"))):
    res = await db.i18n_languages.update_one({"code": code}, {"$set": {"is_active": body.is_active}})
    if res.matched_count == 0:
        raise HTTPException(404, "Langue inconnue")
    return {"code": code, "is_active": body.is_active}


class AutoTranslateBody(BaseModel):
    target_lang: str
    overwrite: bool = False  # si False, ne traduit que les clés manquantes


async def _llm_translate(items: dict, target_name: str, target_code: str) -> dict:
    """Traduit {key: value} -> {key: traduction} via Claude (placeholders préservés)."""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(503, "Service de traduction indisponible (clé manquante)")
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    payload = _json.dumps(items, ensure_ascii=False)
    prompt = (
        f"Translate the VALUES of this JSON object from French into {target_name} "
        f"(ISO code: {target_code}), for a ride-hailing / delivery mobile app. "
        "Rules:\n"
        "- Keep each KEY EXACTLY as-is.\n"
        "- Preserve ALL placeholders verbatim, e.g. {{name}}, {{phone}}, {count} — do not translate or alter them.\n"
        "- Keep translations short and natural for UI buttons/labels.\n"
        "- Do NOT translate the brand name 'SB Drive VTC'.\n"
        "- Reply with ONLY a strict JSON object (same keys), no markdown, no commentary.\n\n"
        f"JSON:\n{payload}"
    )
    chat = LlmChat(
        api_key=api_key,
        session_id=f"i18n-{target_code}-{uuid.uuid4().hex[:8]}",
        system_message="You are a professional software localization engine. Output strict JSON only.",
    ).with_model("anthropic", "claude-sonnet-4-6")
    raw = (await chat.send_message(UserMessage(text=prompt))).strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1].replace("json", "", 1).strip()
    try:
        data = _json.loads(raw)
    except Exception as e:
        raise HTTPException(502, f"Réponse de traduction invalide: {e}")
    return {k: v for k, v in data.items() if k in items}


@router.post("/admin/auto-translate")
async def auto_translate(body: AutoTranslateBody, current_user: dict = Depends(require_permission("server.settings.edit"))):
    code = body.target_lang
    if code in ("fr", "en"):
        raise HTTPException(400, "Le bundle de base FR/EN ne se traduit pas.")
    lang = await db.i18n_languages.find_one({"code": code}, {"_id": 0})
    if not lang:
        raise HTTPException(404, "Langue inconnue")

    existing_flat = _flatten(await _get_bundle(code))
    if body.overwrite:
        todo = dict(BASE_FLAT_FR)
    else:
        todo = {k: v for k, v in BASE_FLAT_FR.items() if not existing_flat.get(k)}

    translated = dict(existing_flat)
    BATCH = 64
    keys = list(todo.keys())
    for i in range(0, len(keys), BATCH):
        chunk = {k: todo[k] for k in keys[i:i + BATCH]}
        if not chunk:
            continue
        result = await _llm_translate(chunk, lang["name"], code)
        translated.update(result)

    bundle = _unflatten(translated)
    coverage = sum(1 for k in BASE_FLAT_FR if translated.get(k))
    await db.i18n_app_bundles.update_one(
        {"lang": code},
        {"$set": {"lang": code, "bundle": bundle, "coverage": coverage,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    # active automatiquement la langue traduite
    await db.i18n_languages.update_one({"code": code}, {"$set": {"is_active": True}})
    return {"target_lang": code, "translated": len(todo), "coverage": coverage, "total": BASE_TOTAL}


class KeyOverride(BaseModel):
    lang: str
    key: str
    value: str


@router.get("/admin/bundle/{lang}")
async def admin_get_bundle_flat(lang: str, current_user: dict = Depends(require_permission("server.settings.edit"))):
    """Renvoie le bundle aplati + la base FR (pour repérer les manquants)."""
    flat = _flatten(await _get_bundle(lang))
    return {"lang": lang, "labels": flat, "base": BASE_FLAT_FR, "total": BASE_TOTAL}


@router.post("/admin/bundle-key")
async def set_bundle_key(body: KeyOverride, current_user: dict = Depends(require_permission("server.settings.edit"))):
    if body.lang in ("fr", "en"):
        raise HTTPException(400, "Le bundle de base FR/EN n'est pas éditable ici.")
    flat = _flatten(await _get_bundle(body.lang))
    flat[body.key] = body.value
    bundle = _unflatten(flat)
    coverage = sum(1 for k in BASE_FLAT_FR if flat.get(k))
    await db.i18n_app_bundles.update_one(
        {"lang": body.lang},
        {"$set": {"lang": body.lang, "bundle": bundle, "coverage": coverage,
                  "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"updated": True, "coverage": coverage}
