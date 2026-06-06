import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, MagnifyingGlass,
  ForkKnife, Storefront, FirstAid, Flower,
  PencilLine, Wine, Drop, Buildings, HardHat
} from '@phosphor-icons/react';

const deliveryCategories = [
  { id: 'food', name: 'Livraison\nRepas', icon: ForkKnife, bg: 'bg-orange-50', iconColor: 'text-orange-500', path: '/food' },
  { id: 'grocery', name: 'Livraison\nCourses', icon: Storefront, bg: 'bg-purple-50', iconColor: 'text-purple-500', path: '/food?type=grocery' },
  { id: 'medicine', name: 'Livraison\nMédicaments', icon: FirstAid, bg: 'bg-red-50', iconColor: 'text-red-500', path: '/pharmacy' },
  { id: 'flowers', name: 'Livraison\nFleurs', icon: Flower, bg: 'bg-green-50', iconColor: 'text-green-500', path: '/food?type=florist' },
  { id: 'stationery', name: 'Livraison\nPapeterie', icon: PencilLine, bg: 'bg-cyan-50', iconColor: 'text-cyan-500', path: '/food?type=stationery' },
  { id: 'wine', name: 'Livraison\nVin', icon: Wine, bg: 'bg-amber-50', iconColor: 'text-amber-700', path: '/food?type=wine' },
  { id: 'water', name: 'Eau en\nbouteille', icon: Drop, bg: 'bg-pink-50', iconColor: 'text-pink-600', path: '/food?type=grocery' },
  { id: 'supermarket', name: 'Super-\nmarché', icon: Buildings, bg: 'bg-rose-50', iconColor: 'text-rose-600', path: '/food?type=grocery' },
  { id: 'construction', name: 'Matériaux\nConstruction', icon: HardHat, bg: 'bg-teal-50', iconColor: 'text-teal-600', path: '/food?type=construction' },
];

const AllDeliveryPage = () => {
  const navigate = useNavigate();

  return (
    <div className="mobile-container min-h-screen bg-white">
      {/* Header */}
      <div className="bg-[#FF4500] px-4 py-3 flex items-center justify-between">
        <h1 className="text-white font-bold text-lg">Tous les Services de Livraison</h1>
        <button onClick={() => navigate(-1)} data-testid="all-delivery-close-btn">
          <X size={24} className="text-white" />
        </button>
      </div>

      {/* Grid */}
      <div className="p-4">
        <div className="grid grid-cols-3 gap-4">
          {deliveryCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => navigate(cat.path)}
              className="flex flex-col items-center gap-2 group"
              data-testid={`delivery-${cat.id}`}
            >
              <div className={`w-20 h-20 rounded-2xl ${cat.bg} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                <cat.icon size={36} weight="duotone" className={cat.iconColor} />
              </div>
              <span className="text-xs font-medium text-gray-700 text-center leading-tight whitespace-pre-line">{cat.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AllDeliveryPage;
