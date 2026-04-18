import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { CalendarCheck, Plus, MagnifyingGlass, Car, MapPin, Clock, User } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  arriving: 'bg-indigo-100 text-indigo-800',
  in_progress: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const AdminManualBooking = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    pickup_address: '', dropoff_address: '',
    pickup_lat: 48.8566, pickup_lng: 2.3522,
    dropoff_lat: 48.8700, dropoff_lng: 2.3400,
    vehicle_type: 'sb', payment_method: 'cash',
    customer_phone: '', scheduled_at: '',
  });

  const loadBookings = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/rides?limit=50`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setBookings(Array.isArray(data) ? data : data.rides || []);
      }
    } catch (err) { console.error('Failed to load bookings:', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  const handleCreate = async () => {
    try {
      await fetch(`${API}/api/rides/estimate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          pickup_lat: form.pickup_lat, pickup_lng: form.pickup_lng,
          pickup_address: form.pickup_address || 'Paris',
          dropoff_lat: form.dropoff_lat, dropoff_lng: form.dropoff_lng,
          dropoff_address: form.dropoff_address || 'Destination',
          vehicle_type: form.vehicle_type, payment_method: form.payment_method,
        }),
      });
      setShowForm(false);
      loadBookings();
    } catch (err) { console.error('Create booking error:', err); }
  };

  return (
    <div className="p-6" data-testid="admin-manual-booking">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Manual Booking / Later Bookings</h1>
          <p className="text-sm text-gray-500 mt-1">{bookings.length} réservations</p>
        </div>
        <Button className="bg-[#3b82f6] text-white" onClick={() => setShowForm(!showForm)} data-testid="new-booking-btn">
          <Plus size={16} className="mr-1" /> Nouvelle réservation
        </Button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6" data-testid="booking-form">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Créer une réservation manuelle</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input placeholder="Adresse de départ" value={form.pickup_address} onChange={e => setForm({...form, pickup_address: e.target.value})} />
            <Input placeholder="Adresse d'arrivée" value={form.dropoff_address} onChange={e => setForm({...form, dropoff_address: e.target.value})} />
            <Input placeholder="Téléphone client" value={form.customer_phone} onChange={e => setForm({...form, customer_phone: e.target.value})} />
            <select value={form.vehicle_type} onChange={e => setForm({...form, vehicle_type: e.target.value})} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {['sb', 'confort', 'luxe', 'moto', 'pool', 'suv', 'electric', 'van', 'accessible', 'airport'].map(v => <option key={v} value={v}>{v.toUpperCase()}</option>)}
            </select>
            <select value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="cash">Espèces</option>
              <option value="card">Carte</option>
              <option value="wallet">Portefeuille</option>
            </select>
            <Input type="datetime-local" value={form.scheduled_at} onChange={e => setForm({...form, scheduled_at: e.target.value})} />
          </div>
          <div className="flex gap-2 mt-3">
            <Button onClick={handleCreate} className="bg-[#3b82f6] text-white" data-testid="create-booking-btn">Créer</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">ID</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Départ</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Arrivée</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Véhicule</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Statut</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-600">Tarif</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-600">Date</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map(b => (
              <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 font-mono text-xs text-blue-600">{b.id?.slice(-8)}</td>
                <td className="py-3 px-4 text-gray-700 max-w-[150px] truncate">{b.pickup_address || '-'}</td>
                <td className="py-3 px-4 text-gray-700 max-w-[150px] truncate">{b.dropoff_address || '-'}</td>
                <td className="py-3 px-4"><Badge variant="outline">{b.vehicle_type || 'sb'}</Badge></td>
                <td className="py-3 px-4">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[b.status] || 'bg-gray-100 text-gray-600'}`}>
                    {b.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-right font-medium">{(b.estimated_fare || 0).toFixed(2)}€</td>
                <td className="py-3 px-4 text-xs text-gray-500">{b.created_at ? new Date(b.created_at).toLocaleDateString('fr-FR') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="p-8 text-center text-gray-400">Chargement...</div>}
        {!loading && bookings.length === 0 && <div className="p-8 text-center text-gray-400">Aucune réservation</div>}
      </div>
    </div>
  );
};

export default AdminManualBooking;
