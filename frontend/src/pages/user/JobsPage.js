import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MagnifyingGlass, Briefcase, MapPin, ClipboardText, PlusCircle } from '@phosphor-icons/react';
import { jobsAPI } from '../../services/api';

const JOB_TYPES = [
  { key: 'cdi', label: 'CDI' },
  { key: 'cdd', label: 'CDD' },
  { key: 'interim', label: 'Intérim' },
  { key: 'saisonnier', label: 'Saisonnier' },
  { key: 'stage', label: 'Stage' },
  { key: 'freelance', label: 'Freelance' },
];

const typeLabel = (key) => JOB_TYPES.find((t) => t.key === key)?.label || key;

const fmtSalary = (job) => {
  if (!job.salary_min && !job.salary_max) return null;
  const period = { heure: '/h', jour: '/j', mois: '/mois', an: '/an' }[job.salary_period] || '';
  if (job.salary_min && job.salary_max) return `${job.salary_min}€ - ${job.salary_max}€${period}`;
  return `${job.salary_min || job.salary_max}€${period}`;
};

const JobsPage = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await jobsAPI.list({ ...(type ? { job_type: type } : {}), ...(search ? { q: search } : {}) });
      setJobs(r.data || []);
    } catch { setJobs([]); }
    finally { setLoading(false); }
  }, [type, search]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-10" data-testid="jobs-page">
      <div className="bg-gradient-to-br from-[#0B1426] to-[#1E3A8A] px-4 pt-5 pb-6 rounded-b-3xl">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate('/home')} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="back-btn">
            <ArrowLeft size={18} className="text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-extrabold text-white leading-none">Emploi</h1>
            <p className="text-[11px] text-white/80 mt-1">Offres d'emploi près de chez vous</p>
          </div>
          <button onClick={() => navigate('/emploi/mes-candidatures')} className="flex items-center gap-1.5 bg-white text-[#1E3A8A] font-bold text-xs px-3 py-2 rounded-full" data-testid="my-applications-btn">
            <ClipboardText size={15} weight="fill" /> Mes candidatures
          </button>
        </div>
        <div className="relative">
          <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un poste, une entreprise..."
            className="w-full bg-white border-0 rounded-full pl-10 pr-3 h-11 text-sm outline-none"
            data-testid="jobs-search"
          />
        </div>
      </div>

      <button onClick={() => navigate('/emploi/publier')} className="mx-4 mt-4 w-[calc(100%-2rem)] flex items-center gap-3 bg-white border border-blue-100 rounded-2xl p-3 shadow-sm text-left" data-testid="post-job-entry-btn">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1E3A8A] to-[#2563EB] flex items-center justify-center shrink-0">
          <PlusCircle size={20} weight="fill" className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-gray-900">Vous recrutez ?</p>
          <p className="text-[11px] text-gray-500">Publiez une offre d'emploi gratuitement</p>
        </div>
        <span className="text-[#1E3A8A] text-xs font-bold shrink-0">Publier →</span>
      </button>

      <div className="px-4 pt-4 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        <button onClick={() => setType('')} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${!type ? 'bg-[#1E3A8A] text-white' : 'bg-white text-gray-600 border border-gray-200'}`} data-testid="type-all">Tout</button>
        {JOB_TYPES.map((t) => (
          <button key={t.key} onClick={() => setType(t.key)} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${type === t.key ? 'bg-[#1E3A8A] text-white' : 'bg-white text-gray-600 border border-gray-200'}`} data-testid={`type-${t.key}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-blue-200 border-t-[#1E3A8A] rounded-full animate-spin" /></div>
      ) : jobs.length === 0 ? (
        <div className="px-4 mt-10 text-center text-gray-500" data-testid="jobs-empty">
          <Briefcase size={40} className="mx-auto mb-3 text-gray-300" weight="duotone" />
          <p className="text-sm">Aucune offre pour cette recherche</p>
        </div>
      ) : (
        <div className="px-4 mt-4 space-y-3">
          {jobs.map((job) => (
            <button key={job.id} onClick={() => navigate(`/emploi/${job.id}`)} className="w-full text-left bg-white rounded-2xl p-3 shadow-sm" data-testid={`job-${job.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#1E3A8A]">
                    {typeLabel(job.job_type)}
                  </span>
                  <p className="font-bold text-sm text-gray-900 mt-1.5 line-clamp-1">{job.title}</p>
                  <p className="text-[12px] text-gray-500 mt-0.5">{job.company}</p>
                  {job.location && (
                    <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-1"><MapPin size={12} /> {job.location}{job.remote ? ' · Télétravail' : ''}</p>
                  )}
                </div>
                {fmtSalary(job) && <p className="text-[12px] font-extrabold text-[#1E3A8A] shrink-0">{fmtSalary(job)}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default JobsPage;
