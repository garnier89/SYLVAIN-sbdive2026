import React from 'react';
import { useNavigate } from 'react-router-dom';
import ServiceListLayout, { ServiceCard } from '../../components/ServiceListLayout';

const BeautyServicesPage = () => {
  const navigate = useNavigate();
  const book = (item) => navigate(`/service/beauty?provider=${item.id}`);
  return (
    <ServiceListLayout
      title="Services Beauté"
      collection="beauty_salons"
      colorClass="bg-pink-50 text-pink-700"
      categories={['Coiffure', 'Spa & Massage', 'Maquillage', 'Soins Hommes', 'Manucure']}
      searchPlaceholder="Salon, service..."
      emptyHint="Aucun salon dans cette catégorie"
      testId="beauty-services-page"
      renderCard={({ item }) => (
        <ServiceCard
          item={item}
          onClick={() => book(item)}
          badges={[
            { label: item.category, colorClass: 'bg-pink-50 text-pink-700' },
            { label: item.price_range, colorClass: 'bg-gray-100 text-gray-700' },
            ...(item.open_hours ? [{ label: item.open_hours, colorClass: 'bg-green-50 text-green-700' }] : []),
          ]}
        />
      )}
    />
  );
};

export default BeautyServicesPage;
