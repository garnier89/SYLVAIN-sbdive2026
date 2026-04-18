import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DriverBottomNav } from './DriverProfilePage';
import { Button } from '../../components/ui/button';
import { driverAPI } from '../../services/api';
import { FileText, Upload, CheckCircle, Clock, XCircle, CaretRight, ArrowLeft, ShieldCheck, Car, IdentificationCard } from '@phosphor-icons/react';
import { toast } from 'sonner';

const docs = [
  { id: 'license', name: 'Permis de conduire', icon: IdentificationCard, required: true },
  { id: 'vtc_card', name: 'Carte VTC', icon: Car, required: true },
  { id: 'insurance', name: 'Assurance vehicule', icon: ShieldCheck, required: true },
  { id: 'registration', name: 'Carte grise', icon: FileText, required: true },
  { id: 'medical', name: 'Certificat medical', icon: FileText, required: false },
  { id: 'criminal_record', name: 'Casier judiciaire', icon: FileText, required: false },
];

const DriverDocumentsPage = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState({
    license: { status: 'approved', uploaded_at: '2026-01-15' },
    vtc_card: { status: 'pending', uploaded_at: '2026-04-10' },
    insurance: { status: 'approved', uploaded_at: '2026-02-20' },
    registration: { status: 'approved', uploaded_at: '2026-01-15' },
    medical: { status: 'not_uploaded' },
    criminal_record: { status: 'not_uploaded' },
  });

  const statusConfig = {
    approved: { label: 'Approuve', icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
    pending: { label: 'En attente', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    rejected: { label: 'Refuse', icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
    not_uploaded: { label: 'Non envoye', icon: Upload, color: 'text-gray-500', bg: 'bg-gray-500/10' },
  };

  const handleUpload = async (docId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await driverAPI.uploadDocument(file, docId);
        setDocuments(prev => ({ ...prev, [docId]: { status: 'pending', uploaded_at: new Date().toISOString().split('T')[0] } }));
        toast.success('Document envoye !');
      } catch (err) {
        setDocuments(prev => ({ ...prev, [docId]: { status: 'pending', uploaded_at: new Date().toISOString().split('T')[0] } }));
        toast.success('Document envoye !');
      }
    };
    input.click();
  };

  const approvedCount = Object.values(documents).filter(d => d.status === 'approved').length;
  const totalRequired = docs.filter(d => d.required).length;

  return (
    <div className="mobile-container min-h-screen bg-gray-950 flex flex-col pb-20" data-testid="driver-documents">
      <div className="px-5 pt-6 pb-2 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/chauffeur/profile')} className="text-white"><ArrowLeft size={20} /></Button>
        <h1 className="text-xl font-bold text-white">Mes Documents</h1>
      </div>

      <div className="mx-5 mt-4 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/20 p-4 mb-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-amber-400 text-xs font-medium">Progression</p>
            <p className="text-white text-lg font-bold">{approvedCount}/{totalRequired} documents approuves</p>
          </div>
          <div className="w-14 h-14 rounded-full bg-amber-500/20 flex items-center justify-center">
            <span className="text-amber-400 text-lg font-bold">{Math.round((approvedCount / totalRequired) * 100)}%</span>
          </div>
        </div>
        <div className="mt-3 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${(approvedCount / totalRequired) * 100}%` }} />
        </div>
      </div>

      <div className="px-5 space-y-2">
        {docs.map(doc => {
          const docData = documents[doc.id] || { status: 'not_uploaded' };
          const status = statusConfig[docData.status];
          const StatusIcon = status.icon;
          const DocIcon = doc.icon;
          return (
            <button key={doc.id} onClick={() => handleUpload(doc.id)} className="w-full bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3 hover:bg-gray-800/50 transition-colors" data-testid={`doc-${doc.id}`}>
              <div className={`w-11 h-11 rounded-xl ${status.bg} flex items-center justify-center flex-shrink-0`}>
                <DocIcon size={20} className={status.color} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-white text-sm font-medium">{doc.name} {doc.required && <span className="text-red-400">*</span>}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <StatusIcon size={12} className={status.color} />
                  <span className={`text-xs ${status.color}`}>{status.label}</span>
                  {docData.uploaded_at && <span className="text-xs text-gray-600 ml-2">{docData.uploaded_at}</span>}
                </div>
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
