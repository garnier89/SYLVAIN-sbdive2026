import React, { useState, useEffect, useCallback } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FileText, MagnifyingGlass, CheckCircle, Clock, XCircle, Eye, Download } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const statusConfig = {
  approved: { label: 'Approuve', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  pending: { label: 'En attente', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  rejected: { label: 'Refuse', color: 'bg-red-100 text-red-700', icon: XCircle },
  expired: { label: 'Expire', color: 'bg-gray-100 text-gray-500', icon: XCircle },
};

const docTypes = [
  'Permis de conduire', 'Carte VTC', 'Assurance vehicule', 'Carte grise',
  'Certificat medical', 'Casier judiciaire', 'Photo identite', 'RIB bancaire',
];

const AdminDocuments = () => {
  const [documents, setDocuments] = useState([
    { id: 'd1', driver_name: 'Jean Dupont', driver_id: 'drv_001', doc_type: 'Carte VTC', status: 'pending', uploaded_at: '2026-04-17', expires_at: '2027-04-17' },
    { id: 'd2', driver_name: 'Amadou Diallo', driver_id: 'drv_002', doc_type: 'Permis de conduire', status: 'approved', uploaded_at: '2026-03-10', expires_at: '2031-03-10' },
    { id: 'd3', driver_name: 'Sophie Martin', driver_id: 'drv_003', doc_type: 'Assurance vehicule', status: 'pending', uploaded_at: '2026-04-15', expires_at: '2027-04-15' },
    { id: 'd4', driver_name: 'Mohamed Ben Ali', driver_id: 'drv_004', doc_type: 'Certificat medical', status: 'rejected', uploaded_at: '2026-04-01', expires_at: null },
    { id: 'd5', driver_name: 'Claire Petit', driver_id: 'drv_005', doc_type: 'Carte grise', status: 'approved', uploaded_at: '2026-02-20', expires_at: '2028-02-20' },
  ]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const updateStatus = (id, newStatus) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, status: newStatus } : d));
  };

  const filtered = documents.filter(d => {
    const matchText = (d.driver_name || '').toLowerCase().includes(filter.toLowerCase()) || (d.doc_type || '').toLowerCase().includes(filter.toLowerCase());
    const matchStatus = !statusFilter || d.status === statusFilter;
    return matchText && matchStatus;
  });

  const pendingCount = documents.filter(d => d.status === 'pending').length;

  return (
    <div className="p-6" data-testid="admin-documents">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Document Verification</h1>
          <p className="text-sm text-gray-500 mt-1">{pendingCount} document(s) en attente de verification</p>
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
                          <Button size="sm" className="bg-green-600 text-white text-xs h-7" onClick={() => updateStatus(doc.id, 'approved')}>Approuver</Button>
                          <Button size="sm" variant="outline" className="text-red-600 border-red-200 text-xs h-7" onClick={() => updateStatus(doc.id, 'rejected')}>Refuser</Button>
                        </>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7"><Eye size={14} /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-8 text-center text-gray-400">Aucun document</div>}
      </div>
    </div>
  );
};

export default AdminDocuments;
