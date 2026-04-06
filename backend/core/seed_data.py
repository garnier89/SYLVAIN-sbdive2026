"""
V3Cube-derived seed data for SB Drive VTC.
Extracted from sbdriv5_db2024.sql and sbdriv5_beta24.sql.
"""

# ============================
# VEHICLE CATEGORIES (Ride types)
# Maps to MySQL vehicle_category table
# ============================
VEHICLE_CATEGORIES = [
    {
        "id": "vcat_vtc_taxi",
        "slug": "vtc-taxi",
        "name_en": "VTC-Taxi",
        "name_fr": "VTC-Taxi",
        "type": "Ride",
        "cat_type": "RideCategory",
        "icon": "Car",
        "display_order": 1,
        "status": "active",
        "description_fr": "Réservez votre chauffeur en un clic",
    },
    {
        "id": "vcat_moto",
        "slug": "moto",
        "name_en": "Moto",
        "name_fr": "Moto",
        "type": "Ride",
        "cat_type": "RideCategory",
        "icon": "Bike",
        "display_order": 2,
        "status": "active",
        "description_fr": "Transport rapide en moto",
    },
    {
        "id": "vcat_rental",
        "slug": "rental",
        "name_en": "Vehicle Rental with Driver",
        "name_fr": "Location avec chauffeur",
        "type": "Ride",
        "cat_type": "RideCategory",
        "icon": "Car",
        "display_order": 3,
        "status": "active",
        "description_fr": "Louez un véhicule avec chauffeur privé",
    },
    {
        "id": "vcat_pool",
        "slug": "pool",
        "name_en": "Pool",
        "name_fr": "Pool-partage",
        "type": "Ride",
        "cat_type": "RideCategory",
        "icon": "Car",
        "display_order": 4,
        "status": "active",
        "description_fr": "Partagez votre trajet et économisez",
    },
    {
        "id": "vcat_schedule",
        "slug": "schedule",
        "name_en": "Plan your trip",
        "name_fr": "Planifier votre course",
        "type": "Ride",
        "cat_type": "RideCategory",
        "icon": "Car",
        "display_order": 5,
        "status": "active",
        "description_fr": "Réservez un trajet à l'avance",
    },
    {
        "id": "vcat_corporate",
        "slug": "corporate",
        "name_en": "Book trips for your employees",
        "name_fr": "Réservez des trajets pour vos employés",
        "type": "Ride",
        "cat_type": "RideCategory",
        "icon": "Car",
        "display_order": 6,
        "status": "active",
        "description_fr": "Réservation entreprise pour vos collaborateurs",
    },
    {
        "id": "vcat_book_other",
        "slug": "book-for-other",
        "name_en": "Book for Someone Else",
        "name_fr": "Réserver pour un proche",
        "type": "Ride",
        "cat_type": "RideCategory",
        "icon": "Car",
        "display_order": 7,
        "status": "active",
        "description_fr": "Réservez un trajet pour quelqu'un d'autre",
    },
    {
        "id": "vcat_bid_taxi",
        "slug": "bid-taxi",
        "name_en": "Bid for Taxi",
        "name_fr": "Enchère pour SBD",
        "type": "Ride",
        "cat_type": "Bidding",
        "icon": "Car",
        "display_order": 8,
        "status": "active",
        "description_fr": "Négociez le prix de votre course",
    },
    {
        "id": "vcat_intercity",
        "slug": "intercity",
        "name_en": "Intercity Rides",
        "name_fr": "Trajets inter-villes",
        "type": "Ride",
        "cat_type": "RideCategory",
        "icon": "Car",
        "display_order": 9,
        "status": "active",
        "description_fr": "Voyagez entre les villes confortablement",
    },
]

# ============================
# VEHICLE TYPES (pricing tiers)
# Maps to MySQL vehicle_type table
# ============================
VEHICLE_TYPES = [
    {
        "id": "vtype_sb",
        "slug": "sb",
        "name_en": "SB",
        "name_fr": "SB",
        "category_slug": "vtc-taxi",
        "fare_type": "Regular",
        "base_fare": 1.00,
        "price_per_km": 1.00,
        "price_per_min": 0.10,
        "price_per_hour": 0.0,
        "fixed_fare": 0.0,
        "min_fare": 10.00,
        "commission_percent": 10.0,
        "pickup_price": 1.20,
        "night_price": 0.0,
        "person_capacity": 4,
        "icon_type": "Car",
        "service_type": "Ride",
        "cancellation_fare": 5.0,
        "cancellation_time_limit": 10,
        "waiting_fees": 0.50,
        "waiting_time_limit": 15,
        "status": "active",
        "display_order": 1,
    },
    {
        "id": "vtype_confort",
        "slug": "confort",
        "name_en": "Confort",
        "name_fr": "Confort",
        "category_slug": "vtc-taxi",
        "fare_type": "Regular",
        "base_fare": 2.00,
        "price_per_km": 1.50,
        "price_per_min": 0.15,
        "price_per_hour": 0.0,
        "fixed_fare": 0.0,
        "min_fare": 15.00,
        "commission_percent": 10.0,
        "pickup_price": 1.50,
        "night_price": 0.0,
        "person_capacity": 4,
        "icon_type": "Car",
        "service_type": "Ride",
        "cancellation_fare": 5.0,
        "cancellation_time_limit": 10,
        "waiting_fees": 0.60,
        "waiting_time_limit": 15,
        "status": "active",
        "display_order": 2,
    },
    {
        "id": "vtype_luxe",
        "slug": "luxe",
        "name_en": "Luxury",
        "name_fr": "Luxe",
        "category_slug": "vtc-taxi",
        "fare_type": "Regular",
        "base_fare": 5.00,
        "price_per_km": 2.50,
        "price_per_min": 0.25,
        "price_per_hour": 0.0,
        "fixed_fare": 0.0,
        "min_fare": 25.00,
        "commission_percent": 15.0,
        "pickup_price": 2.00,
        "night_price": 0.0,
        "person_capacity": 4,
        "icon_type": "Car",
        "service_type": "Ride",
        "cancellation_fare": 10.0,
        "cancellation_time_limit": 10,
        "waiting_fees": 1.00,
        "waiting_time_limit": 15,
        "status": "active",
        "display_order": 3,
    },
    {
        "id": "vtype_moto",
        "slug": "moto",
        "name_en": "Moto",
        "name_fr": "Moto",
        "category_slug": "moto",
        "fare_type": "Regular",
        "base_fare": 1.00,
        "price_per_km": 0.80,
        "price_per_min": 0.08,
        "price_per_hour": 0.0,
        "fixed_fare": 0.0,
        "min_fare": 5.00,
        "commission_percent": 10.0,
        "pickup_price": 0.80,
        "night_price": 0.0,
        "person_capacity": 1,
        "icon_type": "Bike",
        "service_type": "Ride",
        "cancellation_fare": 3.0,
        "cancellation_time_limit": 5,
        "waiting_fees": 0.30,
        "waiting_time_limit": 10,
        "status": "active",
        "display_order": 4,
    },
    {
        "id": "vtype_pool",
        "slug": "pool",
        "name_en": "Pool",
        "name_fr": "Pool",
        "category_slug": "pool",
        "fare_type": "Regular",
        "base_fare": 0.50,
        "price_per_km": 0.70,
        "price_per_min": 0.05,
        "price_per_hour": 0.0,
        "fixed_fare": 0.0,
        "min_fare": 5.00,
        "commission_percent": 10.0,
        "pickup_price": 0.80,
        "night_price": 0.0,
        "person_capacity": 4,
        "icon_type": "Car",
        "service_type": "Ride",
        "cancellation_fare": 3.0,
        "cancellation_time_limit": 5,
        "waiting_fees": 0.30,
        "waiting_time_limit": 10,
        "status": "active",
        "display_order": 5,
    },
]

# ============================
# MASTER SERVICE CATEGORIES
# Maps to MySQL master_service_category table
# ============================
MASTER_SERVICE_CATEGORIES = [
    {"id": "mscat_taxi", "slug": "taxi", "name_en": "Taxi", "name_fr": "Taxi", "type": "Ride", "status": "active", "display_order": 1},
    {"id": "mscat_delivery", "slug": "delivery", "name_en": "Delivery", "name_fr": "Livraison", "type": "Deliver", "status": "active", "display_order": 2},
    {"id": "mscat_services", "slug": "services", "name_en": "On-Demand Services", "name_fr": "Services à la demande", "type": "UberX", "status": "active", "display_order": 3},
    {"id": "mscat_video", "slug": "video-consult", "name_en": "Video Consulting", "name_fr": "Consultation Vidéo", "type": "VideoConsult", "status": "active", "display_order": 4},
    {"id": "mscat_bidding", "slug": "bidding", "name_en": "Post a Task", "name_fr": "Publier une tâche", "type": "Bidding", "status": "active", "display_order": 5},
    {"id": "mscat_medical", "slug": "medical", "name_en": "Medical Services", "name_fr": "Services Médicaux", "type": "MedicalServices", "status": "active", "display_order": 6},
]

# ============================
# SERVICE CATEGORIES (UberX / On-demand)
# Enriched from V3Cube with French translations
# ============================
SERVICE_CATEGORIES = {
    "beauty": {
        "name_fr": "Beauté",
        "name_en": "Beauty",
        "icon": "Scissors",
        "services": [
            {"slug": "hair-care", "name_fr": "Soins Capillaires", "name_en": "Hair Care"},
            {"slug": "facial", "name_fr": "Soins Visage", "name_en": "Facial"},
            {"slug": "nails", "name_fr": "Ongles & Manucure", "name_en": "Nails & Manicure"},
            {"slug": "waxing", "name_fr": "Épilation", "name_en": "Waxing"},
            {"slug": "makeup", "name_fr": "Maquillage & Coiffure", "name_en": "Makeup & Hairstyling"},
            {"slug": "massage-spa", "name_fr": "Massage & Spa", "name_en": "Massage & Spa"},
            {"slug": "men-grooming", "name_fr": "Soins Hommes", "name_en": "Men Grooming"},
            {"slug": "hands-feet", "name_fr": "Mains & Pieds", "name_en": "Hands & Feet"},
            {"slug": "eyebrows-lashes", "name_fr": "Sourcils & Cils", "name_en": "Eyebrows & Lashes"},
            {"slug": "exfoliation", "name_fr": "Exfoliation", "name_en": "Exfoliation"},
            {"slug": "tanning", "name_fr": "Bronzage", "name_en": "Tanning"},
            {"slug": "wedding", "name_fr": "Mariage & Pré-Mariage", "name_en": "Wedding & Pre-Wedding"},
        ],
    },
    "pet": {
        "name_fr": "Animaux",
        "name_en": "Pet Care",
        "icon": "PawPrint",
        "services": [
            {"slug": "grooming", "name_fr": "Toilettage", "name_en": "Grooming"},
            {"slug": "walking", "name_fr": "Promenade", "name_en": "Walking"},
            {"slug": "training", "name_fr": "Dressage", "name_en": "Training"},
            {"slug": "boarding", "name_fr": "Pension", "name_en": "Boarding"},
            {"slug": "sitting", "name_fr": "Garde", "name_en": "Sitting"},
            {"slug": "vet", "name_fr": "Soins Vétérinaires", "name_en": "Veterinary Care"},
            {"slug": "pet-spa", "name_fr": "Spa & Bien-être", "name_en": "Spa & Wellness"},
            {"slug": "nutrition", "name_fr": "Alimentation & Nutrition", "name_en": "Food & Nutrition"},
            {"slug": "accessories", "name_fr": "Accessoires & Fournitures", "name_en": "Accessories & Supplies"},
            {"slug": "transport", "name_fr": "Transport", "name_en": "Transport"},
            {"slug": "adoption", "name_fr": "Adoption & Élevage", "name_en": "Adoption & Breeding"},
            {"slug": "photo-events", "name_fr": "Photos & Événements", "name_en": "Photos & Events"},
        ],
    },
    "car-care": {
        "name_fr": "Entretien Auto",
        "name_en": "Car Care",
        "icon": "Car",
        "services": [
            {"slug": "car-wash", "name_fr": "Lavage Auto & Spa", "name_en": "Car Wash & Spa"},
            {"slug": "battery", "name_fr": "Service Batterie", "name_en": "Battery Service"},
            {"slug": "shop", "name_fr": "Boutique", "name_en": "Shop"},
            {"slug": "fuel", "name_fr": "Livraison Carburant", "name_en": "Fuel Delivery"},
            {"slug": "moto-wash", "name_fr": "Lavage Moto & Spa", "name_en": "Moto Wash & Spa"},
            {"slug": "ev-charge", "name_fr": "Recharge EV", "name_en": "EV Charging"},
            {"slug": "car-keys", "name_fr": "Clés Auto", "name_en": "Car Keys"},
            {"slug": "oil-change", "name_fr": "Vidange", "name_en": "Oil Change"},
        ],
    },
    "towing": {
        "name_fr": "Dépannage",
        "name_en": "Towing",
        "icon": "Truck",
        "services": [
            {"slug": "emergency-tow", "name_fr": "Remorquage Urgence", "name_en": "Emergency Towing"},
            {"slug": "flatbed-tow", "name_fr": "Remorquage Plateau", "name_en": "Flatbed Towing"},
            {"slug": "vehicle-recovery", "name_fr": "Récupération Véhicule", "name_en": "Vehicle Recovery"},
            {"slug": "flat-tire", "name_fr": "Pneu Crevé", "name_en": "Flat Tire"},
            {"slug": "lockout", "name_fr": "Ouverture Porte", "name_en": "Lockout Service"},
            {"slug": "jump-start", "name_fr": "Démarrage", "name_en": "Jump Start"},
            {"slug": "fuel-delivery", "name_fr": "Panne Sèche", "name_en": "Fuel Delivery"},
            {"slug": "battery-replacement", "name_fr": "Changement Batterie", "name_en": "Battery Replacement"},
            {"slug": "ev-tow-charge", "name_fr": "Recharge EV", "name_en": "EV Charging"},
        ],
    },
    "medical": {
        "name_fr": "Services Médicaux",
        "name_en": "Medical Services",
        "icon": "Stethoscope",
        "services": [
            {"slug": "appointment", "name_fr": "Prendre Rendez-vous", "name_en": "Book Appointment"},
            {"slug": "video-consult", "name_fr": "Vidéo Consultation", "name_en": "Video Consultation"},
            {"slug": "pharmacy", "name_fr": "Pharmacie", "name_en": "Pharmacy"},
            {"slug": "ambulance", "name_fr": "Ambulance", "name_en": "Ambulance"},
        ],
    },
    "handyman": {
        "name_fr": "Services à la demande",
        "name_en": "Handyman Services",
        "icon": "Wrench",
        "services": [
            {"slug": "handyman", "name_fr": "Bricolage", "name_en": "Handyman"},
            {"slug": "electrician", "name_fr": "Électricien", "name_en": "Electrician"},
            {"slug": "plumber", "name_fr": "Plombier", "name_en": "Plumber"},
            {"slug": "carpenter", "name_fr": "Menuisier", "name_en": "Carpenter"},
            {"slug": "painter", "name_fr": "Peintres", "name_en": "Painters"},
            {"slug": "cleaning", "name_fr": "Ménage Maison", "name_en": "House Cleaning"},
        ],
    },
}

# ============================
# NEARBY BUSINESS CATEGORIES
# Maps to MySQL nearby_category table
# ============================
NEARBY_CATEGORIES = [
    {"id": "ncat_restaurants", "slug": "restaurants", "name_en": "Restaurants", "name_fr": "Restaurants", "display_order": 1},
    {"id": "ncat_cafes", "slug": "cafes", "name_en": "Cafes", "name_fr": "Cafés", "display_order": 2},
    {"id": "ncat_grocery", "slug": "grocery", "name_en": "Grocery Stores", "name_fr": "Épiceries", "display_order": 3},
    {"id": "ncat_pharmacy", "slug": "pharmacy", "name_en": "Pharmacy Stores", "name_fr": "Pharmacies", "display_order": 4},
    {"id": "ncat_salons", "slug": "salons", "name_en": "Salons", "name_fr": "Salons", "display_order": 5},
    {"id": "ncat_spa", "slug": "spa", "name_en": "Spa", "name_fr": "Spa", "display_order": 6},
    {"id": "ncat_shopping", "slug": "shopping", "name_en": "Shopping", "name_fr": "Shopping", "display_order": 7},
    {"id": "ncat_events", "slug": "events", "name_en": "Events", "name_fr": "Événements", "display_order": 8},
    {"id": "ncat_hospital", "slug": "hospital", "name_en": "Hospital", "name_fr": "Hôpital", "display_order": 9},
    {"id": "ncat_gyms", "slug": "gyms", "name_en": "Gyms", "name_fr": "Salles de sport", "display_order": 10},
    {"id": "ncat_malls", "slug": "malls", "name_en": "Malls", "name_fr": "Centres commerciaux", "display_order": 11},
    {"id": "ncat_bars", "slug": "bars", "name_en": "Bars", "name_fr": "Bars", "display_order": 12},
    {"id": "ncat_parks", "slug": "parks", "name_en": "Parks", "name_fr": "Parcs", "display_order": 13},
    {"id": "ncat_museums", "slug": "museums", "name_en": "Museums", "name_fr": "Musées", "display_order": 14},
    {"id": "ncat_attractions", "slug": "attractions", "name_en": "Attractions", "name_fr": "Attractions", "display_order": 15},
    {"id": "ncat_libraries", "slug": "libraries", "name_en": "Libraries", "name_fr": "Bibliothèques", "display_order": 16},
    {"id": "ncat_nightlife", "slug": "nightlife", "name_en": "Nightlife", "name_fr": "Vie nocturne", "display_order": 17},
    {"id": "ncat_hotels", "slug": "hotels", "name_en": "Hotels", "name_fr": "Hôtels", "display_order": 18},
    {"id": "ncat_parking", "slug": "parking", "name_en": "Parking", "name_fr": "Parking", "display_order": 19},
    {"id": "ncat_car_repair", "slug": "car-repair", "name_en": "Car Repair", "name_fr": "Réparation automobile", "display_order": 20},
    {"id": "ncat_other", "slug": "other", "name_en": "Other", "name_fr": "Autre", "display_order": 21},
]

# ============================
# PARCEL DELIVERY TYPES
# Maps to MySQL genie_package_types table
# ============================
PARCEL_PACKAGE_TYPES = [
    {"id": "pkg_food", "slug": "home-food", "name_en": "Home Food", "name_fr": "Nourriture Maison", "display_order": 1},
    {"id": "pkg_care", "slug": "care-packages", "name_en": "Care Packages", "name_fr": "Forfaits de soins", "display_order": 2},
    {"id": "pkg_documents", "slug": "documents", "name_en": "Documents", "name_fr": "Documents", "display_order": 3},
    {"id": "pkg_clothes", "slug": "clothes", "name_en": "Clothes", "name_fr": "Vêtements", "display_order": 4},
    {"id": "pkg_repair", "slug": "repair-items", "name_en": "Items for Repair", "name_fr": "Articles à réparer", "display_order": 5},
]

# ============================
# CANCEL REASONS
# Maps to MySQL cancel_reason table
# ============================
CANCEL_REASONS = [
    {"id": "cr_1", "slug": "changed-mind", "reason_en": "Changed mind", "reason_fr": "Changement d'avis", "for": "User", "display_order": 1},
    {"id": "cr_2", "slug": "driver-late", "reason_en": "Driver is late", "reason_fr": "Le chauffeur est en retard", "for": "User", "display_order": 2},
    {"id": "cr_3", "slug": "wrong-address", "reason_en": "Wrong address entered", "reason_fr": "Mauvaise adresse saisie", "for": "User", "display_order": 3},
    {"id": "cr_4", "slug": "found-other", "reason_en": "Found another ride", "reason_fr": "J'ai trouvé un autre trajet", "for": "User", "display_order": 4},
    {"id": "cr_5", "slug": "price-high", "reason_en": "Price is too high", "reason_fr": "Le prix est trop élevé", "for": "User", "display_order": 5},
    {"id": "cr_6", "slug": "passenger-not-found", "reason_en": "Passenger not found", "reason_fr": "Passager introuvable", "for": "Driver", "display_order": 6},
    {"id": "cr_7", "slug": "passenger-cancel", "reason_en": "Passenger asked to cancel", "reason_fr": "Le passager a demandé d'annuler", "for": "Driver", "display_order": 7},
    {"id": "cr_8", "slug": "other", "reason_en": "Other reason", "reason_fr": "Autre raison", "for": "Both", "display_order": 8},
]

# ============================
# TRACK SERVICE CATEGORIES (Family tracking)
# Maps to MySQL track_service_category table
# ============================
TRACK_CATEGORIES = [
    {"id": "tcat_family", "slug": "family", "name_en": "Family Members", "name_fr": "Membres de la famille"},
    {"id": "tcat_employees", "slug": "employees", "name_en": "Employees", "name_fr": "Employés"},
]

# ============================
# APP CONFIGURATIONS
# Key settings from MySQL configurations table
# ============================
APP_CONFIGURATIONS = [
    {"key": "COMPANY_NAME", "value": "SB Drive VTC", "category": "General"},
    {"key": "ADMIN_EMAIL", "value": "info@sbdrivevtc.com", "category": "General"},
    {"key": "SUPPORT_MAIL", "value": "support@sbdrivevtc.com", "category": "General"},
    {"key": "SUPPORT_PHONE", "value": "FR +33767532661", "category": "General"},
    {"key": "COMPANY_ADDRESS", "value": "6 Boulevard du général gallieni 93600 Aulnay-Sous-Bois France", "category": "General"},
    {"key": "DEFAULT_CURRENCY_CODE", "value": "EUR", "category": "General"},
    {"key": "DEFAULT_CURRENCY_SIGN", "value": "€", "category": "General"},
    {"key": "DEFAULT_COUNTRY_CODE", "value": "FR", "category": "General"},
    {"key": "DEFAULT_DISTANCE_UNIT", "value": "KMs", "category": "General"},
    {"key": "SITE_ISD_CODE", "value": "33", "category": "General"},
    {"key": "APP_MODE", "value": "Development", "category": "App Settings"},
    {"key": "APP_TYPE", "value": "Ride", "category": "App Settings"},
    {"key": "WALLET_ENABLE", "value": "Yes", "category": "App Settings"},
    {"key": "WALLET_FIXED_AMOUNT_1", "value": "10", "category": "App Settings"},
    {"key": "WALLET_FIXED_AMOUNT_2", "value": "50", "category": "App Settings"},
    {"key": "WALLET_FIXED_AMOUNT_3", "value": "100", "category": "App Settings"},
    {"key": "REFERRAL_SCHEME_ENABLE", "value": "Yes", "category": "App Settings"},
    {"key": "REFERRAL_AMOUNT", "value": "10", "category": "App Settings"},
    {"key": "ENABLE_TIP_MODULE", "value": "Yes", "category": "App Settings"},
    {"key": "ENABLE_HAIL_RIDES", "value": "Yes", "category": "App Settings"},
    {"key": "ENABLE_CORPORATE_PROFILE", "value": "Yes", "category": "App Settings"},
    {"key": "RIDE_LATER_BOOKING_ENABLED", "value": "Yes", "category": "App Settings"},
    {"key": "RIDER_REQUEST_ACCEPT_TIME", "value": "40", "category": "Ride"},
    {"key": "RESTRICTION_KM_NEAREST_TAXI", "value": "100", "category": "Ride"},
    {"key": "DRIVER_LOC_UPDATE_TIME_INTERVAL", "value": "8", "category": "Ride"},
    {"key": "DRIVER_LOC_FETCH_TIME_INTERVAL", "value": "10", "category": "Ride"},
    {"key": "ADMIN_COMMISSION", "value": "10", "category": "Prices"},
    {"key": "MIN_ORDER_CANCELLATION_CHARGES", "value": "10", "category": "Prices"},
    {"key": "LIST_RESTAURANT_LIMIT_BY_DISTANCE", "value": "5", "category": "Delivery"},
    {"key": "RIDER_EMAIL_VERIFICATION", "value": "Yes", "category": "General"},
    {"key": "RIDER_PHONE_VERIFICATION", "value": "No", "category": "General"},
    {"key": "DRIVER_EMAIL_VERIFICATION", "value": "Yes", "category": "General"},
    {"key": "DRIVER_PHONE_VERIFICATION", "value": "No", "category": "General"},
    {"key": "HANDICAP_ACCESSIBILITY_OPTION", "value": "No", "category": "App Settings"},
    {"key": "FEMALE_RIDE_REQ_ENABLE", "value": "No", "category": "App Settings"},
    {"key": "CALLMASKING_ENABLED", "value": "Yes", "category": "App Settings"},
    {"key": "RIDE_DRIVER_CALLING_METHOD", "value": "Voip-VideoCall", "category": "App Settings"},
]

# ============================
# WALLET TRANSACTION TYPES
# From MySQL user_wallet table eFor enum
# ============================
WALLET_TRANSACTION_TYPES = [
    "Deposit", "Booking", "Refund", "Withdrawal",
    "Charges", "Referrer", "Transfer", "Subscription",
    "Outstanding", "Donation", "GiftCard"
]

# ============================
# TRIP PAYMENT MODES
# From MySQL trips table vTripPaymentMode enum
# ============================
PAYMENT_MODES = ["Cash", "Card", "Wallet", "Organization"]

# ============================
# TRIP STATUS FLOW
# From MySQL trips table iActive enum
# ============================
TRIP_STATUSES = ["Active", "Arrived", "On Going Trip", "Finished", "Canceled", "Inactive"]

# Mapped to our cleaner statuses
RIDE_STATUS_MAP = {
    "Active": "pending",
    "Arrived": "arriving",
    "On Going Trip": "in_progress",
    "Finished": "completed",
    "Canceled": "cancelled",
    "Inactive": "inactive",
}

# ============================
# FARE TYPES
# From MySQL vehicle_type eFareType enum
# ============================
FARE_TYPES = ["Regular", "Fixed", "Hourly"]
