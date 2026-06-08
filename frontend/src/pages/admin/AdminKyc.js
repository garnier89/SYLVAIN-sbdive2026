import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { ShieldCheck, Hourglass, XCircle, CheckCircle, IdentificationCard, House, User } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { kycAPI } from '../../services/api';

const TABS = [
  { key: 'pending', label: 'En attente' },
  { key: 'approved', label: 'Approuvés' },
  { key: 'rejected', label: 'Refusés' },
  { key: '', label: 'Tous' },
];

const AdminKyc = () => {
  const [tab, setTab] = useState('pending');
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);

  const load = async () => {
    try {
      const r = await kycAPI.adminList(tab);
      setItems(r.data?.items || []);
      setCounts(r.data?.counts || { pending: 0, approved: 0, rejected: 0 });
    } catch { toast.error('Erreur de chargement'); }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await kycAPI.adminList(tab);
        if (!alive) return;
        setItems(r.data?.items || []);
        setCounts(r.data?.counts || { pending: 0, approved: 0, rejected: 0 });
      } catch { if (alive) toast.error('Erreur de chargement'); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [tab]);

  const approve = async (id) => {
    try { await kycAPI.adminApprove(id); toast.success('Dossier approuvé'); load(); }
    catch { toast.error('Action impossible'); }
  };
  const reject = async (id) => {
    const reason = window.prompt('Motif du refus :', 'Documents illisibles');
    if (reason === null) return;
    try { await kycAPI.adminReject(id, reason); toast.success('Dossier refusé'); load(); }
    catch { toast.error('Action impossible'); }
  };

  const statusBadge = (s) => ({
    pending: <Badge className="bg-amber-100 text-amber-700"><Hourglass size={12} className="mr-1" />En attente</Badge>,
    approved: <Badge className="bg-green-100 text-green-700"><CheckCircle size={12} className="mr-1" />Approuvé</Badge>,
    rejected: <Badge className="bg-red-100 text-red-700"><XCircle size={12} className="mr-1" />Refusé</Badge>,
  }[s] || <Badge>{s}</Badge>);

  return (
    <div className="p-6" data-testid="admin-kyc">
      <h1 className="text-2xl font-bold text-gray-800 mb-1 flex items-center gap-2"><ShieldCheck size={26} weight="fill" className="text-emerald-600" /> Vérification vendeurs (KYC)</h1>
      <p className="text-sm text-gray-500 mb-5">Validez les pièces d’identité (CNI + justificatif de domicile) avant que les vendeurs puissent publier sur le Marketplace.</p>

      <div className="grid grid-cols-3 gap-3 mb-5 max-w-lg">
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-amber-600">{counts.pending}</p><p className="text-xs text-gray-500">En attente</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-green-600">{counts.approved}</p><p className="text-xs text-gray-500">Approuvés</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-red-500">{counts.rejected}</p><p className="text-xs text-gray-500">Refusés</p></CardContent></Card>
      </div>

      <div className="flex gap-2 mb-4">
        {TABS.map((tb) => (
          <button key={tb.key} onClick={() => setTab(tb.key)} className={`px-4 py-1.5 rounded-full text-sm font-semibold ${tab === tb.key ? 'bg-[#FF5000] text-white' : 'bg-gray-100 text-gray-600'}`} data-testid={`kyc-tab-${tb.key || 'all'}`}>{tb.label}</button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center" data-testid="kyc-empty">Aucun dossier.</p>
      ) : (
        <div className="space-y-3" data-testid="kyc-list">
          {items.map((k) => (
            <Card key={k.id} data-testid={`kyc-item-${k.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"><User size={18} className="text-gray-500" /></div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{k.full_name || k.user_name || '—'}</p>
                      <p className="text-xs text-gray-500">{k.user_email} · {k.role === 'driver' ? 'Chauffeur' : 'Client'}</p>
                    </div>
                  </div>
                  {statusBadge(k.status)}
                </div>
                {k.address && <p className="text-xs text-gray-500 mb-2">📍 {k.address}</p>}
                <div className="flex gap-2 mb-3">
                  {k.cni_url && <button onClick={() => setPreview({ url: k.cni_url, label: 'CNI' })} className="flex items-center gap-1 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg px-2 py-1" data-testid={`kyc-view-cni-${k.id}`}><IdentificationCard size={14} /> Voir CNI</button>}
                  {k.proof_url && <button onClick={() => setPreview({ url: k.proof_url, label: 'Justificatif de domicile' })} className="flex items-center gap-1 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg px-2 py-1" data-testid={`kyc-view-proof-${k.id}`}><House size={14} /> Voir justificatif</button>}
                </div>
                {k.reject_reason && <p className="text-xs text-red-500 mb-2">Motif refus : {k.reject_reason}</p>}
                {k.status !== 'approved' && (
                  <div className="flex gap-2">
                    <Button onClick={() => approve(k.id)} className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs" data-testid={`kyc-approve-${k.id}`}><CheckCircle size={14} className="mr-1" />Approuver</Button>
                    {k.status !== 'rejected' && <Button onClick={() => reject(k.id)} variant="outline" className="h-8 text-xs text-red-600 border-red-200" data-testid={`kyc-reject-${k.id}`}><XCircle size={14} className="mr-1" />Refuser</Button>}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[3000] bg-black/70 flex items-center justify-center p-4" onClick={() => setPreview(null)} data-testid="kyc-preview-modal">
          <div className="max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <p className="text-white text-sm font-semibold mb-2">{preview.label}</p>
            <img src={preview.url} alt={preview.label} className="w-full rounded-xl max-h-[75vh] object-contain bg-white" />
            <button onClick={() => setPreview(null)} className="mt-3 w-full bg-white/20 text-white rounded-lg py-2 text-sm" data-testid="kyc-preview-close">Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminKyc;
