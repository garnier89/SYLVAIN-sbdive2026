import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { MagnifyingGlass, CheckCircle, Clock, XCircle, Eye } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;
const CRUD = `${API}/api/admin/crud/documents`;

const statusConfig = {
  approved: { label: 'Approuvé', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  pending: { label: 'En attente', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  rejected: { label: 'Refusé', color: 'bg-red-100 text-red-700', icon: XCircle },
  expired: { label: 'Expiré', color: 'bg-gray-100 text-gray-500', icon: XCircle },
};

const AdminDocuments = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => { load(); }, []);
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(CRUD, { credentials: 'include' });
      setDocuments(await r.json() || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const updateStatus = async (doc, newStatus) => {
    try {
      const updated = { ...doc, status: newStatus };
      await fetch(`${CRUD}/${doc.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(updated),
      });
      setDocuments(prev => prev.map(d => d.id === doc.id ? updated : d));
      toast.success(newStatus === 'approved' ? 'Document approuvé' : 'Document refusé');
    } catch (e) { console.error(e); toast.error('Erreur'); }
  };

  const filtered = documents.filter(d => {
    const matchText = (d.driver_name || '').toLowerCase().includes(filter.toLowerCase()) ||
                      (d.doc_type || '').toLowerCase().includes(filter.toLowerCase());
    const matchStatus = !statusFilter || d.status === statusFilter;
    return matchText && matchStatus;
  });

  const pendingCount = documents.filter(d => d.status === 'pending').length;

  return (
    <div className="p-6" data-testid="admin-documents">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Vérification des documents</h1>
          <p className="text-sm text-gray-500 mt-1">{pendingCount} document(s) en attente de vérification</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Rechercher par nom ou type..." className="pl-9" value={filter} onChange={e => setFilter(e.target.value)} data-testid="doc-search" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" data-testid="doc-status-filter">
          <option value="">Tous les statuts</option>
          {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Chauffeur</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Type de document</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Date envoi</th>
                <th className="text-left py-3 px-4 font-semibold text-gray-600">Expiration</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-600">Statut</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(doc => {
                const st = statusConfig[doc.status] || statusConfig.pending;
                return (
                  <tr key={doc.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`doc-row-${doc.id}`}>
                    <td className="py-3 px-4 font-medium text-gray-800">{doc.driver_name}</td>
                    <td className="py-3 px-4 text-gray-600">{doc.doc_type}</td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{doc.uploaded_at}</td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{doc.expires_at || '-'}</td>
                    <td className="py-3 px-4 text-center"><Badge className={st.color}>{st.label}</Badge></td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {doc.status === 'pending' && (
                          <>
                            <Button size="sm" className="bg-green-600 text-white text-xs h-7" onClick={() => updateStatus(doc, 'approved')} data-testid={`approve-${doc.id}`}>Approuver</Button>
                            <Button size="sm" variant="outline" className="text-red-600 border-red-200 text-xs h-7" onClick={() => updateStatus(doc, 'rejected')} data-testid={`reject-${doc.id}`}>Refuser</Button>
                          </>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7"><Eye size={14} /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">Aucun document</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminDocuments;
