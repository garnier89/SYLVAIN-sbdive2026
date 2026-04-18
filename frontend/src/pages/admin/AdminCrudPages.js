import React, { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Plus, Trash, PencilSimple, MagnifyingGlass, Buildings, Car, Bed, Briefcase, UsersThree } from '@phosphor-icons/react';
import { toast } from 'sonner';

const pages = {
  groups: { title: 'User Groups / Roles', icon: UsersThree, items: [
    { id: 'g1', name: 'Utilisateur standard', permissions: 'Reserver, Payer, Noter', users: 1250 },
    { id: 'g2', name: 'Chauffeur VTC', permissions: 'Courses, Wallet, Documents', users: 340 },
    { id: 'g3', name: 'Marchand', permissions: 'Commandes, Produits, Promos', users: 85 },
    { id: 'g4', name: 'Administrateur', permissions: 'Toutes permissions', users: 3 },
  ]},
  vehicles: { title: 'Gestion des vehicules', icon: Car, items: [
    { id: 'v1', name: 'Peugeot 508', plate: 'AB-123-CD', driver: 'Jean D.', status: 'active' },
    { id: 'v2', name: 'Mercedes Classe E', plate: 'EF-456-GH', driver: 'Amadou D.', status: 'active' },
    { id: 'v3', name: 'Tesla Model 3', plate: 'IJ-789-KL', driver: 'Sophie M.', status: 'maintenance' },
    { id: 'v4', name: 'Renault Zoe', plate: 'MN-012-OP', driver: 'Claire P.', status: 'active' },
  ]},
  company: { title: 'Gestion entreprises', icon: Buildings, items: [
    { id: 'c1', name: 'TechCorp France', contact: 'admin@techcorp.fr', employees: 45, status: 'active' },
    { id: 'c2', name: 'Hotel Martinique', contact: 'transport@hotel-mq.com', employees: 12, status: 'active' },
  ]},
  hotels: { title: 'Hotels & Partners', icon: Bed, items: [
    { id: 'h1', name: 'Hotel La Pagerie', location: 'Fort-de-France', rooms: 120, status: 'active' },
    { id: 'h2', name: 'Residence Le Diamant', location: 'Le Diamant', rooms: 45, status: 'active' },
  ]},
  organization: { title: 'Gestion Organisation', icon: Briefcase, items: [
    { id: 'o1', name: 'SB Drive VTC SAS', siret: '123 456 789 00011', location: 'Martinique' },
    { id: 'o2', name: 'SB Drive Paris', siret: '987 654 321 00022', location: 'Ile-de-France' },
  ]},
  requests: { title: 'Demandes en attente', icon: Briefcase, items: [
    { id: 'r1', name: 'Mohamed K.', type: 'Inscription chauffeur', date: '2026-04-17', status: 'pending' },
    { id: 'r2', name: 'Sarah B.', type: 'Verification documents', date: '2026-04-16', status: 'pending' },
    { id: 'r3', name: 'Restaurant Le Marin', type: 'Inscription marchand', date: '2026-04-15', status: 'review' },
  ]},
};

const AdminCrudPage = ({ pageKey = 'groups' }) => {
  const config = pages[pageKey] || pages.groups;
  const Icon = config.icon;
  const [items] = useState(config.items);
  const [filter, setFilter] = useState('');

  const filtered = items.filter(i => (i.name || '').toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="p-6" data-testid={`admin-${pageKey}`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><Icon size={20} className="text-blue-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{config.title}</h1>
            <p className="text-sm text-gray-500">{items.length} elements</p>
          </div>
        </div>
        <Button className="bg-[#3b82f6] text-white"><Plus size={16} className="mr-1" /> Ajouter</Button>
      </div>
      <div className="relative mb-5 max-w-md">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Rechercher..." className="pl-9" value={filter} onChange={e => setFilter(e.target.value)} />
      </div>
      <div className="space-y-3">
        {filtered.map(item => (
          <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900">{item.name}</p>
              <p className="text-sm text-gray-500 mt-0.5">
                {Object.entries(item).filter(([k]) => !['id', 'name'].includes(k)).map(([k, v]) => `${k}: ${v}`).join(' | ')}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button size="icon" variant="ghost" className="h-8 w-8"><PencilSimple size={14} /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500"><Trash size={14} /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const AdminGroups = () => <AdminCrudPage pageKey="groups" />;
export const AdminVehicles = () => <AdminCrudPage pageKey="vehicles" />;
export const AdminCompany = () => <AdminCrudPage pageKey="company" />;
export const AdminHotels = () => <AdminCrudPage pageKey="hotels" />;
export const AdminOrganization = () => <AdminCrudPage pageKey="organization" />;
export const AdminRequests = () => <AdminCrudPage pageKey="requests" />;
export default AdminCrudPage;
