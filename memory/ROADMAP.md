# 🗺️ Roadmap — SB Marketplace Locale (12 modules)

Stack cible : **React + FastAPI + MongoDB** (pas Flutter/Laravel — adaptation à l'existant, zéro réécriture).
LLM via **Emergent LLM Key** (OpenAI/Claude/Gemini) pour les modules IA.
Légende effort : S (≤1j) · M (2–4j) · L (≥1 semaine).

---

## 📊 Vue d'ensemble — existant vs à faire

| # | Module | État actuel | Briques existantes |
|---|--------|-------------|--------------------|
| 1 | Marketplace Locale | 🟡 Partiel | `marketplace.py`, `merchants.py`, `store_categories.py`, `MarketplacePage`, `nearby_businesses`, `pharmacy`, `real_estate` |
| 2 | Carte interactive temps réel | 🟠 À construire | `NearbyBusinessPage`, `geo.py`, `zones.py` (heatmap dispatch existe) |
| 3 | Livraison instantanée | 🟡 Partiel | `parcels.py`, `orders.py`, `auto_dispatch.py`, `DeliveryTrackingPage` |
| 4 | IA Shopping Assistant | 🟠 À construire | `voice.py`, `chat.py`, LiveChat (infra LLM en place) |
| 5 | Achats groupés intelligents | 🔴 Nouveau | — |
| 6 | SB Neighbour (C2C) | 🟡 Partiel | `marketplace_listings` (vente/location), `PostVehiclePage`, `SellGalleryPage` |
| 7 | Marketplace Services | 🟢 Quasi fait | `services.py`, `ServiceProvidersPage`, `ondemand_categories` |
| 8 | Wallet SB Pay | 🟢 Quasi fait | `wallet.py`, `payments.py`, `coupons.py`, `WalletPage` |
| 9 | Programme Fidélité SB Rewards | 🟢 Quasi fait | `loyalty.py`, `LoyaltyPage`, `referral.py` |
| 10 | IA Business commerçants | 🟠 À construire | `weekly_reports.py`, `finance.py`, stats marchands partielles |
| 11 | Réseau social commerce | 🟠 À construire | `news.py`, `NewsFeedPage` |
| 12 | Offres flash géolocalisées | 🟡 Partiel | `auto_promotions.py`, `coupons.py`, `promo_banners` (surfaces+billing déjà faits) |

---

## 🔴 P0 — Boucle commerce de base (valeur immédiate, s'appuie sur l'existant)

### P0.1 — Vitrine digitale marchand complète (Module 1) · **M**
Compléter chaque boutique : logo, bannière, galerie photos, description, **catalogue produits + stock**, horaires d'ouverture, avis clients, mini-stats.
- Backend : étendre `merchants`/`marketplace_listings` (champs storefront, gestion stock, horaires).
- Front : page boutique publique + back-office marchand (catalogue, stock, horaires, promos).
- Catégories structurées : Épiceries, Boulangeries, Pharmacies, Fleuristes, Boucheries, Poissonneries, Supermarchés, Commerces indépendants, Producteurs locaux.

### P0.2 — Livraison Marketplace ↔ réseau SB Drive (Module 3) · **M**
Connecter les commandes marketplace au dispatch coursier + suivi temps réel.
- Options : Express / Standard / Programmée / Prioritaire.
- Réutilise `auto_dispatch.py`, `parcels.py`, tracking WebSocket existant.
- (Déjà au backlog P3 initial — remonté en P0 car cœur de la Super App.)

### P0.3 — Checkout unifié SB Pay (Module 8) · **S/M**
Paiement marketplace/VTC/livraison via le wallet + cashback + application coupons à la commande.
- Réutilise `wallet.py`, `payments.py` (Stripe test mappé), `coupons.py`.
- Ajouts : cashback à la commande, historique unifié.

### P0.4 — Fidélité multi-verticale SB Rewards (Module 9) · **S**
Cumul de points sur Courses + Livraisons + Marketplace + Parrainage, catalogue de récompenses (réductions, livraison gratuite, bons).
- Réutilise `loyalty.py`, `referral.py` ; brancher les events marketplace/livraison.

---

## 🟠 P1 — Différenciation & engagement

### P1.1 — Carte interactive commerce temps réel (Module 2) · **L**
Carte façon Google Maps dédiée au commerce : commerces ouverts, promos actives, produits populaires, coursiers dispo, zones de demande. Recherche géolocalisée + filtres + commande directe depuis la carte.

### P1.2 — Offres flash géolocalisées (Module 12) · **M**
Promos dynamiques (invendus boulangerie, dernière minute) + notifications intelligentes (position, historique, préférences).
- Réutilise `auto_promotions.py`, `coupons.py`, et l'infra de bannières (surfaces/billing déjà livrée).

### P1.3 — Marketplace Services finalisée (Module 7) · **S/M**
Polish réservation/disponibilités/géoloc/notation pour Plombier, Électricien, Coiffeur, Mécanicien, Jardinier, Ménage, Informatique, Dépannage.
- Réutilise `services.py`, `ServiceProvidersPage`.

### P1.4 — SB Neighbour C2C (Module 6) · **M**
Vente/achat entre particuliers, **location de matériel**, services de proximité. Paiement sécurisé (escrow SB Pay), livraison via chauffeurs SB.
- Réutilise `marketplace_listings`, `SellGalleryPage`.

---

## 🟣 P2 — Innovation IA (LLM via Emergent Key)

### P2.1 — IA Shopping Assistant (Module 4) · **M**
Assistant conversationnel : « Trouve une pharmacie ouverte », « Commande une baguette et du lait », « Magasin le moins cher ». Comprend, recherche, compare, génère le panier.
- Réutilise infra LLM (`chat.py`, `voice.py`).

### P2.2 — Achats groupés intelligents (Module 5) · **L**
Regroupement automatique des commandes proches → frais de livraison réduits, trajets optimisés, empreinte carbone. IA identifie les commandes compatibles.

### P2.3 — IA Business pour commerçants (Module 10) · **M**
Tableau de bord intelligent : prévision des ventes, produits populaires, tendances, recommandations de promos, prévision des stocks.
- Réutilise `weekly_reports.py`, stats marchands.

### P2.4 — Réseau social commerce (Module 11) · **L**
Publications / Stories / Promos / Événements par commerce ; suivre / liker / commenter / partager (inspiration TikTok Shop & Instagram Shopping).
- Réutilise `news.py`, `NewsFeedPage`.

---

## ✅ Déjà livré (socle pub/monétisation — base du commerce connecté)
- Bannières Sponsorisé multi-surfaces (Accueil/Livraison/Marketplace) + label « Sponsorisé ».
- Suivi impressions/clics + CTR par bannière.
- Facturation publicitaire (tarif/jour ou CPM) + récap par commerçant.
- Enchères VTC bidirectionnelles + auto-acceptation client + son/animation + « vu par X ».

---

## 🧭 Ordre d'exécution recommandé
1. **P0.1 → P0.4** : compléter la boucle Marketplace → Livraison → Paiement → Fidélité (cœur Super App, ROI rapide).
2. **P1.2** (offres flash) + **P1.1** (carte) : engagement & rétention.
3. **P2.1** (IA Shopping) puis **P2.2/P2.3/P2.4** : différenciation vs Gojek/Grab/Rappi.

> Multi-pays / multi-langues / multi-devises : l'i18n (`i18n.py`) et les devises existent partiellement — à consolider transversalement au fil des phases (pas un module isolé).
