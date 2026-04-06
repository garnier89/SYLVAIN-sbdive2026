import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MagnifyingGlass, X,
  Wrench, Barbell, Baby, GearSix,
  ShieldCheck, Tree, Snowflake, Broom,
  ChalkboardTeacher, Scales, PersonSimple,
  Bug, MusicNotes, Airplane,
  Heart, Dog, Scissors, Lightning,
  Drop, PaintBrush, Handshake
} from '@phosphor-icons/react';

const allServices = [
  { id: 'helpers', name: 'Aide ménagère', icon: Wrench, bg: 'bg-amber-50', iconColor: 'text-amber-700' },
  { id: 'fitness', name: 'Coach sportif', icon: Barbell, bg: 'bg-blue-50', iconColor: 'text-blue-600' },
  { id: 'babysitting', name: 'Baby-sitting', icon: Baby, bg: 'bg-green-50', iconColor: 'text-green-600' },
  { id: 'mechanic', name: 'Mécanique', icon: GearSix, bg: 'bg-teal-50', iconColor: 'text-teal-600' },
  { id: 'security', name: 'Agent de\nsécurité', icon: ShieldCheck, bg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
  { id: 'lawn', name: 'Jardinage', icon: Tree, bg: 'bg-lime-50', iconColor: 'text-lime-700' },
  { id: 'snow', name: 'Déneigement', icon: Snowflake, bg: 'bg-sky-50', iconColor: 'text-sky-600' },
  { id: 'cleaning', name: 'Nettoyage\nbureau', icon: Broom, bg: 'bg-orange-50', iconColor: 'text-orange-600' },
  { id: 'tutors', name: 'Tuteurs', icon: ChalkboardTeacher, bg: 'bg-yellow-50', iconColor: 'text-yellow-700' },
  { id: 'lawyers', name: 'Avocats', icon: Scales, bg: 'bg-emerald-50', iconColor: 'text-emerald-700' },
  { id: 'maids', name: 'Ménage', icon: PersonSimple, bg: 'bg-orange-50', iconColor: 'text-orange-600' },
  { id: 'pest', name: 'Dératisation', icon: Bug, bg: 'bg-cyan-50', iconColor: 'text-cyan-600' },
  { id: 'massage', name: 'Massage', icon: Heart, bg: 'bg-pink-50', iconColor: 'text-pink-500' },
  { id: 'dj', name: 'DJ', icon: MusicNotes, bg: 'bg-purple-50', iconColor: 'text-purple-600' },
  { id: 'travel', name: 'Agent voyage', icon: Airplane, bg: 'bg-amber-50', iconColor: 'text-amber-600' },
  { id: 'petcare', name: 'Animaux', icon: Dog, bg: 'bg-rose-50', iconColor: 'text-rose-500' },
  { id: 'beauty', name: 'Coiffure', icon: Scissors, bg: 'bg-fuchsia-50', iconColor: 'text-fuchsia-500' },
  { id: 'electrician', name: 'Électricien', icon: Lightning, bg: 'bg-yellow-50', iconColor: 'text-yellow-600' },
  { id: 'plumber', name: 'Plombier', icon: Drop, bg: 'bg-blue-50', iconColor: 'text-blue-500' },
  { id: 'painter', name: 'Peintre', icon: PaintBrush, bg: 'bg-indigo-50', iconColor: 'text-indigo-500' },
  { id: 'handyman', name: 'Bricoleur', icon: Handshake, bg: 'bg-gray-50', iconColor: 'text-gray-600' },
];

const AllServicesPage = ({ type = 'services' }) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const filtered = allServices.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="mobile-container min-h-screen bg-white">
      {/* Header */}
      <div className="bg-blue-600 px-4 py-3 flex items-center justify-between">
        <h1 className="text-white font-bold text-lg">Tous les Services</h1>
        <button onClick={() => navigate(-1)} data-testid="all-services-close-btn">
          <X size={24} className="text-white" />
        </button>
      </div>

      {/* Search */}
      <div className="p-4 bg-white sticky top-0 z-10">
        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher un service..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 rounded-xl bg-gray-100 pl-10 pr-4 text-sm outline-none border border-gray-200"
            data-testid="all-services-search"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="px-4 pb-6">
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((service) => (
            <button
              key={service.id}
              onClick={() => navigate('/services')}
              className="flex flex-col items-center gap-2 group"
              data-testid={`all-service-${service.id}`}
            >
              <div className={`w-20 h-20 rounded-2xl ${service.bg} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                <service.icon size={36} weight="duotone" className={service.iconColor} />
              </div>
              <span className="text-xs font-medium text-gray-700 text-center leading-tight whitespace-pre-line">{service.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AllServicesPage;
