import React from 'react';
import { toast } from 'sonner';
import ServiceListLayout, { ServiceCard } from '../../components/ServiceListLayout';

const ServicesPage = () => {
  const book = (item) => toast.success(`Demande envoyée à ${item.name}`);
  return (
    <ServiceListLayout
      title="Services à la demande"
      collection="ondemand_services"
      colorClass="bg-fuchsia-50 text-fuchsia-700"
      categories={['Bricolage', 'Bien-être', 'Auto', 'Ménage', 'Sport']}
      searchPlaceholder="Service, prestataire..."
      emptyHint="Aucun service dans cette catégorie"
      testId="services-page"
      renderCard={({ item }) => (
        <ServiceCard
          item={item}
          onClick={() => book(item)}
          badges={[
            { label: item.category, colorClass: 'bg-fuchsia-50 text-fuchsia-700' },
            ...(item.price_from ? [{ label: `${item.price_from}€${item.price_unit || ''}`, colorClass: 'bg-emerald-50 text-emerald-700' }] : []),
          ]}
        />
      )}
    />
  );
};

export default ServicesPage;
