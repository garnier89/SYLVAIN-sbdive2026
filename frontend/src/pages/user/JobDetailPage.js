import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Briefcase, MapPin, EnvelopeSimple, Phone, PaperPlaneTilt } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { jobsAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const typeLabel = (key) => ({
  cdi: 'CDI', cdd: 'CDD', interim: 'Intérim', saisonnier: 'Saisonnier', stage: 'Stage', freelance: 'Freelance',
}[key] || key);

const fmtSalary = (job) => {
  if (!job.salary_min && !job.salary_max) return null;
  const period = { heure: '/h', jour: '/j', mois: '/mois', an: '/an' }[job.salary_period] || '';
  if (job.salary_min && job.salary_max) return `${job.salary_min}€ - ${job.salary_max}€${period}`;
  return `${job.salary_min || job.salary_max}€${period}`;
};

const JobDetailPage = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await jobsAPI.get(jobId);
      setJob(r.data);
    } catch { setJob(null); }
    finally { setLoading(false); }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  const isOwner = job && user && job.user_id === user.id;

  const apply = async () => {
    setApplying(true);
    try {
      await jobsAPI.apply(jobId, { message });
      setApplied(true);
      toast.success('Candidature envoyée !');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Envoi impossible'); }
    finally { setApplying(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-24"><div className="w-8 h-8 border-2 border-blue-200 border-t-[#1E3A8A] rounded-full animate-spin" /></div>;
  }
  if (!job) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center" data-testid="job-not-found">
        <Briefcase size={40} className="text-gray-300 mb-3" weight="duotone" />
        <p className="text-sm text-gray-500">Offre introuvable</p>
        <button onClick={() => navigate('/emploi')} className="mt-4 text-[#1E3A8A] font-bold text-sm">← Retour aux offres</button>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-28" data-testid="job-detail-page">
      <div className="bg-gradient-to-br from-[#0B1426] to-[#1E3A8A] text-white px-4 pt-5 pb-8 rounded-b-3xl">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center mb-4" data-testid="back-btn">
          <ArrowLeft size={18} />
        </button>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">
          {typeLabel(job.job_type)}
        </span>
        <h1 className="text-xl font-extrabold mt-2">{job.title}</h1>
        <p className="text-sm text-white/80 mt-0.5">{job.company}</p>
        {job.location && (
          <p className="text-xs text-white/70 flex items-center gap-1 mt-2"><MapPin size={14} /> {job.location}{job.remote ? ' · Télétravail possible' : ''}</p>
        )}
        {fmtSalary(job) && <p className="text-sm font-extrabold mt-2">{fmtSalary(job)}</p>}
      </div>

      <div className="px-4 -mt-3 space-y-3">
        {job.description && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-2">Description du poste</h2>
            <p className="text-sm text-gray-600 whitespace-pre-line">{job.description}</p>
          </div>
        )}

        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
          <h2 className="text-sm font-bold text-gray-900 mb-1">Contact</h2>
          {job.contact_email && (
            <p className="text-sm text-gray-600 flex items-center gap-2"><EnvelopeSimple size={16} /> {job.contact_email}</p>
          )}
          {job.contact_phone && (
            <p className="text-sm text-gray-600 flex items-center gap-2"><Phone size={16} /> {job.contact_phone}</p>
          )}
        </div>

        {isOwner ? (
          <button onClick={() => navigate(`/emploi/${jobId}/candidatures`)} className="w-full h-12 rounded-2xl bg-[#1E3A8A] text-white font-bold" data-testid="view-applications-btn">
            Voir les candidatures ({job.applications_count || 0})
          </button>
        ) : applied ? (
          <div className="bg-emerald-50 rounded-2xl p-4 text-center text-emerald-700 font-bold text-sm" data-testid="applied-confirmation">
            Candidature envoyée !
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-2">Postuler</h2>
            <textarea
              className="w-full h-24 py-2 px-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#1E3A8A]"
              placeholder="Message de motivation (optionnel)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              data-testid="apply-message-input"
            />
            <button
              onClick={apply}
              disabled={applying}
              className="w-full h-12 mt-3 rounded-2xl bg-[#1E3A8A] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60"
              data-testid="apply-btn"
            >
              <PaperPlaneTilt size={18} weight="fill" /> {applying ? 'Envoi...' : 'Envoyer ma candidature'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobDetailPage;
