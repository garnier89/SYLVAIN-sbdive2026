## NEW - 2026-06-14 (527) - ⚙️📲 Fenêtres de planification CONFIGURABLES (admin) + Rappel SMS automatique avant RDV
- **Demande user (approuvée)** : (1) rendre les fenêtres des courses programmées configurables côté admin ; (2) rappel SMS automatique 30 min avant le RDV (client + chauffeur). Choix user : rappel unique à 30 min, configurable.
- **(1) Fenêtres configurables** — `routes/config.py` `DEFAULT_SCHEDULING` + sanitize : nouvelles clés bornées `driver_start_window_min` (40), `anti_double_booking_min` (30), `driver_conflict_min` (45), `sms_reminder_enabled` (true), `sms_reminder_min` (30). Exposées via `/api/config/scheduling` (public) et `/api/admin/service-config/scheduling` (PUT admin). `routes/rides.py` : nouvel helper async `_scheduling_windows()` (repli sur les constantes) ; branchées dans `create_ride` (anti-double), `update_ride_status` (garde « arriving » = fenêtre démarrage), `_driver_schedule_conflict` (anti-conflit chauffeur), `_is_scheduled_pending_activation(ride, activation_min)` (+ param), `/rides/active/current`.
- **(2) Rappel SMS** — `routes/rides.py` : `run_scheduled_ride_reminders()` (testable, idempotent via flag `reminder_sms_sent`) + loop `scheduled_ride_reminder_loop()` (toutes les 60 s), enregistré dans `core/startup.py`. Envoie via Twilio (`core/sms.py`) au client (`book_for_phone`/`users.phone`) et au chauffeur (si accepté) ~`sms_reminder_min` min avant le RDV. No-op propre si désactivé/Twilio off (ne pose pas le flag si Twilio off → réessai).
- **Frontend** : `pages/admin/AdminScheduling.js` — 2 nouvelles sections « Fenêtres de réservation » (3 inputs) + « Rappel SMS automatique » (toggle + délai). data-testids : `scheduling-driver-start-window-input`, `scheduling-anti-double-input`, `scheduling-driver-conflict-input`, `scheduling-sms-toggle`, `scheduling-sms-reminder-min-input`.
- **Testé** : pytest `test_iter_scheduled_reminders.py` **3/3** (clamp config, no-op désactivé, envoi client+chauffeur + idempotence + hors-fenêtre ignoré) + non-régression `test_iter414_scheduled_rides.py` + `test_iter95` **12/12** + cashback/access **15/15** + curl round-trip admin (PUT 50/20/60/45 → re-GET OK, restore) + screenshot admin (toutes sections rendues). ⚠️ Visible en prod après REDÉPLOIEMENT. ⚠️ Livraison SMS réelle nécessite Twilio actif (déjà configuré).

---

## NEW - 2026-06-14 (526) - ⏱️ Fenêtre de démarrage des réservations basée sur l'HEURE DU RDV (40 min), pas l'heure de commande
- **Question/anomalie user** : « le temps de démarrage est-il pris en fonction de l'heure de la commande ? » → RDV 15h00 doit être démarrable à 14h20 (40 min avant), pas en fonction de l'heure de réservation (midi).
- **Bug trouvé** : côté chauffeur `DriverBookingsPage.js`, le bouton « Démarrable dans X min » était calculé sur `accepted_at + start_delay_minutes (20min)` (= heure d'acceptation/commande) → pour un RDV 15h accepté à 12h05, il disait « démarrable à 12h25 ». Absurde.
- **Correctif** :
  - Constante `SCHEDULED_ACTIVATION_MIN` 45 → **40** (calculée sur `scheduled_at`) ; (527) désormais admin-configurable via `driver_start_window_min`.
  - Backend `update_ride_status` : garde « arriving » dans les 40 min précédant le RDV (HTTP 400 sinon). Admins non bloqués.
  - Frontend chauffeur : fenêtre de démarrage = `scheduled_at − 40 min`, label « Démarrable à HH:MM », bouton « Relâcher » dispo tant que non démarrée.

---

## Architecture & contexte (résumé pour fork)
- **App** : super-app multi-services FR (SB Drive VTC + verticales). FastAPI + React + MongoDB. Langue UI : **FRANÇAIS uniquement**.
- **Déploiement** : prod sur `gojek-mvp-1.emergent.host`. Le preview ≠ prod → changements visibles après REDÉPLOIEMENT.
- **Verticales transactionnelles complètes & testées** : Taxi/VTC (planification, pool, enchères, intercity, aéroport), Food, Coursier/Colis, Marketplace/Immobilier/Véhicules, Location voiture/moto (caution Stripe), Hôtels (caution SB Pay), Vols, Évènements, **Beauté** (`/beauty`), **Métiers** (`/services-metiers`), **Médical** (Phase 3a RDV `/sante`, 3b ordonnances, 3c labo `/analyses`, 3d urgences/ambulance `/urgences`), Dépannage (KYC+commission), Animaux (+carnet santé), Auto Pièces (+Mon Garage), Assistant vocal exécutable, Itinéraires touristiques partageables.
- **Moteur pro_services générique** (`routes/pro_services.py`) : verticales beauty/trades/medical/lab — KYC admin + commission 15% + espace pro + booking SB Pay/espèces.
- **Intégrations** : Twilio (SMS, actif), Emergent LLM Key (OpenAI/Gemini + Whisper STT), Resend (emails), Stripe (Checkout only), Google Maps. Stripe Auth/Capture (vraie caution) BLOQUÉ par wrapper → caution simulée via SB Pay wallet.
- **Loops de fond** (`core/startup.py`) : auto_dispatch, weekly_report, order_auto_progress, demand_automation, flight_watch, cashback_monthly, grouping, student_digest, access_recurring, sequential_dispatch, report_schedule, flight_hold, carpool_autorelease, debt_reminder, no_movement, pro_booking_reminder, pet_health_reminder, pro_expiry_reminder, **scheduled_ride_reminder (NEW 527)**.
- **PWA** : `public/sw.js` v2 + auto-reload `index.html` (anti bundle obsolète).

## Comptes de test (voir /app/memory/test_credentials.md)
- Admin : admin@superapp.com / SuperAdmin123!
- Client : famtester@demo.sb / FamTest123! · freeuser@demo.sb (multi-rôle pro/labo/ambulancier validé)
- Chauffeur : jean.dupont@demo.sb / Driver123!

## Backlog / Prochaines tâches
- **P1** : vérifier s'il reste des sous-verticales « On-Demand » à transformer en marketplaces transactionnels (Beauté/Métiers/Santé déjà complets). Admin « Onboarding partenaires » (clés API Uber/Yango/Bolt côté transport).
- **P3** : vignette Open Graph page publique `/circuit/:token` (acquisition organique SB Travel) ; surveiller complexité `routes/rides.py` (~2640 l.) si ajout de cron.
- **Bloqué** : vraie caution Stripe (Auth/Capture) — limitation SDK emergentintegrations.
