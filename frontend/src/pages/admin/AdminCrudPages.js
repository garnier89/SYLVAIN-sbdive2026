import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Plus, Trash, PencilSimple, MagnifyingGlass, Buildings, Car, Bed, Briefcase, UsersThree,
  Wrench, Warning, HandCoins, EnvelopeSimple, ChatCircleText, XCircle,
  Bell, FileText
} from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const collectionConfigs = {
  groups: { title: 'User Groups / Roles', icon: UsersThree, collection: 'groups',
    fields: [
      { key: 'name', label: 'Nom du groupe', type: 'text' },
      { key: 'permissions', label: 'Permissions', type: 'text' },
      { key: 'users', label: 'Nb utilisateurs', type: 'number' },
    ],
    defaults: [
      { id: 'g1', name: 'Utilisateur standard', permissions: 'Reserver, Payer, Noter', users: 1250 },
      { id: 'g2', name: 'Chauffeur VTC', permissions: 'Courses, Wallet, Documents', users: 340 },
      { id: 'g3', name: 'Marchand', permissions: 'Commandes, Produits, Promos', users: 85 },
      { id: 'g4', name: 'Administrateur', permissions: 'Toutes permissions', users: 3 },
    ],
  },
  vehicles: { title: 'Gestion des vehicules', icon: Car, collection: 'vehicles',
    fields: [
      { key: 'name', label: 'Modele', type: 'text' },
      { key: 'plate', label: 'Immatriculation', type: 'text' },
      { key: 'driver', label: 'Chauffeur', type: 'text' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [
      { id: 'v1', name: 'Peugeot 508', plate: 'AB-123-CD', driver: 'Jean D.', status: 'active' },
      { id: 'v2', name: 'Mercedes Classe E', plate: 'EF-456-GH', driver: 'Amadou D.', status: 'active' },
    ],
  },
  company: { title: 'Gestion entreprises', icon: Buildings, collection: 'companies',
    fields: [
      { key: 'name', label: 'Nom entreprise', type: 'text' },
      { key: 'contact', label: 'Contact', type: 'text' },
      { key: 'employees', label: 'Employes', type: 'number' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [
      { id: 'c1', name: 'TechCorp France', contact: 'admin@techcorp.fr', employees: 45, status: 'active' },
    ],
  },
  hotels: { title: 'Hotels & Partners', icon: Bed, collection: 'hotels',
    fields: [
      { key: 'name', label: 'Nom hotel', type: 'text' },
      { key: 'location', label: 'Localisation', type: 'text' },
      { key: 'rooms', label: 'Chambres', type: 'number' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [
      { id: 'h1', name: 'Hotel La Pagerie', location: 'Fort-de-France', rooms: 120, status: 'active' },
    ],
  },
  organization: { title: 'Gestion Organisation', icon: Briefcase, collection: 'organizations',
    fields: [
      { key: 'name', label: 'Nom', type: 'text' },
      { key: 'siret', label: 'SIRET', type: 'text' },
      { key: 'location', label: 'Localisation', type: 'text' },
    ],
    defaults: [
      { id: 'o1', name: 'SB Drive VTC SAS', siret: '123 456 789 00011', location: 'Martinique' },
    ],
  },
  requests: { title: 'Demandes en attente', icon: Briefcase, collection: 'pending_requests',
    fields: [
      { key: 'name', label: 'Nom', type: 'text' },
      { key: 'type', label: 'Type', type: 'text' },
      { key: 'date', label: 'Date', type: 'text' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [
      { id: 'r1', name: 'Mohamed K.', type: 'Inscription chauffeur', date: '2026-04-17', status: 'pending' },
    ],
  },
  vehicle_makes: { title: 'Vehicle Make', icon: Car, collection: 'vehicle_makes',
    fields: [
      { key: 'name', label: 'Marque', type: 'text' },
      { key: 'country', label: 'Pays', type: 'text' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [
      { id: 'vm1', name: 'Peugeot', country: 'France', status: 'active' },
      { id: 'vm2', name: 'Mercedes-Benz', country: 'Allemagne', status: 'active' },
      { id: 'vm3', name: 'Tesla', country: 'USA', status: 'active' },
      { id: 'vm4', name: 'Renault', country: 'France', status: 'active' },
    ],
  },
  vehicle_models: { title: 'Vehicle Model', icon: Car, collection: 'vehicle_models',
    fields: [
      { key: 'name', label: 'Modele', type: 'text' },
      { key: 'make', label: 'Marque', type: 'text' },
      { key: 'year', label: 'Annee', type: 'number' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [
      { id: 'vmd1', name: '508', make: 'Peugeot', year: 2024, status: 'active' },
      { id: 'vmd2', name: 'Classe E', make: 'Mercedes-Benz', year: 2024, status: 'active' },
    ],
  },
  master_services: { title: 'Master Services', icon: Wrench, collection: 'master_services',
    fields: [
      { key: 'name', label: 'Nom du service', type: 'text' },
      { key: 'slug', label: 'Slug', type: 'text' },
      { key: 'commission', label: 'Commission %', type: 'number' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [
      { id: 'ms1', name: 'Taxi Transport', slug: 'taxi', commission: 15, status: 'active' },
      { id: 'ms2', name: 'Livraison Colis', slug: 'parcel', commission: 12, status: 'active' },
      { id: 'ms3', name: 'Delivery Marchand', slug: 'store-delivery', commission: 20, status: 'active' },
    ],
  },
  cancel_reasons: { title: 'Cancel Reasons', icon: XCircle, collection: 'cancel_reasons',
    fields: [
      { key: 'name', label: 'Raison', type: 'text' },
      { key: 'scope', label: 'Pour', type: 'text' },
      { key: 'order', label: 'Ordre', type: 'number' },
    ],
    defaults: [
      { id: 'cr1', name: 'Chauffeur en retard', scope: 'user', order: 1 },
      { id: 'cr2', name: 'J\'ai change d\'avis', scope: 'user', order: 2 },
      { id: 'cr3', name: 'Adresse introuvable', scope: 'driver', order: 1 },
    ],
  },
  email_templates: { title: 'Email Templates', icon: EnvelopeSimple, collection: 'email_templates',
    fields: [
      { key: 'name', label: 'Nom', type: 'text' },
      { key: 'subject', label: 'Objet', type: 'text' },
      { key: 'trigger', label: 'Trigger', type: 'text' },
    ],
    defaults: [
      { id: 'et1', name: 'Bienvenue', subject: 'Bienvenue chez SB Drive VTC', trigger: 'user_register' },
      { id: 'et2', name: 'Course terminee', subject: 'Votre course est terminee', trigger: 'ride_completed' },
    ],
  },
  sms_templates: { title: 'SMS Templates', icon: ChatCircleText, collection: 'sms_templates',
    fields: [
      { key: 'name', label: 'Nom', type: 'text' },
      { key: 'body', label: 'Message', type: 'text' },
      { key: 'trigger', label: 'Trigger', type: 'text' },
    ],
    defaults: [
      { id: 'sm1', name: 'Code OTP', body: 'Votre code SB Drive: {code}', trigger: 'otp' },
      { id: 'sm2', name: 'Chauffeur arrive', body: 'Votre chauffeur est arrive !', trigger: 'driver_arrived' },
    ],
  },
  sos_requests: { title: 'SOS Requests', icon: Warning, collection: 'sos_requests',
    fields: [
      { key: 'name', label: 'Utilisateur', type: 'text' },
      { key: 'phone', label: 'Telephone', type: 'text' },
      { key: 'reason', label: 'Raison', type: 'text' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [],
  },
  contact_requests: { title: 'Contact Us Requests', icon: EnvelopeSimple, collection: 'contact_requests',
    fields: [
      { key: 'name', label: 'Nom', type: 'text' },
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'subject', label: 'Sujet', type: 'text' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [],
  },
  withdraw_requests: { title: 'Withdraw Requests', icon: HandCoins, collection: 'withdraw_requests',
    fields: [
      { key: 'name', label: 'Chauffeur', type: 'text' },
      { key: 'amount', label: 'Montant (EUR)', type: 'number' },
      { key: 'iban', label: 'IBAN', type: 'text' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [],
  },
  order_help_requests: { title: 'Order Help Requests', icon: FileText, collection: 'order_help_requests',
    fields: [
      { key: 'name', label: 'Client', type: 'text' },
      { key: 'order_id', label: 'Commande ID', type: 'text' },
      { key: 'issue', label: 'Probleme', type: 'text' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [],
  },
  trip_help_requests: { title: 'Trip Help Requests', icon: FileText, collection: 'trip_help_requests',
    fields: [
      { key: 'name', label: 'Client', type: 'text' },
      { key: 'ride_id', label: 'Course ID', type: 'text' },
      { key: 'issue', label: 'Probleme', type: 'text' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [],
  },
  push_notifications: { title: 'Send Push-Notification', icon: Bell, collection: 'push_notifications',
    fields: [
      { key: 'name', label: 'Titre', type: 'text' },
      { key: 'body', label: 'Message', type: 'text' },
      { key: 'target', label: 'Cible (all/users/drivers)', type: 'text' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [],
  },
  payouts: { title: 'Driver Payouts', icon: HandCoins, collection: 'payouts',
    fields: [
      { key: 'name', label: 'Chauffeur', type: 'text' },
      { key: 'amount', label: 'Montant (EUR)', type: 'number' },
      { key: 'period', label: 'Periode', type: 'text' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [],
  },
  settlements: { title: 'Settlements', icon: HandCoins, collection: 'settlements',
    fields: [
      { key: 'name', label: 'Partenaire', type: 'text' },
      { key: 'amount', label: 'Montant (EUR)', type: 'number' },
      { key: 'commission', label: 'Commission %', type: 'number' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [],
  },
  disputes: { title: 'Disputes', icon: Warning, collection: 'disputes',
    fields: [
      { key: 'name', label: 'Utilisateur', type: 'text' },
      { key: 'ride_id', label: 'Course/Commande', type: 'text' },
      { key: 'reason', label: 'Motif', type: 'text' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [],
  },
  documents: { title: 'Documents', icon: FileText, collection: 'documents',
    fields: [
      { key: 'name', label: 'Titre', type: 'text' },
      { key: 'type', label: 'Type', type: 'text' },
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'status', label: 'Statut', type: 'text' },
    ],
    defaults: [],
  },

};

const AdminCrudPage = ({ pageKey = 'groups' }) => {
  const config = collectionConfigs[pageKey] || collectionConfigs.groups;
  const Icon = config.icon;
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});

  const loadItems = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/crud/${config.collection}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setItems(data.length > 0 ? data : config.defaults);
      } else {
        setItems(config.defaults);
      }
    } catch (err) {
      console.error('Load error:', err);
      setItems(config.defaults);
    }
    finally { setLoading(false); }
  }, [config.collection, config.defaults]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const resetForm = () => {
    const empty = {};
    config.fields.forEach(f => { empty[f.key] = f.type === 'number' ? 0 : ''; });
    setForm(empty);
    setEditingId(null);
  };

  const handleSave = async () => {
    try {
      if (editingId) {
        await fetch(`${API}/api/admin/crud/${config.collection}/${editingId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify(form),
        });
        toast.success('Element modifie');
      } else {
        await fetch(`${API}/api/admin/crud/${config.collection}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify(form),
        });
        toast.success('Element ajoute');
      }
      setShowForm(false);
      resetForm();
      loadItems();
    } catch (err) { console.error('Save error:', err); toast.error('Erreur'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cet element ?')) return;
    try {
      await fetch(`${API}/api/admin/crud/${config.collection}/${id}`, { method: 'DELETE', credentials: 'include' });
      toast.success('Element supprime');
      loadItems();
    } catch (err) { console.error('Delete error:', err); }
  };

  const startEdit = (item) => {
    const formData = {};
    config.fields.forEach(f => { formData[f.key] = item[f.key] || ''; });
    setForm(formData);
    setEditingId(item.id);
    setShowForm(true);
  };

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
        <Button className="bg-[#3b82f6] text-white" onClick={() => { resetForm(); setShowForm(!showForm); }} data-testid="add-item-btn">
          <Plus size={16} className="mr-1" /> Ajouter
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6" data-testid="crud-form">
          <h3 className="text-sm font-bold text-gray-700 mb-3">{editingId ? 'Modifier' : 'Ajouter'}</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {config.fields.map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-500 block mb-1">{f.label}</label>
                <Input
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={form[f.key] || ''}
                  onChange={e => setForm({ ...form, [f.key]: f.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value })}
                  data-testid={`crud-field-${f.key}`}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <Button onClick={handleSave} className="bg-[#3b82f6] text-white" data-testid="crud-save-btn">{editingId ? 'Modifier' : 'Ajouter'}</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Annuler</Button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-5 max-w-md">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input placeholder="Rechercher..." className="pl-9" value={filter} onChange={e => setFilter(e.target.value)} />
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.map(item => (
          <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4" data-testid={`crud-item-${item.id}`}>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900">{item.name}</p>
              <p className="text-sm text-gray-500 mt-0.5">
                {config.fields.filter(f => f.key !== 'name').map(f => `${f.label}: ${item[f.key] || '-'}`).join(' | ')}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(item)} data-testid={`edit-${item.id}`}><PencilSimple size={14} /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => handleDelete(item.id)} data-testid={`delete-${item.id}`}><Trash size={14} /></Button>
            </div>
          </div>
        ))}
        {loading && <div className="text-center py-8 text-gray-400">Chargement...</div>}
        {!loading && filtered.length === 0 && <div className="text-center py-8 text-gray-400">Aucun element</div>}
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
export const AdminVehicleMakes = () => <AdminCrudPage pageKey="vehicle_makes" />;
export const AdminVehicleModels = () => <AdminCrudPage pageKey="vehicle_models" />;
export const AdminMasterServices = () => <AdminCrudPage pageKey="master_services" />;
export const AdminCancelReasons = () => <AdminCrudPage pageKey="cancel_reasons" />;
export const AdminEmailTemplates = () => <AdminCrudPage pageKey="email_templates" />;
export const AdminSmsTemplates = () => <AdminCrudPage pageKey="sms_templates" />;
export const AdminSosRequests = () => <AdminCrudPage pageKey="sos_requests" />;
export const AdminContactRequests = () => <AdminCrudPage pageKey="contact_requests" />;
export const AdminWithdrawRequests = () => <AdminCrudPage pageKey="withdraw_requests" />;
export const AdminOrderHelpRequests = () => <AdminCrudPage pageKey="order_help_requests" />;
export const AdminTripHelpRequests = () => <AdminCrudPage pageKey="trip_help_requests" />;
export const AdminPushNotifications = () => <AdminCrudPage pageKey="push_notifications" />;
export const AdminPayoutsCrud = () => <AdminCrudPage pageKey="payouts" />;
export const AdminSettlementsCrud = () => <AdminCrudPage pageKey="settlements" />;
export const AdminDisputesCrud = () => <AdminCrudPage pageKey="disputes" />;
export const AdminDocumentsCrud = () => <AdminCrudPage pageKey="documents" />;
export default AdminCrudPage;
