import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DriverBottomNav } from './DriverProfilePage';
import { Button } from '../../components/ui/button';
import { driverAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import { FileText, Upload, CheckCircle, Clock, XCircle, CaretRight, ArrowLeft, ShieldCheck, Car, IdentificationCard } from '@phosphor-icons/react';
import { toast } from 'sonner';

const statusConfig = {
  approved: { label: 'Approuvé', icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
  pending: { label: 'En attente de validation', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  pending_review: { label: 'En attente de validation', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  rejected: { label: 'Refusé', icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
  not_uploaded: { label: 'Non envoyé', icon: Upload, color: 'text-gray-500', bg: 'bg-gray-500/10' },
};

const iconFor = (key) => {
  const k = (key || '').toLowerCase();
  if (k.includes('permis') || k.includes('identite') || k.includes('piece')) return IdentificationCard;
  if (k.includes('vtc') || k.includes('taxi') || k.includes('grise') || k.includes('macaron')) return Car;
  if (k.includes('assurance')) return ShieldCheck;
  return FileText;
};

const DriverDocumentsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { on } = useWebSocket(user?.id);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Manual refresh (used after an upload) — not called from the effect.
  const load = () => {
    driverAPI.getMyDocuments()
      .then((r) => setData(r.data))
      .catch(() => toast.error('Erreur de chargement des documents'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    driverAPI.getMyDocuments()
      .then((r) => { if (active) setData(r.data); })
      .catch(() => { if (active) toast.error('Erreur de chargement des documents'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Real-time alert when an admin approves/rejects one of the driver's documents.
  useEffect(() => {
    const off = on('driver_document_reviewed', (msg) => {
      if (msg?.status === 'approved') toast.success(msg.body || 'Document validé ✅', { duration: 6000 });
      else if (msg?.status === 'rejected') toast.error(msg.body || 'Document refusé', { duration: 8000 });
      else toast.info(msg?.body || 'Document mis à jour');
      driverAPI.getMyDocuments().then((r) => setData(r.data)).catch(() => {});
    });
    return off;
  }, [on]);

  const handleUpload = (docKey) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await driverAPI.uploadDocument(file, docKey);
        toast.success('Document envoyé ! En attente de validation.');
        load();
      } catch {
        toast.error("Échec de l'envoi du document");
      }
    };
    input.click();
  };

  const documents = data?.documents || [];
  const requiredCount = data?.required_count || documents.filter((d) => d.required).length || 1;
  const approvedCount = data?.approved_count || 0;
  const pct = Math.min(100, Math.round((approvedCount / requiredCount) * 100));
  const ds = data?.driver_status;

  return (
    <div className="mobile-container min-h-screen bg-gray-950 flex flex-col pb-20" data-testid="driver-documents">
      <div className="px-5 pt-6 pb-2 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/chauffeur/profile')} className="text-white"><ArrowLeft size={20} /></Button>
        <h1 className="text-xl font-bold text-white">Mes Documents</h1>
      </div>

      {ds === 'approved' && (
        <div className="mx-5 mt-3 rounded-xl bg-green-500/10 border border-green-500/20 p-3 flex items-center gap-2" data-testid="driver-status-banner">
          <CheckCircle size={18} className="text-green-500" weight="fill" />
          <p className="text-green-400 text-sm font-medium">Compte validé — vous pouvez recevoir des courses.</p>
        </div>
      )}
      {ds === 'rejected' && (
        <div className="mx-5 mt-3 rounded-xl bg-red-500/10 border border-red-500/20 p-3" data-testid="driver-status-banner">
          <div className="flex items-center gap-2"><XCircle size={18} className="text-red-500" weight="fill" /><p className="text-red-400 text-sm font-medium">Compte refusé</p></div>
          {data?.rejection_reason && <p className="text-red-300/80 text-xs mt-1">{data.rejection_reason}</p>}
        </div>
      )}
      {ds === 'pending' && (
        <div className="mx-5 mt-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 flex items-center gap-2" data-testid="driver-status-banner">
          <Clock size={18} className="text-amber-500" weight="fill" />
          <p className="text-amber-400 text-sm font-medium">Compte en cours de vérification.</p>
        </div>
      )}

      <div className="mx-5 mt-3 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20 p-4 mb-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-amber-400 text-xs font-medium">Progression</p>
            <p className="text-white text-lg font-bold" data-testid="docs-progress">{approvedCount}/{requiredCount} documents approuvés</p>
          </div>
          <div className="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center">
            <span className="text-amber-400 text-lg font-bold">{pct}%</span>
          </div>
        </div>
        <div className="mt-3 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="px-5 space-y-2">
        {loading && <p className="text-gray-500 text-center py-10 text-sm">Chargement…</p>}
        {!loading && documents.length === 0 && (
          <p className="text-gray-500 text-center py-10 text-sm">Aucun document requis pour votre catégorie.</p>
        )}
        {!loading && documents.map((doc) => {
          const status = statusConfig[doc.status] || statusConfig.not_uploaded;
          const StatusIcon = status.icon;
          const DocIcon = iconFor(doc.key);
          return (
            <button key={doc.key} onClick={() => handleUpload(doc.key)} className="w-full bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3 hover:bg-gray-800/50 transition-colors" data-testid={`doc-${doc.key}`}>
              <div className={`w-11 h-11 rounded-xl ${status.bg} flex items-center justify-center flex-shrink-0`}>
                <DocIcon size={20} className={status.color} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-white text-sm font-medium">{doc.label} {doc.required && <span className="text-red-400">*</span>}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <StatusIcon size={12} className={status.color} />
                  <span className={`text-xs ${status.color}`} data-testid={`doc-status-${doc.key}`}>{status.label}</span>
                  {doc.uploaded_at && <span className="text-xs text-gray-600 ml-2">{(doc.uploaded_at || '').split('T')[0]}</span>}
                </div>
                {doc.status === 'rejected' && doc.reason && <p className="text-red-400/70 text-xs mt-1">Motif : {doc.reason}</p>}
              </div>
              <CaretRight size={16} className="text-gray-600 flex-shrink-0" />
            </button>
          );
        })}
      </div>
      <DriverBottomNav />
    </div>
  );
};

export default DriverDocumentsPage;
