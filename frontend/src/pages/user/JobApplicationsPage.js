import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Phone } from '@phosphor-icons/react';
import { jobsAPI } from '../../services/api';

const JobApplicationsPage = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    jobsAPI.applications(jobId)
      .then((r) => { if (alive) setItems(r.data || []); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [jobId]);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="job-applications-page">
      <div className="bg-gradient-to-br from-[#0B1426] to-[#1E3A8A] px-4 pt-5 pb-6 rounded-b-3xl">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <h1 className="text-lg font-bold text-white flex-1">Candidatures reçues</h1>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-blue-200 border-t-[#1E3A8A] rounded-full animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="px-4 mt-10 text-center text-gray-500" data-testid="job-applications-empty">
          <User size={40} className="mx-auto mb-3 text-gray-300" weight="duotone" />
          <p className="text-sm">Aucune candidature reçue pour le moment</p>
        </div>
      ) : (
        <div className="px-4 mt-4 space-y-3">
          {items.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl p-3 shadow-sm" data-testid={`application-row-${a.id}`}>
              <p className="font-bold text-sm text-gray-900">{a.applicant_name}</p>
              {a.message && <p className="text-[12px] text-gray-600 mt-1">{a.message}</p>}
              {a.contact_phone && (
                <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-1.5"><Phone size={12} /> {a.contact_phone}</p>
              )}
              <p className="text-[10px] text-gray-400 mt-1.5">Reçue le {new Date(a.created_at).toLocaleDateString('fr-FR')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default JobApplicationsPage;
