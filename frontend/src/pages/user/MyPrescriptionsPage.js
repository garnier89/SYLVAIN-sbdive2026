/**
 * MyPrescriptionsPage — Mes ordonnances (patient) /mes-ordonnances.
 * Liste les ordonnances électroniques reçues, téléchargement PDF et lien
 * « Commander en pharmacie » (note pré-remplie avec les médicaments).
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, CircleNotch, Prescription, DownloadSimple, Storefront, Pill, Stethoscope, TestTube,
} from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;
const MED = `${API}/api/medical`;

const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('fr-FR'); } catch { return ''; } };

const MyPrescriptionsPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${MED}/prescriptions`, { credentials: 'include' }).then(r => r.json())
      .then(d => { setItems(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const downloadPdf = async (id) => {
    try {
      const r = await fetch(`${MED}/prescriptions/${id}/pdf`, { credentials: 'include' });
      if (!r.ok) { toast.error('Téléchargement impossible'); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `ordonnance-${id.slice(-8)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { toast.error('Erreur réseau'); }
  };

  const orderInPharmacy = (rx) => {
    const note = `Ordonnance ${rx.id.slice(-8)} — ${rx.practitioner_name}\n` +
      (rx.medications || []).map(m => `• ${m.name}${m.dosage ? ` (${m.dosage})` : ''}${m.duration ? ` — ${m.duration}` : ''}`).join('\n');
    navigate(`/pharmacy/prescription?note=${encodeURIComponent(note)}`);
  };

  const reserveLab = (rx) => {
    const ids = (rx.analyses || []).map(a => a.id).join(',');
    navigate(`/analyses?analyses=${encodeURIComponent(ids)}`);
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-8" data-testid="my-prescriptions-page">
      <div className="bg-gradient-to-br from-teal-600 to-emerald-700 px-4 pt-4 pb-5 text-white">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/home')} className="text-white" data-testid="rx-back"><ArrowLeft size={22} /></button>
          <div className="flex-1"><h1 className="text-lg font-bold">Mes ordonnances</h1><p className="text-[11px] text-white/70">Ordonnances électroniques SB Santé</p></div>
          <Prescription size={26} weight="fill" className="text-white/80" />
        </div>
      </div>

      <div className="p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12"><CircleNotch size={28} className="text-teal-400 animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-10 text-center" data-testid="rx-empty">
            <Stethoscope size={40} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Aucune ordonnance pour l'instant.<br />Vos praticiens vous en délivreront ici après consultation.</p>
          </div>
        ) : items.map(rx => (
          <div key={rx.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`rx-${rx.id}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5"><Prescription size={18} weight="fill" className="text-teal-600" /><p className="font-bold text-gray-900 text-sm">{rx.practitioner_name}</p></div>
              <span className="text-[11px] text-gray-400">{fmtDate(rx.created_at)}</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{rx.specialty}{rx.diagnosis ? ` · ${rx.diagnosis}` : ''}</p>
            <div className="mt-2 space-y-1">
              {(rx.medications || []).map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-gray-700" data-testid={`rx-med-line-${i}`}>
                  <Pill size={14} className="text-teal-500 flex-shrink-0" weight="fill" />
                  <span className="font-semibold">{m.name}</span>
                  {m.dosage && <span className="text-gray-400 text-xs">· {m.dosage}</span>}
                  {m.duration && <span className="text-gray-400 text-xs">· {m.duration}</span>}
                </div>
              ))}
            </div>
            {(rx.analyses || []).length > 0 && (
              <div className="mt-2 space-y-1 border-t border-gray-100 pt-2" data-testid={`rx-analyses-${rx.id}`}>
                <p className="text-[10px] uppercase tracking-wide font-bold text-gray-400">Analyses prescrites</p>
                {(rx.analyses || []).map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-gray-700" data-testid={`rx-analysis-line-${i}`}>
                    <TestTube size={14} className="text-indigo-500 flex-shrink-0" weight="fill" />
                    <span className="font-semibold">{a.name}</span>
                  </div>
                ))}
              </div>
            )}
            {rx.notes && <p className="text-xs text-gray-400 mt-2 italic">{rx.notes}</p>}
            <div className="flex gap-2 mt-3">
              <button onClick={() => downloadPdf(rx.id)} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5" data-testid={`rx-pdf-${rx.id}`}><DownloadSimple size={15} /> PDF</button>
              {(rx.medications || []).length > 0 && <button onClick={() => orderInPharmacy(rx)} className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5" data-testid={`rx-order-${rx.id}`}><Storefront size={15} weight="fill" /> Pharmacie</button>}
              {(rx.analyses || []).length > 0 && <button onClick={() => reserveLab(rx)} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5" data-testid={`rx-lab-${rx.id}`}><TestTube size={15} weight="fill" /> Réserver au labo</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MyPrescriptionsPage;
