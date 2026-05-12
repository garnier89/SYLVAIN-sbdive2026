import React from 'react';
import { toast } from 'sonner';
import ServiceListLayout, { ServiceCard } from '../../components/ServiceListLayout';

const NearbyBusinessPage = () => {
  return (
    <ServiceListLayout
      title="Commerces Proches"
      collection="nearby_businesses"
      colorClass="bg-indigo-50 text-indigo-700"
      categories={['Café', 'Bar', 'Salon', 'Boulangerie', 'Pharmacie', 'Restaurant']}
      searchPlaceholder="Commerce, type..."
      emptyHint="Aucun commerce à proximité"
      testId="nearby-page"
      renderCard={({ item }) => (
        <ServiceCard
          item={item}
          onClick={() => toast.info(`${item.name} — ${item.distance_km} km`)}
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
