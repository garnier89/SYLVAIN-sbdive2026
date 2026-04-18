import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Star, Crown, User, Phone, MagnifyingGlass, CheckCircle, XCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminPriorityDrivers = () => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | priority | no-priority
  const [notes, setNotes] = useState({}); // driver_id -> note input

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/priority-drivers`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setDrivers(data);
    } catch (err) { toast.error('Erreur chargement chauffeurs'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const togglePriority = async (driver) => {
    const newVal = !driver.manual_priority;
    try {
      const res = await fetch(`${API}/api/admin/priority-drivers/${driver.driver_id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ manual_priority: newVal, note: notes[driver.driver_id] || driver.manual_priority_note || '' }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(newVal ? 'Chauffeur ajoute en priorite' : 'Priorite retiree');
      await load();
    } catch (err) { toast.error('Erreur'); }
  };

  const filtered = drivers.filter(d => {
    const matchesSearch = !search || d.name.toLowerCase().includes(search.toLowerCase()) || d.email.toLowerCase().includes(search.toLowerCase()) || (d.phone || '').includes(search);
    const matchesFilter = filter === 'all' || (filter === 'priority' && d.has_priority) || (filter === 'no-priority' && !d.has_priority);
    return matchesSearch && matchesFilter;
  });

  const priorityCount = drivers.filter(d => d.manual_priority).length;
  const autoPriorityCount = drivers.filter(d => !d.manual_priority && d.has_priority).length;

  return (
    <div className="p-6" data-testid="admin-priority-drivers">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Crown size={28} className="text-amber-500" weight="fill" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Chauffeurs Prioritaires</h1>
            <p className="text-xs text-gray-500">Gerez manuellement les chauffeurs qui auront la priorite sur les courses</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="p-4">
          <p className="text-xs text-gray-500">Total chauffeurs</p>
          <p className="text-2xl font-bold text-gray-800" data-testid="stat-total">{drivers.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-gray-500">Priorite manuelle</p>
          <p className="text-2xl font-bold text-amber-600" data-testid="stat-manual">{priorityCount}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-gray-500">Priorite auto (points)</p>
          <p className="text-2xl font-bold text-green-600" data-testid="stat-auto">{autoPriorityCount}</p>
        </CardContent></Card>
      </div>

      {/* Search + filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Rechercher nom, email, telephone..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" data-testid="search-input" />
        </div>
        {[{ id: 'all', label: 'Tous' }, { id: 'priority', label: 'Avec priorite' }, { id: 'no-priority', label: 'Sans priorite' }].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === f.id ? 'bg-[#3b82f6] text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
            data-testid={`filter-${f.id}`}>{f.label}</button>
        ))}
      </div>

      {/* Drivers list */}
      {loading ? (
        <div className="p-8 text-center text-gray-500">Chargement...</div>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-sm">Chauffeurs ({filtered.length})</CardTitle></CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">Aucun chauffeur trouve</p>
            ) : (
              <div className="space-y-2">
                {filtered.map(d => (
                  <div key={d.driver_id} className="border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition-colors" data-testid={`driver-row-${d.driver_id}`}>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                        style={{ background: d.palette_color || '#9CA3AF' }}>
                        <User size={22} weight="fill" />
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-800">{d.name}</p>
                          {d.manual_priority && <Badge className="bg-amber-100 text-amber-700 text-[10px]"><Crown size={10} weight="fill" className="mr-1" />PRIORITE MANUELLE</Badge>}
                          {!d.manual_priority && d.has_priority && <Badge className="bg-green-100 text-green-700 text-[10px]">PRIORITE AUTO</Badge>}
                          <Badge className="text-[10px]" style={{ backgroundColor: (d.palette_color || '#9CA3AF') + '20', color: d.palette_color || '#9CA3AF' }}>{d.palette_name}</Badge>
                          {d.is_online && <Badge className="bg-green-500 text-white text-[10px]">EN LIGNE</Badge>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                          <span>{d.email}</span>
                          {d.phone && <span className="flex items-center gap-1"><Phone size={12} />{d.phone}</span>}
                          <span>{d.vehicle_type}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-xs text-gray-500">Points</p>
                          <p className="font-bold text-gray-800">{d.points}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">Courses</p>
                          <p className="font-bold text-gray-800">{d.total_trips}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">Acceptation</p>
                          <p className="font-bold text-green-600">{d.acceptance_rate}%</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-gray-500">Note</p>
                          <p className="font-bold text-amber-600 flex items-center gap-1"><Star size={12} weight="fill" />{d.rating?.toFixed(1)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      <Input
                        placeholder="Note (ex: VIP, partenaire...)"
                        value={notes[d.driver_id] !== undefined ? notes[d.driver_id] : d.manual_priority_note || ''}
                        onChange={e => setNotes(n => ({ ...n, [d.driver_id]: e.target.value }))}
                        className="flex-1 h-9 text-sm"
                        data-testid={`note-${d.driver_id}`}
                      />
                      <Button onClick={() => togglePriority(d)}
                        className={d.manual_priority ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}
                        data-testid={`toggle-priority-${d.driver_id}`}>
                        {d.manual_priority ? <><XCircle size={16} className="mr-1" />Retirer priorite</> : <><CheckCircle size={16} className="mr-1" />Ajouter en priorite</>}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdminPriorityDrivers;
