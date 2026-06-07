import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { CaretUp, CaretDown, Check, X, Eye, Gear, FileText, CheckCircle, XCircle, Clock, Upload } from '@phosphor-icons/react';
import { toast } from 'sonner';

const DOC_STATUS = {
  approved: { label: 'Approuvé', cls: 'bg-green-100 text-green-700', Icon: CheckCircle },
  pending: { label: 'En attente', cls: 'bg-amber-100 text-amber-700', Icon: Clock },
  pending_review: { label: 'En attente', cls: 'bg-amber-100 text-amber-700', Icon: Clock },
  rejected: { label: 'Refusé', cls: 'bg-red-100 text-red-700', Icon: XCircle },
  not_uploaded: { label: 'Non envoyé', cls: 'bg-gray-100 text-gray-500', Icon: Upload },
};

const DriverDocsModal = ({ driver, onClose, onChanged }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [rejectingInfo, setRejectingInfo] = useState(false);
  const [infoReason, setInfoReason] = useState('');

  const load = () => {
    adminAPI.getDriverDocuments(driver.id)
      .then((r) => setData(r.data))
      .catch(() => toast.error('Erreur de chargement'))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    let active = true;
    adminAPI.getDriverDocuments(driver.id)
      .then((r) => { if (active) setData(r.data); })
      .catch(() => { if (active) toast.error('Erreur de chargement'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [driver.id]);

  const setStatus = async (docKey, status, rsn = '') => {
    try {
      const r = await adminAPI.setDriverDocumentStatus(driver.id, docKey, status, rsn);
      setData((prev) => ({ ...prev, ...r.data }));
      setRejecting(null); setReason('');
      toast.success(status === 'approved' ? 'Document approuvé' : status === 'rejected' ? 'Document refusé' : 'Document remis en attente');
      if (onChanged) onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec');
    }
  };

  const setInfoStatus = async (status, rsn = '') => {
    try {
      const r = await adminAPI.setDriverInfoChangeStatus(driver.id, status, rsn);
      setData((prev) => ({ ...prev, pending_info: r.data.pending_info, company_name: r.data.company_name, license_number: r.data.license_number }));
      setRejectingInfo(false); setInfoReason('');
      toast.success(status === 'approved' ? 'Modification approuvée' : 'Modification refusée');
      if (onChanged) onChanged();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec');
    }
  };

  const docs = data?.documents || [];
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" data-testid="driver-docs-modal" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-100 flex items-start justify-between sticky top-0 bg-white">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-800 truncate">Documents — {data?.driver_name || driver.user?.name || 'Chauffeur'}</h2>
            <p className="text-xs text-gray-500 truncate">{data?.driver_email || driver.user?.email} · {data?.approved_count || 0}/{data?.required_count || 0} approuvés</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 shrink-0" data-testid="docs-modal-close"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          {data?.pending_info?.status === 'pending' && (
            <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-3" data-testid="admin-info-change">
              <p className="font-bold text-amber-800 text-sm flex items-center gap-1.5"><Clock size={14} weight="fill" />Modification d&apos;informations à valider</p>
              <div className="mt-2 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-500">Société</span>
                  <span className="text-gray-800 font-medium text-right">
                    <span className="line-through text-gray-400 mr-1">{data.pending_info.previous_company_name || '—'}</span>
                    → <span className="text-amber-700 font-semibold" data-testid="admin-info-new-company">{data.pending_info.company_name || '—'}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-gray-500">N° de licence</span>
                  <span className="text-gray-800 font-medium text-right">
                    <span className="line-through text-gray-400 mr-1">{data.pending_info.previous_license_number || '—'}</span>
                    → <span className="text-amber-700 font-semibold" data-testid="admin-info-new-license">{data.pending_info.license_number || '—'}</span>
                  </span>
                </div>
              </div>
              {rejectingInfo ? (
                <div className="mt-2 flex items-center gap-2">
                  <input value={infoReason} onChange={(e) => setInfoReason(e.target.value)} placeholder="Motif du refus" className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm outline-none focus:border-red-300" data-testid="admin-info-reason" />
                  <button onClick={() => setInfoStatus('rejected', infoReason)} className="text-xs font-bold bg-red-600 text-white px-2.5 py-1.5 rounded" data-testid="admin-info-confirm-reject">Confirmer</button>
                  <button onClick={() => { setRejectingInfo(false); setInfoReason(''); }} className="text-xs text-gray-500 px-1">Annuler</button>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => setInfoStatus('approved')} className="text-xs font-bold bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700" data-testid="admin-info-approve">Approuver</button>
                  <button onClick={() => setRejectingInfo(true)} className="text-xs font-bold text-red-600 border border-red-200 px-3 py-1.5 rounded hover:bg-red-50" data-testid="admin-info-reject">Refuser</button>
                </div>
              )}
            </div>
          )}
          {loading && <p className="text-center text-gray-400 py-6">Chargement…</p>}
          {!loading && docs.length === 0 && <p className="text-center text-gray-400 py-6">Aucun document requis / fourni.</p>}
          {!loading && docs.map((doc) => {
            const st = DOC_STATUS[doc.status] || DOC_STATUS.not_uploaded;
            const StIcon = st.Icon;
            const uploaded = doc.status !== 'not_uploaded';
            return (
              <div key={doc.key} className="border border-gray-200 rounded-xl p-3" data-testid={`admin-doc-${doc.key}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{doc.label} {doc.required && <span className="text-red-400">*</span>}</p>
                    {doc.uploaded_at && <p className="text-xs text-gray-400 truncate">{(doc.uploaded_at || '').split('T')[0]}{doc.filename ? ` · ${doc.filename}` : ''}</p>}
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded inline-flex items-center gap-1 shrink-0 ${st.cls}`} data-testid={`admin-doc-status-${doc.key}`}><StIcon size={12} weight="fill" />{st.label}</span>
                </div>
                {doc.status === 'rejected' && doc.reason && <p className="text-xs text-red-500 mt-1">Motif : {doc.reason}</p>}
                {uploaded && (rejecting === doc.key ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif du refus" className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm outline-none focus:border-red-300" data-testid={`admin-doc-reason-${doc.key}`} />
                    <button onClick={() => setStatus(doc.key, 'rejected', reason)} className="text-xs font-bold bg-red-600 text-white px-2.5 py-1.5 rounded" data-testid={`admin-doc-confirm-reject-${doc.key}`}>Confirmer</button>
                    <button onClick={() => { setRejecting(null); setReason(''); }} className="text-xs text-gray-500 px-1">Annuler</button>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    {doc.status !== 'approved' && <button onClick={() => setStatus(doc.key, 'approved')} className="text-xs font-bold bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700" data-testid={`admin-doc-approve-${doc.key}`}>Approuver</button>}
                    {doc.status !== 'rejected' && <button onClick={() => setRejecting(doc.key)} className="text-xs font-bold text-red-600 border border-red-200 px-3 py-1.5 rounded hover:bg-red-50" data-testid={`admin-doc-reject-${doc.key}`}>Refuser</button>}
                  </div>
                ))}
              </div>
            );
          })}
          {data?.all_required_approved && data?.driver_status !== 'approved' && (
            <p className="text-xs text-green-600 text-center pt-1" data-testid="docs-all-approved-hint">✓ Tous les documents requis sont approuvés — vous pouvez approuver le chauffeur.</p>
          )}
        </div>
      </div>
    </div>
  );
};

const SortIcon = ({ field, sortField, sortDir, onSort }) => (
  <span className="inline-flex flex-col ml-1 cursor-pointer" onClick={() => onSort(field)}>
    <CaretUp size={8} className={sortField === field && sortDir === 'asc' ? 'text-gray-800' : 'text-gray-300'} />
    <CaretDown size={8} className={sortField === field && sortDir === 'desc' ? 'text-gray-800' : 'text-gray-300'} />
  </span>
);

const AdminDrivers = () => {
  const [drivers, setDrivers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [docDriver, setDocDriver] = useState(null);

  useEffect(() => {
    let active = true;
    adminAPI.listDrivers({})
      .then((r) => { if (active) { setDrivers(r.data.drivers); setTotal(r.data.total); } })
      .catch((e) => console.error(e))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const loadDrivers = async () => {
    try {
      const r = await adminAPI.listDrivers({});
      setDrivers(r.data.drivers); setTotal(r.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const approveDriver = async (id) => {
    try { await adminAPI.approveDriver(id); loadDrivers(); } catch (e) { console.error(e); }
  };

  const rejectDriver = async (id) => {
    try { await adminAPI.rejectDriver(id, 'Documents not valid'); loadDrivers(); } catch (e) { console.error(e); }
  };

  const handleReset = () => { setSearch(''); setStatusFilter(''); };

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  let filtered = drivers;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(d => (d.user?.name || '').toLowerCase().includes(q) || (d.user?.email || '').toLowerCase().includes(q));
  }
  if (statusFilter) filtered = filtered.filter(d => d.status === statusFilter);

  return (
    <div className="p-6" data-testid="admin-drivers-page">
      <h1 className="text-3xl font-light text-gray-800 mb-1" style={{ fontFamily: 'Georgia, Times, serif' }}>Drivers / Service Providers</h1>
      <hr className="border-gray-200 mb-5" />

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <span className="font-bold text-gray-700 text-sm">Search:</span>
        <select className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none">
          <option>All</option>
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder=""
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-48 outline-none focus:border-blue-400" data-testid="search-input" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-600 outline-none" data-testid="status-filter">
          <option value="">Select Status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button className="border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="search-btn">SEARCH</button>
        <button onClick={handleReset} className="border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="reset-btn">RESET</button>
        <button className="ml-auto border border-gray-300 rounded px-4 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50" data-testid="export-btn">EXPORT</button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" data-testid="drivers-table">
              <thead>
                <tr className="border-t border-b border-gray-200 bg-white">
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700"><input type="checkbox" className="rounded border-gray-300" /></th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort('name')}>
                    Service Provider <SortIcon field="name" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  </th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Contact</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Vehicle</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">License</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700 cursor-pointer" onClick={() => toggleSort('rating')}>
                    Rating <SortIcon field="rating" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                  </th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Trips</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Status</th>
                  <th className="text-left py-3 px-3 text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-400">No drivers found</td></tr>
                ) : filtered.map((d, i) => {
                  const pendingDocs = (d.documents || []).filter((x) => (x.status || 'pending') === 'pending').length;
                  return (
                  <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors" data-testid={`driver-row-${i}`}>
                    <td className="py-3 px-3"><input type="checkbox" className="rounded border-gray-300" /></td>
                    <td className="py-3 px-3">
                      <span className="text-sm text-blue-600 hover:underline cursor-pointer font-medium">{d.user?.name || 'Unknown'}</span>
                    </td>
                    <td className="py-3 px-3 text-sm text-gray-600">{d.user?.email || '-'}</td>
                    <td className="py-3 px-3">
                      <div>
                        <p className="text-sm text-gray-700 capitalize">{d.vehicle_type || '-'}</p>
                        <p className="text-xs text-gray-400">{d.vehicle_number || ''}</p>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-sm text-gray-600 font-mono">{d.license_number || '-'}</td>
                    <td className="py-3 px-3 text-sm text-gray-700 font-medium">{(d.rating || 0).toFixed(1)}</td>
                    <td className="py-3 px-3 text-sm text-gray-700">{d.total_trips || 0}</td>
                    <td className="py-3 px-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        d.status === 'approved' ? 'bg-green-100 text-green-700' :
                        d.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>{d.status}</span>
                      {pendingDocs > 0 && (
                        <button onClick={() => setDocDriver(d)} className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 hover:bg-orange-200" data-testid={`docs-badge-${i}`} title="Documents à valider">{pendingDocs} à valider</button>
                      )}
                      {d.pending_info?.status === 'pending' && (
                        <button onClick={() => setDocDriver(d)} className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 hover:bg-purple-200" data-testid={`info-badge-${i}`} title="Modification d'infos à valider">Infos à valider</button>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1">
                        {d.status === 'pending' && (
                          <>
                            <button onClick={() => approveDriver(d.id)} className="w-7 h-7 rounded bg-green-50 hover:bg-green-100 flex items-center justify-center text-green-600 transition-colors" data-testid={`approve-${i}`} title="Approve">
                              <Check size={14} weight="bold" />
                            </button>
                            <button onClick={() => rejectDriver(d.id)} className="w-7 h-7 rounded bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 transition-colors" data-testid={`reject-${i}`} title="Reject">
                              <X size={14} weight="bold" />
                            </button>
                          </>
                        )}
                        <button onClick={() => setDocDriver(d)} className="w-7 h-7 rounded bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-blue-500 transition-colors" data-testid={`docs-${i}`} title="Documents">
                          <FileText size={14} />
                        </button>
                        <button className="w-7 h-7 rounded bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 transition-colors" data-testid={`view-${i}`} title="View Details">
                          <Gear size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-gray-500 mt-4" data-testid="pagination-info">Showing 1 to {filtered.length} of {total} entries</p>
        </>
      )}
      {docDriver && <DriverDocsModal driver={docDriver} onClose={() => setDocDriver(null)} onChanged={loadDrivers} />}
    </div>
  );
};

export default AdminDrivers;
