import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ClipboardText } from '@phosphor-icons/react';
import { jobsAPI } from '../../services/api';

const MyJobApplicationsPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    jobsAPI.myApplications()
      .then((r) => { if (alive) setItems(r.data || []); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="my-job-applications-page">
      <div className="bg-gradient-to-br from-[#0B1426] to-[#1E3A8A] px-4 pt-5 pb-6 rounded-b-3xl">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <h1 className="text-lg font-bold text-white flex-1">Mes candidatures</h1>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-blue-200 border-t-[#1E3A8A] rounded-full animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="px-4 mt-10 text-center text-gray-500" data-testid="applications-empty">
          <ClipboardText size={40} className="mx-auto mb-3 text-gray-300" weight="duotone" />
          <p className="text-sm">Vous n'avez pas encore postulé</p>
        </div>
      ) : (
        <div className="px-4 mt-4 space-y-3">
          {items.map((a) => (
            <button key={a.id} onClick={() => navigate(`/emploi/${a.job_id}`)} className="w-full text-left bg-white rounded-2xl p-3 shadow-sm" data-testid={`application-${a.id}`}>
              <p className="font-bold text-sm text-gray-900">{a.job_title}</p>
              <p className="text-[11px] text-gray-400 mt-1">Envoyée le {new Date(a.created_at).toLocaleDateString('fr-FR')}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyJobApplicationsPage;
