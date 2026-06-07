"""
Static demo / seed datasets extracted from server.py.

These are large literal datasets used only at application startup to populate
an empty database with realistic demo content. Keeping them here keeps
server.py thin. Timestamps in literals are evaluated at import time (startup),
which is functionally equivalent to the previous inline evaluation.
"""
from datetime import datetime, timezone, timedelta


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def test_credentials_md(admin_email: str, admin_password: str) -> str:
    """Markdown written to /app/memory/test_credentials.md at startup."""
    return f"""# Test Credentials

## Super Admin Account
- Email: {admin_email}
- Password: {admin_password}
- Role: admin

## Driver Test Account (phone login)
- Phone: +33644112233
- Password: Chauffeur2026!

## Demo Drivers (Driver123!)
- jean.dupont@demo.sb / amadou.diallo@demo.sb / sophie.martin@demo.sb

## Merchant Demo
- Email: merchant@example.com / Password: Merchant123!

## SB Drive Tab — Borne TAB CLIC
- PIN unlock: 1234 (URL: /kiosk)

## Phase B — Comptes Demo Web Panels (password: PanelDemo123!)
- dispatch@superapp.com -> /dispatch (Dispatcher)
- billing@superapp.com -> /billing (Comptabilite)
- sysadmin@superapp.com -> /server (Sys Admin)
- crm-users@superapp.com -> /users-admin (CRM Clients)
- crm-drivers@superapp.com -> /drivers-admin (CRM Chauffeurs)
- crm-merchants@superapp.com -> /merchants-admin (CRM Marchands)

## Auth Endpoints
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- POST /api/auth/refresh
"""


DEMO_MERCHANTS = [
    {"id": "merchant_burger_palace", "user_id": "system_burger", "store_name": "Burger Palace", "store_type": "restaurant", "address": "123 Main Street, Paris", "lat": 48.8566, "lng": 2.3522, "description": "Burgers gourmets premium et accompagnements", "rating": 4.8, "total_orders": 1250, "is_active": True, "opening_hours": "09:00-22:00", "image_url": "https://images.unsplash.com/photo-1632898657999-ae6920976661?w=400", "created_at": _now_iso()},
    {"id": "merchant_pizza_heaven", "user_id": "system_pizza", "store_name": "Pizza Heaven", "store_type": "restaurant", "address": "456 Oak Avenue, Paris", "lat": 48.8606, "lng": 2.3376, "description": "Pizzas italiennes authentiques cuites au feu de bois", "rating": 4.5, "total_orders": 890, "is_active": True, "opening_hours": "10:00-23:00", "image_url": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400", "created_at": _now_iso()},
    {"id": "merchant_sushi_master", "user_id": "system_sushi", "store_name": "Sushi Master", "store_type": "restaurant", "address": "789 Elm Road, Paris", "lat": 48.8530, "lng": 2.3499, "description": "Sushis et sashimis japonais frais", "rating": 4.9, "total_orders": 2100, "is_active": True, "opening_hours": "11:00-22:00", "image_url": "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=400", "created_at": _now_iso()},
    {"id": "merchant_carrefour_city", "user_id": "system_carrefour", "store_name": "Carrefour City", "store_type": "grocery", "address": "12 Rue de Rivoli, Paris", "lat": 48.8559, "lng": 2.3601, "description": "Épicerie de quartier : produits frais et courses du quotidien", "rating": 4.6, "total_orders": 1840, "is_active": True, "opening_hours": "08:00-22:00", "image_url": "https://images.unsplash.com/photo-1542838132-92c53300491e?w=400", "created_at": _now_iso()},
    {"id": "merchant_franprix", "user_id": "system_franprix", "store_name": "Franprix Express", "store_type": "grocery", "address": "45 Bd Voltaire, Paris", "lat": 48.8629, "lng": 2.3776, "description": "Supérette de proximité, livraison rapide", "rating": 4.4, "total_orders": 1320, "is_active": True, "opening_hours": "07:30-23:00", "image_url": "https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400", "created_at": _now_iso()},
    {"id": "merchant_jardin_fleuri", "user_id": "system_fleuriste", "store_name": "Le Jardin Fleuri", "store_type": "florist", "address": "8 Rue des Lilas, Paris", "lat": 48.8702, "lng": 2.3458, "description": "Fleuriste artisanal, bouquets frais livrés", "rating": 4.9, "total_orders": 540, "is_active": True, "opening_hours": "09:00-20:00", "image_url": "https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=400", "created_at": _now_iso()},
    {"id": "merchant_papeterie", "user_id": "system_papeterie", "store_name": "Papeterie du Coin", "store_type": "stationery", "address": "23 Rue Saint-Antoine, Paris", "lat": 48.8541, "lng": 2.3653, "description": "Fournitures de bureau et scolaires", "rating": 4.5, "total_orders": 410, "is_active": True, "opening_hours": "09:00-19:00", "image_url": "https://images.unsplash.com/photo-1568205612837-017257d2310a?w=400", "created_at": _now_iso()},
    {"id": "merchant_cave_vins", "user_id": "system_cave", "store_name": "La Cave à Vins", "store_type": "wine", "address": "5 Rue du Cherche-Midi, Paris", "lat": 48.8512, "lng": 2.3275, "description": "Vins fins et spiritueux sélectionnés", "rating": 4.8, "total_orders": 760, "is_active": True, "opening_hours": "10:00-21:00", "image_url": "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400", "created_at": _now_iso()},
    {"id": "merchant_brico_materiaux", "user_id": "system_brico", "store_name": "Brico Matériaux", "store_type": "construction", "address": "78 Av. de la République, Paris", "lat": 48.8665, "lng": 2.3812, "description": "Matériaux de construction et outillage", "rating": 4.3, "total_orders": 295, "is_active": True, "opening_hours": "07:00-19:00", "image_url": "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=400", "created_at": _now_iso()},
]

DEMO_PRODUCTS = [
    {"id": "prod_bp_classic", "merchant_id": "merchant_burger_palace", "name": "Burger Classique", "description": "Steak de bœuf juteux, salade fraîche, tomate et sauce maison", "price": 12.99, "category": "Burgers", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_bp_cheese", "merchant_id": "merchant_burger_palace", "name": "Cheeseburger", "description": "Burger classique au cheddar fondu", "price": 14.99, "category": "Burgers", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_bp_bacon", "merchant_id": "merchant_burger_palace", "name": "Burger Bacon", "description": "Garni de bacon croustillant et sauce barbecue", "price": 16.99, "category": "Burgers", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_bp_veggie", "merchant_id": "merchant_burger_palace", "name": "Burger Végétarien", "description": "Galette végétale, avocat et pousses fraîches", "price": 13.99, "category": "Burgers", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_bp_fries", "merchant_id": "merchant_burger_palace", "name": "Frites", "description": "Frites dorées et croustillantes au sel de mer", "price": 4.99, "category": "Accompagnements", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_bp_rings", "merchant_id": "merchant_burger_palace", "name": "Oignons Frits", "description": "Rondelles d'oignon en beignet croustillant", "price": 5.99, "category": "Accompagnements", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_bp_cola", "merchant_id": "merchant_burger_palace", "name": "Coca-Cola", "description": "Boisson fraîche bien glacée", "price": 2.99, "category": "Boissons", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_bp_shake", "merchant_id": "merchant_burger_palace", "name": "Milkshake Vanille", "description": "Milkshake crémeux à la vanille", "price": 5.99, "category": "Boissons", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_ph_margherita", "merchant_id": "merchant_pizza_heaven", "name": "Pizza Margherita", "description": "Sauce tomate, mozzarella et basilic frais", "price": 14.99, "category": "Pizzas", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_ph_pepperoni", "merchant_id": "merchant_pizza_heaven", "name": "Pizza Pepperoni", "description": "Généreusement garnie de pepperoni et fromage fondu", "price": 16.99, "category": "Pizzas", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_ph_four_cheese", "merchant_id": "merchant_pizza_heaven", "name": "Pizza 4 Fromages", "description": "Mozzarella, gorgonzola, parmesan et fontina", "price": 18.99, "category": "Pizzas", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_ph_garlic_bread", "merchant_id": "merchant_pizza_heaven", "name": "Pain à l'Ail", "description": "Pain croustillant au beurre d'ail et fines herbes", "price": 5.99, "category": "Accompagnements", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_ph_tiramisu", "merchant_id": "merchant_pizza_heaven", "name": "Tiramisu", "description": "Dessert italien classique au café", "price": 7.99, "category": "Desserts", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_sm_salmon", "merchant_id": "merchant_sushi_master", "name": "Nigiri Saumon (6 pcs)", "description": "Saumon frais sur riz vinaigré", "price": 12.99, "category": "Nigiri", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_sm_tuna", "merchant_id": "merchant_sushi_master", "name": "Sashimi Thon (8 pcs)", "description": "Tranches de thon rouge premium", "price": 16.99, "category": "Sashimi", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_sm_california", "merchant_id": "merchant_sushi_master", "name": "California Roll (8 pcs)", "description": "Crabe, avocat et concombre", "price": 10.99, "category": "Makis", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_sm_dragon", "merchant_id": "merchant_sushi_master", "name": "Dragon Roll (8 pcs)", "description": "Crevette tempura, avocat et sauce anguille", "price": 14.99, "category": "Makis", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_sm_miso", "merchant_id": "merchant_sushi_master", "name": "Soupe Miso", "description": "Miso traditionnel, tofu et algues", "price": 3.99, "category": "Accompagnements", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_sm_edamame", "merchant_id": "merchant_sushi_master", "name": "Edamame", "description": "Fèves de soja vapeur au sel de mer", "price": 4.99, "category": "Accompagnements", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_cc_lait", "merchant_id": "merchant_carrefour_city", "name": "Lait demi-écrémé 1L", "description": "Bouteille de lait demi-écrémé UHT", "price": 1.15, "category": "Crèmerie", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_cc_pain", "merchant_id": "merchant_carrefour_city", "name": "Pain de campagne", "description": "Pain de campagne tradition 400g", "price": 1.80, "category": "Boulangerie", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_cc_bananes", "merchant_id": "merchant_carrefour_city", "name": "Bananes (1 kg)", "description": "Bananes fraîches au kilo", "price": 1.99, "category": "Fruits & Légumes", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_cc_oeufs", "merchant_id": "merchant_carrefour_city", "name": "Œufs frais x6", "description": "Boîte de 6 œufs frais de poules élevées au sol", "price": 2.45, "category": "Crèmerie", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_fp_eau", "merchant_id": "merchant_franprix", "name": "Eau minérale 6x1,5L", "description": "Pack de 6 bouteilles d'eau minérale", "price": 3.20, "category": "Boissons", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_fp_pates", "merchant_id": "merchant_franprix", "name": "Pâtes Penne 500g", "description": "Pâtes penne de qualité supérieure", "price": 1.10, "category": "Épicerie", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_fp_tomates", "merchant_id": "merchant_franprix", "name": "Tomates (1 kg)", "description": "Tomates rondes fraîches", "price": 2.50, "category": "Fruits & Légumes", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_fp_yaourt", "merchant_id": "merchant_franprix", "name": "Yaourt nature x8", "description": "Pack de 8 yaourts nature", "price": 2.30, "category": "Crèmerie", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_jf_roses", "merchant_id": "merchant_jardin_fleuri", "name": "Bouquet de roses rouges", "description": "Bouquet de 12 roses rouges fraîches", "price": 24.90, "category": "Bouquets", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_jf_champetre", "merchant_id": "merchant_jardin_fleuri", "name": "Bouquet champêtre", "description": "Composition champêtre de fleurs de saison", "price": 19.90, "category": "Bouquets", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_jf_orchidee", "merchant_id": "merchant_jardin_fleuri", "name": "Orchidée en pot", "description": "Orchidée Phalaenopsis en pot décoratif", "price": 22.00, "category": "Plantes", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_jf_tulipes", "merchant_id": "merchant_jardin_fleuri", "name": "Tulipes (x10)", "description": "Botte de 10 tulipes colorées", "price": 14.50, "category": "Bouquets", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_pa_cahier", "merchant_id": "merchant_papeterie", "name": "Cahier A4 96 pages", "description": "Cahier grands carreaux 96 pages", "price": 2.50, "category": "Cahiers", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_pa_stylos", "merchant_id": "merchant_papeterie", "name": "Stylos bille (x4)", "description": "Lot de 4 stylos bille couleurs assorties", "price": 3.20, "category": "Écriture", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_pa_ramette", "merchant_id": "merchant_papeterie", "name": "Ramette papier A4 500f", "description": "Ramette de 500 feuilles A4 80g", "price": 5.90, "category": "Papier", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_pa_surligneurs", "merchant_id": "merchant_papeterie", "name": "Surligneurs (x5)", "description": "Lot de 5 surligneurs fluo", "price": 4.10, "category": "Écriture", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_cv_bordeaux", "merchant_id": "merchant_cave_vins", "name": "Bordeaux Rouge AOC", "description": "Vin rouge de Bordeaux AOC 75cl", "price": 12.50, "category": "Vins Rouges", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_cv_chablis", "merchant_id": "merchant_cave_vins", "name": "Chablis Blanc", "description": "Vin blanc sec Chablis 75cl", "price": 16.90, "category": "Vins Blancs", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_cv_champagne", "merchant_id": "merchant_cave_vins", "name": "Champagne Brut", "description": "Champagne brut premier cru 75cl", "price": 29.90, "category": "Champagnes", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_cv_rose", "merchant_id": "merchant_cave_vins", "name": "Rosé de Provence", "description": "Vin rosé de Provence 75cl", "price": 9.90, "category": "Vins Rosés", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_bm_ciment", "merchant_id": "merchant_brico_materiaux", "name": "Sac de ciment 25 kg", "description": "Sac de ciment gris multi-usage 25kg", "price": 8.90, "category": "Gros œuvre", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_bm_peinture", "merchant_id": "merchant_brico_materiaux", "name": "Peinture blanche 2,5L", "description": "Peinture murale mate blanche 2,5L", "price": 19.90, "category": "Peinture", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_bm_vis", "merchant_id": "merchant_brico_materiaux", "name": "Lot de vis (200 pièces)", "description": "Assortiment de 200 vis à bois", "price": 6.50, "category": "Quincaillerie", "is_available": True, "image_url": None, "created_at": _now_iso()},
    {"id": "prod_bm_ruban", "merchant_id": "merchant_brico_materiaux", "name": "Ruban adhésif pro", "description": "Ruban adhésif toilé renforcé 50m", "price": 3.20, "category": "Quincaillerie", "is_available": True, "image_url": None, "created_at": _now_iso()},
]

# Phase B — 6 panel-specific admin demo accounts (role=admin + panel_preference)
PANEL_DEMOS = [
    {"email": "dispatch@superapp.com",  "name": "Demo Dispatcher", "panel_preference": "/dispatch"},
    {"email": "billing@superapp.com",   "name": "Demo Comptable",  "panel_preference": "/billing"},
    {"email": "sysadmin@superapp.com",  "name": "Demo Sys Admin",  "panel_preference": "/server"},
    {"email": "crm-users@superapp.com", "name": "Demo CRM Clients", "panel_preference": "/users-admin"},
    {"email": "crm-drivers@superapp.com", "name": "Demo CRM Chauffeurs", "panel_preference": "/drivers-admin"},
    {"email": "crm-merchants@superapp.com", "name": "Demo CRM Marchands", "panel_preference": "/merchants-admin"},
]

DEMO_COUPONS = [
    {"id": "coupon_bienvenue", "code": "BIENVENUE", "description": "Code de bienvenue -20%", "discount_type": "Percentage", "discount_value": 20, "max_discount": 10, "usage_limit": 0, "per_user_limit": 1, "used": 0, "service_type": "All", "status": "active", "expiry_date": "2027-12-31T23:59:59", "created_at": _now_iso()},
    {"id": "coupon_sbdrive10", "code": "SBDRIVE10", "description": "Reduction 10 EUR sur votre course", "discount_type": "Flat", "discount_value": 10, "max_discount": 10, "usage_limit": 100, "per_user_limit": 1, "used": 0, "service_type": "Ride", "status": "active", "expiry_date": "2027-12-31T23:59:59", "created_at": _now_iso()},
    {"id": "coupon_novembre", "code": "NOVEMBRE", "description": "Promo Novembre -15%", "discount_type": "Percentage", "discount_value": 15, "max_discount": 15, "usage_limit": 200, "per_user_limit": 2, "used": 0, "service_type": "All", "status": "active", "expiry_date": "2027-11-30T23:59:59", "created_at": _now_iso()},
    {"id": "coupon_1010", "code": "1010", "description": "Code promo 10 EUR", "discount_type": "Flat", "discount_value": 10, "max_discount": 10, "usage_limit": 50, "per_user_limit": 1, "used": 0, "service_type": "Ride", "status": "active", "expiry_date": "2027-12-31T23:59:59", "created_at": _now_iso()},
]

# Demo admin data (only seeded if the target collection is empty)
DEMO_ADMIN_SEED = {
    "admin_banners": [
        {"id": "ban_welcome", "title": "-20% sur votre première course", "subtitle": "Code SB20 — valable jusqu'au 31/12", "image_url": "", "position": "home_top", "active": True},
        {"id": "ban_free_delivery", "title": "Livraison gratuite", "subtitle": "Ce week-end seulement sur SB Eats", "image_url": "", "position": "food_top", "active": True},
        {"id": "ban_referral", "title": "Parrainez vos amis", "subtitle": "Gagnez 5€ par parrainage", "image_url": "", "position": "home_bottom", "active": True},
    ],
    "admin_payouts": [
        {"id": "pay_001", "driver_name": "Jean Dupont", "amount": 347.50, "rides": 28, "status": "paid", "period": "Sem 15 - Avril 2026", "paid_at": "2026-04-14"},
        {"id": "pay_002", "driver_name": "Amadou Diallo", "amount": 523.00, "rides": 41, "status": "paid", "period": "Sem 15 - Avril 2026", "paid_at": "2026-04-14"},
        {"id": "pay_003", "driver_name": "Sophie Martin", "amount": 189.75, "rides": 15, "status": "pending", "period": "Sem 16 - Avril 2026", "paid_at": None},
        {"id": "pay_004", "driver_name": "Mohamed Ben Ali", "amount": 412.25, "rides": 33, "status": "pending", "period": "Sem 16 - Avril 2026", "paid_at": None},
    ],
    "admin_settlements": [
        {"id": "stl_001", "driver_name": "Jean Dupont", "period": "Sem 15", "rides": 28, "gross": 523.00, "commission": 78.45, "net": 444.55, "status": "settled", "settled_at": "2026-04-14"},
        {"id": "stl_002", "driver_name": "Amadou Diallo", "period": "Sem 15", "rides": 41, "gross": 812.50, "commission": 121.88, "net": 690.63, "status": "settled", "settled_at": "2026-04-14"},
        {"id": "stl_003", "driver_name": "Sophie Martin", "period": "Sem 16", "rides": 15, "gross": 278.00, "commission": 41.70, "net": 236.30, "status": "pending", "settled_at": None},
    ],
    "admin_disputes": [
        {"id": "dis_001", "ride_id": "ride_4521", "user_name": "Marie L.", "driver_name": "Jean D.", "reason": "Tarif incorrect - montant supérieur à l'estimation", "status": "open", "amount": 8.50},
        {"id": "dis_002", "ride_id": "ride_4498", "user_name": "Paul M.", "driver_name": "Amadou D.", "reason": "Chauffeur a fait un détour inutile", "status": "investigating", "amount": 12.00},
        {"id": "dis_003", "ride_id": "ride_4475", "user_name": "Sophie K.", "driver_name": "Claire P.", "reason": "Course annulée mais facturée", "status": "resolved", "amount": 15.00},
    ],
    "admin_wallet_requests": [
        {"id": "wr_001", "user_name": "Jean Dupont", "type": "withdrawal", "amount": 150.00, "status": "pending", "method": "Virement bancaire"},
        {"id": "wr_002", "user_name": "Amadou Diallo", "type": "withdrawal", "amount": 347.50, "status": "pending", "method": "Virement bancaire"},
        {"id": "wr_003", "user_name": "Sophie Martin", "type": "withdrawal", "amount": 89.00, "status": "approved", "method": "PayPal"},
    ],
    "admin_contact_requests": [
        {"id": "con_001", "name": "Julie Moreau", "email": "julie@example.com", "phone": "+33612345678", "subject": "Question sur la facturation", "message": "Bonjour, j'ai une question concernant ma dernière facture...", "status": "new"},
        {"id": "con_002", "name": "Thomas Bernard", "email": "thomas@example.com", "phone": "+33687654321", "subject": "Problème de connexion", "message": "Je n'arrive pas à me connecter à mon compte.", "status": "answered"},
    ],
    "admin_sos_requests": [
        {"id": "sos_demo_001", "user_name": "Demo User", "user_role": "user", "ride_id": "ride_demo", "address": "Paris, France", "lat": 48.8566, "lng": 2.3522, "message": "Test alerte SOS", "status": "resolved"},
    ],
    "admin_documents": [
        {"id": "doc_001", "driver_name": "Jean Dupont", "driver_id": "drv_001", "doc_type": "Carte VTC", "status": "pending", "uploaded_at": "2026-04-17", "expires_at": "2027-04-17"},
        {"id": "doc_002", "driver_name": "Amadou Diallo", "driver_id": "drv_002", "doc_type": "Permis de conduire", "status": "approved", "uploaded_at": "2026-03-10", "expires_at": "2031-03-10"},
        {"id": "doc_003", "driver_name": "Sophie Martin", "driver_id": "drv_003", "doc_type": "Assurance véhicule", "status": "pending", "uploaded_at": "2026-04-15", "expires_at": "2027-04-15"},
    ],
}

_FEATURED_UNTIL = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

# Category-specific demo data (Beauty, Pet, CarCare, Towing, etc.)
CATEGORY_SEEDS = {
    "beauty_salons": [
        {"id": "bs_01", "name": "L'Atelier Coiffure", "category": "Coiffure", "address": "12 Rue Saint-Honoré, Paris 75001", "phone": "+33145678901", "rating": 4.8, "price_range": "€€", "services": ["Coupe", "Couleur", "Brushing"], "image": "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400", "open_hours": "9h-19h", "is_featured": True, "featured_until": _FEATURED_UNTIL, "featured_priority": 10},
        {"id": "bs_02", "name": "Beauty Spa Marais", "category": "Spa & Massage", "address": "8 Rue de Bretagne, Paris 75003", "phone": "+33142345678", "rating": 4.9, "price_range": "€€€", "services": ["Massage", "Soins visage", "Manucure"], "image": "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=400", "open_hours": "10h-21h"},
        {"id": "bs_03", "name": "Glamour Maquillage", "category": "Maquillage", "address": "25 Bd Saint-Germain, Paris 75005", "phone": "+33143987654", "rating": 4.7, "price_range": "€€", "services": ["Maquillage soirée", "Mariée", "Cours"], "image": "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=400", "open_hours": "11h-20h"},
        {"id": "bs_04", "name": "Barber Shop Pigalle", "category": "Soins Hommes", "address": "3 Rue Frochot, Paris 75009", "phone": "+33148765432", "rating": 4.6, "price_range": "€€", "services": ["Coupe homme", "Taille barbe", "Rasage"], "image": "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400", "open_hours": "10h-20h"},
        {"id": "bs_05", "name": "Nail Studio Opéra", "category": "Manucure", "address": "17 Rue Auber, Paris 75009", "phone": "+33147892345", "rating": 4.5, "price_range": "€", "services": ["Manucure", "Pédicure", "Vernis semi-permanent"], "image": "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400", "open_hours": "10h-19h"},
    ],
    "pet_providers": [
        {"id": "pp_01", "name": "Toilettage Canin du Marais", "category": "Toilettage", "address": "5 Rue Vieille du Temple, Paris 75004", "phone": "+33142111213", "rating": 4.9, "price_range": "€€", "services": ["Bain", "Tonte", "Coupe griffes"], "image": "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?w=400", "pet_types": ["Chien", "Chat"]},
        {"id": "pp_02", "name": "Dog Walker Paris", "category": "Promenade", "address": "Paris 75011 (mobile)", "phone": "+33645678901", "rating": 4.8, "price_range": "€", "services": ["Promenade 30min", "Promenade 1h", "Garde journée"], "image": "https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=400", "pet_types": ["Chien"]},
        {"id": "pp_03", "name": "Pension Féline Bastille", "category": "Pension", "address": "22 Rue de Lyon, Paris 75012", "phone": "+33143222324", "rating": 4.7, "price_range": "€€", "services": ["Pension journalière", "Long séjour"], "image": "https://images.unsplash.com/photo-1574144611937-0df059b5ef3e?w=400", "pet_types": ["Chat"]},
        {"id": "pp_04", "name": "Vétérinaire Express", "category": "Vétérinaire", "address": "10 Av. de la République, Paris 75011", "phone": "+33148334455", "rating": 4.9, "price_range": "€€", "services": ["Consultation", "Vaccins", "Urgences"], "image": "https://images.unsplash.com/photo-1576201836106-db1758fd1c97?w=400", "pet_types": ["Chien", "Chat", "NAC"]},
        {"id": "pp_05", "name": "Pet Shop Premium", "category": "Boutique", "address": "33 Bd Voltaire, Paris 75011", "phone": "+33143556677", "rating": 4.6, "price_range": "€€", "services": ["Croquettes", "Accessoires", "Jouets"], "image": "https://images.unsplash.com/photo-1601758174039-7c5b8b3e7d75?w=400", "pet_types": ["Chien", "Chat", "Oiseau"]},
    ],
    "car_services": [
        {"id": "cs_01", "name": "Lavage Auto Express", "category": "Lavage", "address": "5 Rue de la Roquette, Paris 75011", "phone": "+33142112233", "rating": 4.7, "price_from": 15.0, "services": ["Lavage extérieur", "Intérieur", "Polish"], "image": "https://images.unsplash.com/photo-1605164599901-db7f68c4b7a4?w=400", "duration_mins": 30},
        {"id": "cs_02", "name": "Garage Mécanique Bastille", "category": "Mécanique", "address": "15 Av. Ledru-Rollin, Paris 75012", "phone": "+33143112233", "rating": 4.8, "price_from": 50.0, "services": ["Vidange", "Freins", "Diagnostic"], "image": "https://images.unsplash.com/photo-1486754735734-325b5831c3ad?w=400", "duration_mins": 60, "is_featured": True, "featured_until": _FEATURED_UNTIL, "featured_priority": 10},
        {"id": "cs_03", "name": "Pneus 24/7", "category": "Pneumatiques", "address": "8 Bd Diderot, Paris 75012", "phone": "+33144112233", "rating": 4.6, "price_from": 80.0, "services": ["Montage", "Équilibrage", "Géométrie"], "image": "https://images.unsplash.com/photo-1632823469850-2f77dd9c7f93?w=400", "duration_mins": 45},
        {"id": "cs_04", "name": "Auto Battery Service", "category": "Batterie", "address": "Service à domicile Paris", "phone": "+33645223344", "rating": 4.9, "price_from": 120.0, "services": ["Test batterie", "Remplacement", "Dépannage"], "image": "https://images.unsplash.com/photo-1597077962467-be16edbab6e1?w=400", "duration_mins": 30},
        {"id": "cs_05", "name": "Carburant Mobile", "category": "Carburant", "address": "Service à domicile Paris", "phone": "+33646334455", "rating": 4.7, "price_from": 25.0, "services": ["SP95", "SP98", "Diesel"], "image": "https://images.unsplash.com/photo-1545262810-77515befe149?w=400", "duration_mins": 20},
        {"id": "cs_06", "name": "Pièces Auto Pro", "category": "Boutique", "address": "44 Rue de Charenton, Paris 75012", "phone": "+33145443322", "rating": 4.5, "price_from": 10.0, "services": ["Pièces neuves", "Pièces occasion", "Accessoires"], "image": "https://images.unsplash.com/photo-1486326658981-ed68abe5868e?w=400", "duration_mins": 0},
    ],
    "towing_partners": [
        {"id": "tw_01", "name": "Dépann'Express 24/7", "address": "Île-de-France", "phone": "+33800111222", "rating": 4.8, "response_time_mins": 30, "services": ["Remorquage", "Démarrage", "Pneu crevé"], "available_24h": True, "price_from": 80.0, "is_featured": True, "featured_until": _FEATURED_UNTIL, "featured_priority": 10},
        {"id": "tw_02", "name": "Auto Secours Paris", "address": "Paris intra-muros", "phone": "+33800333444", "rating": 4.7, "response_time_mins": 25, "services": ["Remorquage moto/auto", "Panne sèche"], "available_24h": True, "price_from": 70.0},
        {"id": "tw_03", "name": "Roadside Pro", "address": "Banlieue Est & Sud", "phone": "+33800555666", "rating": 4.6, "response_time_mins": 40, "services": ["Remorquage longue distance", "Convoyage"], "available_24h": False, "price_from": 100.0},
        {"id": "tw_04", "name": "Allo Dépanneur", "address": "Banlieue Ouest & Nord", "phone": "+33800777888", "rating": 4.9, "response_time_mins": 20, "services": ["Démarrage", "Ouverture portière", "Carburant"], "available_24h": True, "price_from": 60.0},
    ],
    "nearby_businesses": [
        {"id": "nb_01", "name": "Café de Flore", "category": "Café", "address": "172 Bd Saint-Germain, Paris 75006", "rating": 4.5, "distance_km": 0.8, "image": "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400", "open_now": True},
        {"id": "nb_02", "name": "Bar Le Mary Celeste", "category": "Bar", "address": "1 Rue Commines, Paris 75003", "rating": 4.7, "distance_km": 1.2, "image": "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400", "open_now": True},
        {"id": "nb_03", "name": "Salon Pure Beauty", "category": "Salon", "address": "10 Rue de Rivoli, Paris 75004", "rating": 4.6, "distance_km": 0.5, "image": "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=400", "open_now": True},
        {"id": "nb_04", "name": "Boulangerie du Coin", "category": "Boulangerie", "address": "5 Rue de Turenne, Paris 75004", "rating": 4.8, "distance_km": 0.3, "image": "https://images.unsplash.com/photo-1568254183919-78a4f43a2877?w=400", "open_now": True},
        {"id": "nb_05", "name": "Pharmacie Centrale", "category": "Pharmacie", "address": "21 Rue Saint-Antoine, Paris 75004", "rating": 4.4, "distance_km": 0.7, "image": "https://images.unsplash.com/photo-1631549916768-4119b4123a21?w=400", "open_now": True},
        {"id": "nb_06", "name": "Le Petit Bistrot", "category": "Restaurant", "address": "33 Rue des Archives, Paris 75004", "rating": 4.6, "distance_km": 1.0, "image": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400", "open_now": False},
    ],
    "ondemand_services": [
        {"id": "od_01", "name": "Bricoleur Express", "category": "Bricolage", "rating": 4.8, "price_from": 35.0, "price_unit": "/h", "image": "https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400", "services": ["Montage meuble", "Petite réparation", "Étagère"]},
        {"id": "od_02", "name": "Massage à Domicile", "category": "Bien-être", "rating": 4.9, "price_from": 60.0, "price_unit": "/séance", "image": "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400", "services": ["Relaxant", "Sportif", "Thaïlandais"]},
        {"id": "od_03", "name": "Mécano à Domicile", "category": "Auto", "rating": 4.7, "price_from": 50.0, "price_unit": "/h", "image": "https://images.unsplash.com/photo-1486754735734-325b5831c3ad?w=400", "services": ["Diagnostic", "Petite réparation", "Vidange"]},
        {"id": "od_04", "name": "Ménage à la Demande", "category": "Ménage", "rating": 4.8, "price_from": 25.0, "price_unit": "/h", "image": "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400", "services": ["Ménage régulier", "Grand nettoyage", "Vitres"]},
        {"id": "od_05", "name": "Cours de Yoga", "category": "Sport", "rating": 4.9, "price_from": 40.0, "price_unit": "/cours", "image": "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=400", "services": ["Hatha", "Vinyasa", "Méditation"]},
        {"id": "od_06", "name": "Coach Sportif", "category": "Sport", "rating": 4.8, "price_from": 50.0, "price_unit": "/séance", "image": "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400", "services": ["Musculation", "Cardio", "Perte de poids"]},
    ],
    "carpool_trips": [
        {"id": "cp_01", "driver_name": "Marc D.", "driver_rating": 4.9, "from_city": "Paris", "to_city": "Lyon", "departure_at": "2026-04-25T08:00:00Z", "seats_available": 3, "price_per_seat": 35.0, "vehicle": "Peugeot 508", "duration_h": 4.5},
        {"id": "cp_02", "driver_name": "Sophie L.", "driver_rating": 4.8, "from_city": "Paris", "to_city": "Bordeaux", "departure_at": "2026-04-26T07:30:00Z", "seats_available": 2, "price_per_seat": 45.0, "vehicle": "Renault Talisman", "duration_h": 5.5},
        {"id": "cp_03", "driver_name": "Karim B.", "driver_rating": 4.7, "from_city": "Paris", "to_city": "Marseille", "departure_at": "2026-04-27T06:00:00Z", "seats_available": 4, "price_per_seat": 50.0, "vehicle": "VW Passat", "duration_h": 7.5},
        {"id": "cp_04", "driver_name": "Émilie R.", "driver_rating": 5.0, "from_city": "Lyon", "to_city": "Paris", "departure_at": "2026-04-25T15:00:00Z", "seats_available": 2, "price_per_seat": 30.0, "vehicle": "Tesla Model 3", "duration_h": 4.5},
        {"id": "cp_05", "driver_name": "Antoine F.", "driver_rating": 4.6, "from_city": "Nantes", "to_city": "Paris", "departure_at": "2026-04-26T09:00:00Z", "seats_available": 3, "price_per_seat": 40.0, "vehicle": "Citroën C5", "duration_h": 4.0},
    ],
    "marketplace_listings": [
        {"id": "ml_01", "title": "Appartement 3 pièces à louer", "category": "real-estate", "type": "Location", "price": 1450, "currency": "EUR/mois", "location": "Paris 11ème", "image": "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400", "description": "65m², balcon, métro Voltaire"},
        {"id": "ml_02", "title": "Studio meublé", "category": "real-estate", "type": "Location", "price": 850, "currency": "EUR/mois", "location": "Paris 9ème", "image": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400", "description": "25m², proche Opéra"},
        {"id": "ml_03", "title": "Maison à vendre", "category": "real-estate", "type": "Vente", "price": 285000, "currency": "EUR", "location": "Saint-Mandé", "image": "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400", "description": "Maison 4 ch., jardin 200m²"},
        {"id": "ml_04", "title": "Peugeot 308 - 2020", "category": "cars", "type": "Vente", "price": 14500, "currency": "EUR", "location": "Paris", "image": "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400", "description": "45 000 km, essence, première main"},
        {"id": "ml_05", "title": "Tesla Model Y - 2022", "category": "cars", "type": "Vente", "price": 39900, "currency": "EUR", "location": "Boulogne", "image": "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=400", "description": "12 000 km, autonomie 480 km"},
        {"id": "ml_06", "title": "iPhone 14 Pro - 256 Go", "category": "items", "type": "Vente", "price": 850, "currency": "EUR", "location": "Paris", "image": "https://images.unsplash.com/photo-1663499482523-1c0c1bae4ce1?w=400", "description": "Comme neuf, sous garantie"},
        {"id": "ml_07", "title": "Canapé d'angle cuir", "category": "items", "type": "Vente", "price": 480, "currency": "EUR", "location": "Paris", "image": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400", "description": "Très bon état, livraison possible"},
    ],
}

# Demo drivers (with linked user accounts), password Driver123!
DEMO_DRIVERS_SEED = [
    {"email": "jean.dupont@demo.sb", "name": "Jean Dupont", "phone": "+33611111111", "vehicle_type": "Car", "vehicle_model": "Peugeot 508", "vehicle_number": "AB-123-CD", "points": 85, "total_trips": 420, "rating": 4.8, "earnings": 3200.50},
    {"email": "amadou.diallo@demo.sb", "name": "Amadou Diallo", "phone": "+33622222222", "vehicle_type": "Car", "vehicle_model": "Renault Talisman", "vehicle_number": "EF-456-GH", "points": 72, "total_trips": 310, "rating": 4.9, "earnings": 2800.00},
    {"email": "sophie.martin@demo.sb", "name": "Sophie Martin", "phone": "+33633333333", "vehicle_type": "Moto", "vehicle_model": "Yamaha MT-07", "vehicle_number": "IJ-789-KL", "points": 55, "total_trips": 180, "rating": 4.7, "earnings": 1500.00},
]
