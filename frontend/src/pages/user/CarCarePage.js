import React from 'react';
import { toast } from 'sonner';
import ServiceListLayout, { ServiceCard } from '../../components/ServiceListLayout';

const CarCarePage = () => {
  const book = (item) => toast.success(`Demande envoyée à ${item.name}`);
  return (
    <ServiceListLayout
      title="Entretien Auto"
      collection="car_services"
      colorClass="bg-blue-50 text-blue-700"
      categories={['Lavage', 'Mécanique', 'Pneumatiques', 'Batterie', 'Carburant', 'Boutique']}
      searchPlaceholder="Garage, service..."
      emptyHint="Aucun service dans cette catégorie"
      testId="car-care-page"
      renderCard={({ item }) => (
        <ServiceCard
          item={item}
          onClick={() => book(item)}
          badges={[
            { label: item.category, colorClass: 'bg-blue-50 text-blue-700' },
            ...(item.price_from ? [{ label: `dès ${item.price_from}€`, colorClass: 'bg-emerald-50 text-emerald-700' }] : []),
            ...(item.duration_mins ? [{ label: `${item.duration_mins} min`, colorClass: 'bg-gray-100 text-gray-700' }] : []),
          ]}
        />
      )}
    />
  );
};

export default CarCarePage;
