import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlass, X, ArrowLeft } from '@phosphor-icons/react';

const ALL_SERVICES = [
  // Taxi Services
  { name: 'VTC Réservation', category: 'Taxi', path: '/course?mode=standard', keywords: 'vtc taxi course réservation voiture chauffeur' },
  { name: 'VTC Pooling', category: 'Taxi', path: '/course?mode=pool', keywords: 'vtc pooling covoiturage partagé' },
  { name: 'VTC Location', category: 'Taxi', path: '/course?mode=rental', keywords: 'location voiture vtc' },
  { name: 'Chauffeur Privé', category: 'Taxi', path: '/course?mode=buddy_driver', keywords: 'chauffeur privé personnel' },
  { name: 'Enchères VTC', category: 'Taxi', path: '/course?mode=bidding', keywords: 'enchères bid taxi vtc prix' },
  { name: 'VTC Intercity', category: 'Taxi', path: '/course?mode=intercity', keywords: 'intercity longue distance ville' },
  { name: 'Programmer Course', category: 'Taxi', path: '/course?mode=book_later', keywords: 'programmer planifier réserver avance' },
  { name: 'Aéroport', category: 'Taxi', path: '/course?mode=airport', keywords: 'aéroport avion vol transfert airport' },
  { name: 'Moto Réservation', category: 'Taxi', path: '/course?mode=moto', keywords: 'moto deux roues scooter' },
  { name: 'Location Moto', category: 'Taxi', path: '/course?mode=moto_rental', keywords: 'location moto scooter louer' },
  { name: 'Tuktuk', category: 'Taxi', path: '/course?mode=tuktuk', keywords: 'tuktuk rickshaw trois roues' },
  { name: 'Corporate', category: 'Taxi', path: '/course?mode=corporate', keywords: 'corporate entreprise business professionnel' },
  { name: 'Accessibilité', category: 'Taxi', path: '/course?mode=access', keywords: 'accessibilité handicap fauteuil pmr' },

  // Delivery Services
  { name: 'Livraison Repas', category: 'Livraison', path: '/food', keywords: 'repas nourriture restaurant manger food' },
  { name: 'Livraison Courses', category: 'Livraison', path: '/food', keywords: 'courses supermarché épicerie groceries' },
  { name: 'Livraison Médicaments', category: 'Livraison', path: '/food', keywords: 'médicaments pharmacie santé' },
  { name: 'Livraison de Colis', category: 'Livraison', path: '/parcel', keywords: 'colis paquet envoi parcel' },
  { name: 'Coursier Express', category: 'Livraison', path: '/parcel', keywords: 'coursier express rapide urgent' },
  { name: 'Delivery Genie', category: 'Livraison', path: '/parcel', keywords: 'genie runner commission courses' },

  // Beauty Services
  { name: 'Soins Capillaires', category: 'Beauté', path: '/beauty', keywords: 'cheveux coiffure coupe brushing' },
  { name: 'Soins Visage', category: 'Beauté', path: '/beauty', keywords: 'visage facial soin peau' },
  { name: 'Ongles & Manucure', category: 'Beauté', path: '/beauty', keywords: 'ongles manucure pédicure vernis' },
  { name: 'Épilation', category: 'Beauté', path: '/beauty', keywords: 'épilation waxing cire poils' },
  { name: 'Maquillage & Coiffure', category: 'Beauté', path: '/beauty', keywords: 'maquillage makeup coiffure' },
  { name: 'Massage & Spa', category: 'Beauté', path: '/beauty', keywords: 'massage spa détente relaxation bien-être' },
  { name: 'Soins Hommes', category: 'Beauté', path: '/beauty', keywords: 'hommes barbe barbier grooming' },
  { name: 'Bronzage', category: 'Beauté', path: '/beauty', keywords: 'bronzage tanning soleil uv' },
  { name: 'Mariage & Pré-Mariage', category: 'Beauté', path: '/beauty', keywords: 'mariage wedding mariée bridal' },

  // Pet Services
  { name: 'Toilettage Animal', category: 'Animaux', path: '/pet-care', keywords: 'toilettage grooming animal chien chat' },
  { name: 'Promenade Chien', category: 'Animaux', path: '/pet-care', keywords: 'promenade chien dog walking' },
  { name: 'Dressage', category: 'Animaux', path: '/pet-care', keywords: 'dressage éducation obéissance' },
  { name: 'Pension Animal', category: 'Animaux', path: '/pet-care', keywords: 'pension garde hébergement animal' },
  { name: 'Vétérinaire', category: 'Animaux', path: '/pet-care', keywords: 'vétérinaire vet médecin animal santé' },
  { name: 'Transport Animal', category: 'Animaux', path: '/pet-care', keywords: 'transport animal déplacement' },

  // Car Care
  { name: 'Lavage Auto', category: 'Entretien Auto', path: '/car-care', keywords: 'lavage auto voiture wash nettoyage' },
  { name: 'Service Batterie', category: 'Entretien Auto', path: '/car-care', keywords: 'batterie auto démarrage charge' },
  { name: 'Livraison Carburant', category: 'Entretien Auto', path: '/car-care', keywords: 'carburant essence diesel fuel' },
  { name: 'Vidange', category: 'Entretien Auto', path: '/car-care', keywords: 'vidange huile moteur entretien' },
  { name: 'Recharge EV', category: 'Entretien Auto', path: '/car-care', keywords: 'recharge électrique ev borne' },
  { name: 'Clés Auto', category: 'Entretien Auto', path: '/car-care', keywords: 'clés serrure ouverture auto' },

  // Towing
  { name: 'Remorquage Urgence', category: 'Dépannage', path: '/towing', keywords: 'remorquage urgence dépannage panne' },
  { name: 'Remorquage Plateau', category: 'Dépannage', path: '/towing', keywords: 'plateau fourrière transport véhicule' },
  { name: 'Pneu Crevé', category: 'Dépannage', path: '/towing', keywords: 'pneu crevé roue crevaison' },
  { name: 'Démarrage', category: 'Dépannage', path: '/towing', keywords: 'démarrage batterie morte jump start' },
  { name: 'Panne Sèche', category: 'Dépannage', path: '/towing', keywords: 'panne sèche carburant essence vide' },

  // Medical
  { name: 'Prendre Rendez-vous', category: 'Médical', path: '/sante', keywords: 'médecin docteur rendez-vous consultation' },
  { name: 'Vidéo Consultation', category: 'Médical', path: '/video-consult', keywords: 'vidéo consultation télémédecine' },
  { name: 'Pharmacie', category: 'Médical', path: '/pharmacy', keywords: 'pharmacie médicament ordonnance' },

  // On-demand
  { name: 'Bricolage', category: 'Services', path: '/services-metiers?category=bricolage', keywords: 'bricolage réparation maison' },
  { name: 'Électricien', category: 'Services', path: '/services-metiers?category=electricite', keywords: 'électricien prise courant installation' },
  { name: 'Plombier', category: 'Services', path: '/services-metiers?category=plomberie', keywords: 'plombier fuite eau tuyau robinet' },
  { name: 'Menuisier', category: 'Services', path: '/services-metiers?category=menuiserie', keywords: 'menuisier bois meuble porte' },
  { name: 'Peintres', category: 'Services', path: '/services-metiers?category=peinture', keywords: 'peintre peinture mur façade' },
  { name: 'Ménage Maison', category: 'Services', path: '/services-metiers?category=menage', keywords: 'ménage nettoyage maison propre' },

  // Marketplace
  { name: 'Immobilier', category: 'Marketplace', path: '/marketplace/real-estate', keywords: 'immobilier maison appartement acheter vendre louer' },
  { name: 'Véhicules', category: 'Marketplace', path: '/marketplace/cars', keywords: 'voiture véhicule acheter vendre louer auto' },
  { name: 'Articles Divers', category: 'Marketplace', path: '/marketplace/items', keywords: 'articles objets vendre acheter occasion' },

  // Others
  { name: 'Covoiturage', category: 'Transport', path: '/carpool', keywords: 'covoiturage partage trajet voyage' },
  { name: 'Consultation Vidéo', category: 'Services', path: '/video-consult', keywords: 'vidéo consultation tuteur avocat astrologue' },

  // Nearby & proximity
  { name: 'Musées', category: 'À proximité', path: '/nearby', keywords: 'musée musée culture art exposition' },
  { name: 'Attractions', category: 'À proximité', path: '/nearby', keywords: 'attractions loisirs parc touristique' },
  { name: 'Bibliothèques', category: 'À proximité', path: '/nearby', keywords: 'bibliothèque livres lecture étude' },
  { name: 'Vie Nocturne', category: 'À proximité', path: '/nearby', keywords: 'vie nocturne club boîte nuit soirée' },
  { name: 'Hôtels', category: 'À proximité', path: '/nearby', keywords: 'hôtel hébergement chambre nuit séjour' },
  { name: 'Parking', category: 'À proximité', path: '/nearby', keywords: 'parking stationnement garer voiture place' },
  { name: 'Garage', category: 'À proximité', path: '/nearby', keywords: 'garage réparation mécanique auto' },

  // Extra on-demand & care
  { name: 'Ménage', category: 'Services', path: '/services-metiers?category=menage', keywords: 'ménage nettoyage maison propre femme de ménage' },
  { name: 'Jardinage', category: 'Services', path: '/services-metiers?category=jardinage', keywords: 'jardinage pelouse jardin tonte plantes' },
  { name: 'Tutorat', category: 'Services', path: '/video-consult', keywords: 'tutorat cours soutien scolaire professeur' },
  { name: 'Avocats', category: 'Services', path: '/video-consult', keywords: 'avocat juridique droit conseil légal' },
  { name: 'Astrologue', category: 'Services', path: '/video-consult', keywords: 'astrologue voyance horoscope astrologie' },
  { name: 'Boutique Pièces', category: 'Entretien Auto', path: '/car-care', keywords: 'boutique pièces auto accessoires shop' },
  { name: 'Lavage Moto', category: 'Entretien Auto', path: '/car-care', keywords: 'lavage moto scooter nettoyage deux roues' },
  { name: 'Spa & Massage', category: 'Beauté', path: '/beauty', keywords: 'spa massage détente relaxation bien-être' },
];

const CATEGORY_COLORS = {
  'Taxi': 'bg-amber-100 text-amber-700',
  'Livraison': 'bg-rose-100 text-rose-700',
  'Beauté': 'bg-pink-100 text-pink-700',
  'Animaux': 'bg-blue-100 text-[#E03D00]',
  'Entretien Auto': 'bg-cyan-100 text-cyan-700',
  'Dépannage': 'bg-red-100 text-red-700',
  'Médical': 'bg-green-100 text-green-700',
  'Services': 'bg-purple-100 text-purple-700',
  'Marketplace': 'bg-indigo-100 text-indigo-700',
  'Transport': 'bg-emerald-100 text-emerald-700',
};

const SearchOverlay = ({ onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const normalize = (str) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const results = query.trim().length > 0
    ? ALL_SERVICES.filter(s => {
        const q = normalize(query);
        return normalize(s.name).includes(q) || normalize(s.keywords).includes(q) || normalize(s.category).includes(q);
      })
    : [];

  const grouped = results.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  const handleSelect = (service) => {
    onClose();
    navigate(service.path);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-white" data-testid="search-overlay">
      {/* Search Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} data-testid="search-close-btn">
          <ArrowLeft size={22} className="text-gray-700" />
        </button>
        <div className="flex-1 relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un service..."
            className="w-full h-11 rounded-xl bg-gray-100 pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:bg-gray-50 focus:ring-2 focus:ring-blue-200"
            data-testid="search-input"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2" data-testid="search-clear-btn">
              <X size={18} className="text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="overflow-y-auto" style={{ height: 'calc(100vh - 70px)' }}>
        {query.trim().length === 0 && (
          <div className="p-6">
            <p className="text-sm font-semibold text-gray-500 mb-4">Suggestions populaires</p>
            <div className="flex flex-wrap gap-2">
              {['VTC', 'Repas', 'Colis', 'Massage', 'Plombier', 'Lavage', 'Immobilier', 'Covoiturage'].map(tag => (
                <button
                  key={tag}
                  onClick={() => setQuery(tag)}
                  className="px-4 py-2 bg-gray-100 rounded-full text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
                  data-testid={`search-tag-${tag.toLowerCase()}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {query.trim().length > 0 && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6">
            <MagnifyingGlass size={48} className="text-gray-300 mb-4" />
            <p className="text-base font-semibold text-gray-500">Aucun résultat</p>
            <p className="text-sm text-gray-400 mt-1 text-center">Essayez avec d'autres mots-clés comme "taxi", "massage" ou "plombier"</p>
          </div>
        )}

        {Object.entries(grouped).map(([category, services]) => (
          <div key={category} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${CATEGORY_COLORS[category] || 'bg-gray-100 text-gray-600'}`}>
                {category}
              </span>
              <span className="text-[11px] text-gray-400">{services.length} service{services.length > 1 ? 's' : ''}</span>
            </div>
            {services.map((service) => (
              <button
                key={service.name}
                onClick={() => handleSelect(service)}
                className="w-full flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 text-left hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors"
                data-testid={`search-result-${service.name.toLowerCase().replace(/\s/g, '-')}`}
              >
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <MagnifyingGlass size={16} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{service.name}</p>
                  <p className="text-[11px] text-gray-400">{category}</p>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SearchOverlay;
