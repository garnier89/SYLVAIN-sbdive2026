import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import { MagnifyingGlass, ArrowsClockwise, X, Plus, Export, PencilSimple, Eye, Trash, ToggleLeft, ToggleRight, Wallet, CaretUp, CaretDown, PlusCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { CreditModal, DocumentsModal } from './users/AdminUserModals';

const AdminUsers = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState(new Set());
  const [bulkAction, setBulkAction] = useState('');
  const [creditTarget, setCreditTarget] = useState(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const [creditSaving, setCreditSaving] = useState(false);
  const [docsTarget, setDocsTarget] = useState(null);
  const [docsData, setDocsData] = useState(null);
  const [docsLoading, setDocsLoading] = useState(false);

  const openDocs = async (u) => {
    setDocsTarget(u);
    setDocsData(null);
    setDocsLoading(true);
    try {
      const r = await adminAPI.getUserDocuments(u.id);
      setDocsData(r.data);
    } catch (e) { toast.error('Erreur de chargement des documents'); }
    setDocsLoading(false);
  };

  const onAdminUploadDoc = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !docsTarget) return;
    if (file.size > 8 * 1024 * 1024) { toast.error('Fichier trop volumineux (max 8 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await adminAPI.uploadUserDocument(docsTarget.id, {
          type: 'other', label: file.name, file_url: reader.result, mime_type: file.type,
        });
        toast.success('Document ajouté');
        openDocs(docsTarget);
      } catch { toast.error('Erreur d\'upload'); }
    };
    reader.readAsDataURL(file);
  };

  const removeDoc = async (docId) => {
    if (!window.confirm('Supprimer ce document ?')) return;
    try {
      await adminAPI.deleteUserDocument(docsTarget.id, docId);
      toast.success('Document supprimé');
      openDocs(docsTarget);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminAPI.listUsers({ limit: 500 });
      setUsers(r.data.users || []);
    } catch (e) { console.error('[AdminUsers] load failed', e); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggleSort = (f) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('asc'); }
  };

  const resetFilters = () => { setSearch(''); setSearchField('all'); setStatusFilter(''); };

  let rows = users.slice();
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(u => {
      if (searchField === 'name') return (u.name || '').toLowerCase().includes(q);
      if (searchField === 'email') return (u.email || '').toLowerCase().includes(q);
      if (searchField === 'phone') return (u.phone || '').includes(q);
      return (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.phone || '').includes(q);
    });
  }
  if (statusFilter === 'active') rows = rows.filter(u => !u.is_suspended);
  if (statusFilter === 'suspended') rows = rows.filter(u => u.is_suspended);
  rows.sort((a, b) => {
    const va = (a[sortField] || ''); const vb = (b[sortField] || '');
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  };
  const toggleOne = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleSuspend = async (u) => {
    try {
      if (u.is_suspended) await adminAPI.unsuspendUser(u.id);
      else await adminAPI.suspendUser(u.id);
      toast.success('Statut mis à jour');
      load();
    } catch { toast.error('Erreur'); }
  };

  const remove = async (u) => {
    if (!window.confirm(`Supprimer l'utilisateur "${u.name || u.email}" ?`)) return;
    try {
      await adminAPI.deleteUser(u.id);
      toast.success('Utilisateur supprimé');
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
  };

  const saveCredit = async () => {
    const amt = parseFloat(creditAmount);
    if (isNaN(amt) || amt === 0) { toast.error('Montant requis (différent de 0)'); return; }
    setCreditSaving(true);
    try {
      const r = await adminAPI.creditUserWallet(creditTarget.id, amt, creditNote);
      toast.success(`Solde mis à jour : ${r.data.new_balance.toFixed(2)} €`);
      setCreditTarget(null); setCreditAmount(''); setCreditNote('');
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur'); }
    setCreditSaving(false);
  };

  const runBulk = async () => {
    if (!bulkAction || selected.size === 0) { toast.error('Sélectionnez des utilisateurs et une action'); return; }
    const ids = Array.from(selected);
    try {
      if (bulkAction === 'activate') {
        await Promise.all(ids.map(id => adminAPI.unsuspendUser(id)));
        toast.success(`${ids.length} activés`);
      } else if (bulkAction === 'suspend') {
        await Promise.all(ids.map(id => adminAPI.suspendUser(id)));
        toast.success(`${ids.length} suspendus`);
      } else if (bulkAction === 'delete') {
        if (!window.confirm(`Supprimer ${ids.length} utilisateurs ?`)) return;
        await Promise.all(ids.map(id => adminAPI.deleteUser(id)));
        toast.success(`${ids.length} supprimés`);
      }
      setSelected(new Set()); setBulkAction(''); load();
    } catch { toast.error('Erreur sur l\'action en masse'); }
  };

  const exportCsv = () => {
    const headers = ['Nom', 'Email', 'Inscription', 'Téléphone', 'Wallet', 'Statut'];
    const lines = [headers, ...rows.map(u => [
      u.name || '', u.email || '', u.created_at || '', u.phone || '',
      u.wallet_balance != null ? `${u.wallet_balance}` : '0',
      u.is_suspended ? 'Suspendu' : 'Actif',
    ])];
    const csv = lines.map(r => r.map(c => `"${(c || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `users_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()} (${days[d.getDay()]}) à ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const SortBtn = ({ field, label }) => (
    <button onClick={() => toggleSort(field)} className="inline-flex items-center gap-1 font-semibold text-gray-700" data-testid={`sort-${field}`}>
      {label}
      <span className="flex flex-col -space-y-0.5">
        <CaretUp size={8} className={sortField === field && sortDir === 'asc' ? 'text-gray-900' : 'text-gray-300'} />
        <CaretDown size={8} className={sortField === field && sortDir === 'desc' ? 'text-gray-900' : 'text-gray-300'} />
      </span>
    </button>
  );

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen" data-testid="admin-users-page">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Utilisateurs</h1>
        <p className="text-sm text-gray-500">Gérez les passagers et leur accès à la plateforme.</p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
          <select value={searchField} onChange={(e) => setSearchField(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" data-testid="filter-field">
            <option value="all">Tous</option>
            <option value="name">Nom</option>
            <option value="email">Email</option>
            <option value="phone">Téléphone</option>
          </select>
          <div className="relative">
            <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..." className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm" data-testid="filter-search" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" data-testid="filter-status">
            <option value="">Sélectionner le statut</option>
            <option value="active">Actif</option>
            <option value="suspended">Suspendu</option>
          </select>
          <div />
        </div>
        <div className="flex items-center justify-end gap-2 flex-wrap">
          <button className="w-9 h-9 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center" data-testid="filter-search-btn" title="Rechercher"><MagnifyingGlass size={16} /></button>
          <button onClick={resetFilters} className="w-9 h-9 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center" data-testid="filter-reset-btn" title="Réinitialiser"><X size={16} /></button>
          <button onClick={load} className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center" data-testid="filter-refresh" title="Rafraîchir"><ArrowsClockwise size={16} /></button>
          <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" data-testid="bulk-action">
            <option value="">Action groupée</option>
            <option value="activate">Activer</option>
            <option value="suspend">Suspendre</option>
            <option value="delete">Supprimer</option>
          </select>
          <button onClick={runBulk} className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold bg-white" data-testid="bulk-apply">Appliquer</button>
          <button onClick={exportCsv} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-semibold flex items-center gap-1.5 bg-white" data-testid="export-btn">
            <Export size={14} /> Exporter
          </button>
          <button onClick={() => navigate('/admin/users/new')} className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold flex items-center gap-1.5" data-testid="add-user-btn">
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-3 px-4 w-8"><input type="checkbox" checked={allSelected} onChange={toggleAll} data-testid="select-all" /></th>
              <th className="text-left py-3 px-4"><SortBtn field="name" label="Nom" /></th>
              <th className="text-left py-3 px-4"><SortBtn field="email" label="Email" /></th>
              <th className="text-left py-3 px-4"><SortBtn field="created_at" label="Inscription" /></th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Téléphone</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Wallet</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700">Documents</th>
              <th className="text-center py-3 px-4"><SortBtn field="is_suspended" label="Statut" /></th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50" data-testid={`user-row-${u.id}`}>
                <td className="py-3 px-4"><input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} data-testid={`select-user-${u.id}`} /></td>
                <td className="py-3 px-4">
                  <button onClick={() => navigate(`/admin/users/${u.id}`)} className="font-medium text-gray-900 underline hover:text-blue-600" data-testid={`user-name-${u.id}`}>
                    {u.name || (u.first_name && `${u.first_name} ${u.last_name || ''}`) || '—'}
                  </button>
                </td>
                <td className="py-3 px-4 text-gray-600">{u.email}</td>
                <td className="py-3 px-4 text-gray-600 text-xs">{fmtDate(u.created_at)}</td>
                <td className="py-3 px-4 text-gray-600">{u.phone || '—'}</td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center gap-1.5">
                    <Wallet size={14} className="text-emerald-500" />
                    <span className="text-gray-700">{(u.wallet_balance != null ? u.wallet_balance : 0).toFixed(2)} €</span>
                    <button onClick={() => { setCreditTarget(u); setCreditAmount(''); setCreditNote(''); }}
                      className="text-emerald-500 hover:text-emerald-700" title="Créditer l'utilisateur" data-testid={`credit-user-${u.id}`}>
                      <PlusCircle size={18} weight="fill" />
                    </button>
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  <button onClick={() => openDocs(u)} className="text-gray-400 hover:text-blue-600" data-testid={`view-docs-${u.id}`} title="Voir documents">
                    <Eye size={16} />
                  </button>
                </td>
                <td className="py-3 px-4 text-center">
                  <span className={`inline-block px-3 py-0.5 text-xs rounded-md font-semibold ${u.is_suspended ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`} data-testid={`user-status-${u.id}`}>
                    {u.is_suspended ? 'Suspendu' : 'Actif'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => navigate(`/admin/users/${u.id}`)} className="text-gray-500 hover:text-blue-600" data-testid={`edit-user-${u.id}`} title="Modifier"><PencilSimple size={16} /></button>
                    <button onClick={() => toggleSuspend(u)} className="text-gray-500 hover:text-emerald-600" data-testid={`toggle-user-${u.id}`} title={u.is_suspended ? 'Activer' : 'Suspendre'}>
                      {u.is_suspended ? <ToggleLeft size={18} /> : <ToggleRight size={18} />}
                    </button>
                    <button onClick={() => remove(u)} className="text-gray-500 hover:text-red-600" data-testid={`delete-user-${u.id}`} title="Supprimer"><Trash size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="p-8 text-center text-gray-400">Chargement...</div>}
        {!loading && rows.length === 0 && <div className="p-8 text-center text-gray-400">Aucun utilisateur</div>}
      </div>

      {/* Add Balance Modal */}
      <CreditModal
        target={creditTarget}
        amount={creditAmount} setAmount={setCreditAmount}
        note={creditNote} setNote={setCreditNote}
        saving={creditSaving}
        onClose={() => setCreditTarget(null)}
        onSave={saveCredit}
      />

      {/* Documents Modal */}
      <DocumentsModal
        target={docsTarget}
        data={docsData}
        loading={docsLoading}
        onClose={() => setDocsTarget(null)}
        onUpload={onAdminUploadDoc}
        onRemoveDoc={removeDoc}
      />
    </div>
  );
};

export default AdminUsers;
