import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Coffee, Scissors, Wine, Sparkle, ShoppingCart,
  FirstAid, Barbell, Buildings, BookOpen, MoonStars
} from '@phosphor-icons/react';

const nearbyCategories = [
  { id: 'cafes', name: 'Cafés', icon: Coffee, bg: 'bg-amber-50', iconColor: 'text-amber-600' },
  { id: 'salons', name: 'Salons', icon: Scissors, bg: 'bg-pink-50', iconColor: 'text-pink-500' },
  { id: 'bars', name: 'Bars', icon: Wine, bg: 'bg-purple-50', iconColor: 'text-purple-500' },
  { id: 'spa', name: 'Spa', icon: Sparkle, bg: 'bg-teal-50', iconColor: 'text-teal-500' },
  { id: 'shopping', name: 'Shopping', icon: ShoppingCart, bg: 'bg-blue-50', iconColor: 'text-blue-500' },
  { id: 'hospital', name: 'Hôpitaux', icon: FirstAid, bg: 'bg-red-50', iconColor: 'text-red-500' },
  { id: 'gyms', name: 'Salles\nde Sport', icon: Barbell, bg: 'bg-green-50', iconColor: 'text-green-600' },
  { id: 'malls', name: 'Centres\nCommerciaux', icon: Buildings, bg: 'bg-indigo-50', iconColor: 'text-indigo-500' },
  { id: 'libraries', name: 'Bibliothèques', icon: BookOpen, bg: 'bg-yellow-50', iconColor: 'text-yellow-600' },
  { id: 'nightlife', name: 'Vie\nNocturne', icon: MoonStars, bg: 'bg-violet-50', iconColor: 'text-violet-500' },
];

const NearbyBusinessPage = () => {
  const navigate = useNavigate();

  return (
    <div className="mobile-container min-h-screen bg-white">
      {/* Header */}
      <div className="bg-[#FF4500] px-4 py-3 flex items-center justify-between">
        <h1 className="text-white font-bold text-lg italic">Tous les Services Proches</h1>
        <button onClick={() => navigate(-1)} data-testid="nearby-close-btn">
          <X size={24} className="text-white" />
        </button>
      </div>

      {/* Grid */}
      <div className="p-5">
        <div className="grid grid-cols-3 gap-5">
          {nearbyCategories.map((cat) => (
            <button
              key={cat.id}
              className="flex flex-col items-center gap-2 group"
              data-testid={`nearby-${cat.id}`}
            >
              <div className={`w-[80px] h-[80px] rounded-2xl ${cat.bg} flex items-center justify-center group-hover:scale-105 transition-transform border border-gray-100/50`}>
                <cat.icon size={36} weight="duotone" className={cat.iconColor} />
              </div>
              <span className="text-xs font-semibold text-gray-700 text-center leading-tight whitespace-pre-line">{cat.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default NearbyBusinessPage;
