import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ServiceListLayout, { ServiceCard } from '../../components/ServiceListLayout';

// Full category set — mirrors the Home « À proximité » tiles + the original commerces.
const NEARBY_CATEGORIES = [
  'Café', 'Bar', 'Restaurant', 'Salon', 'Boulangerie', 'Pharmacie',
  'Hôtel', 'Musée', 'Attraction', 'Bibliothèque', 'Vie Nocturne', 'Parking', 'Garage',
];

const NearbyBusinessPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Home tiles deep-link with ?category=<Catégorie> to pre-filter the list.
  const rawCat = (params.get('category') || '').trim();
  const initialCategory = NEARBY_CATEGORIES.find((c) => c === rawCat) || null;

  return (
    <ServiceListLayout
      title="Commerces Proches"
      collection="nearby_businesses"
      colorClass="bg-indigo-50 text-indigo-700"
      categories={NEARBY_CATEGORIES}
      initialCategory={initialCategory}
      searchPlaceholder="Commerce, type..."
      emptyHint="Aucun commerce à proximité dans cette catégorie"
      testId="nearby-page"
      renderCard={({ item }) => (
        <ServiceCard
          item={item}
          onClick={() => navigate(`/service/nearby?provider=${item.id}`)}
          badges={[
            { label: item.category, colorClass: 'bg-indigo-50 text-indigo-700' },
            { label: `${item.distance_km} km`, colorClass: 'bg-gray-100 text-gray-700' },
            { label: item.open_now ? 'Ouvert' : 'Fermé', colorClass: item.open_now ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700' },
          ]}
        />
      )}
    />
  );
};

export default NearbyBusinessPage;
