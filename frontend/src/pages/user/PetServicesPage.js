import React from 'react';
import { useNavigate } from 'react-router-dom';
import ServiceListLayout, { ServiceCard } from '../../components/ServiceListLayout';

const PetServicesPage = () => {
  const navigate = useNavigate();
  const book = (item) => navigate(`/service/pets?provider=${item.id}`);
  return (
    <ServiceListLayout
      title="Services Animaux"
      collection="pet_providers"
      colorClass="bg-amber-50 text-amber-700"
      categories={['Toilettage', 'Promenade', 'Pension', 'Vétérinaire', 'Boutique']}
      searchPlaceholder="Prestataire, service..."
      emptyHint="Aucun prestataire dans cette catégorie"
      testId="pet-services-page"
      renderCard={({ item }) => (
        <ServiceCard
          item={item}
          onClick={() => book(item)}
          badges={[
            { label: item.category, colorClass: 'bg-amber-50 text-amber-700' },
            ...(item.price_range ? [{ label: item.price_range, colorClass: 'bg-gray-100 text-gray-700' }] : []),
            ...((item.pet_types || []).slice(0, 2).map(p => ({ label: p, colorClass: 'bg-blue-50 text-blue-700' }))),
          ]}
        />
      )}
    />
  );
};

export default PetServicesPage;
