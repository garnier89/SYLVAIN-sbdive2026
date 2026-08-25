import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Briefcase } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { jobsAPI } from '../../services/api';

const JOB_TYPES = [
  { key: 'cdi', label: 'CDI' },
  { key: 'cdd', label: 'CDD' },
  { key: 'interim', label: 'Intérim' },
  { key: 'saisonnier', label: 'Saisonnier' },
  { key: 'stage', label: 'Stage' },
  { key: 'freelance', label: 'Freelance' },
];

const EMPTY = {
  title: '', company: '', job_type: 'cdi', description: '', location: '', remote: false,
  salary_min: '', salary_max: '', salary_period: 'mois', contact_email: '', contact_phone: '',
};

const inputCls = 'w-full h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-[#1E3A8A]';
const labelCls = 'text-xs font-bold text-gray-600 mb-1 block';

const PostJobPage = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [posting, setPosting] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim() || !form.company.trim()) { toast.error('Titre du poste et entreprise requis'); return; }
    setPosting(true);
    try {
      const r = await jobsAPI.create({
        title: form.title.trim(),
        company: form.company.trim(),
        job_type: form.job_type,
        description: form.description.trim(),
        location: form.location.trim() || null,
        remote: form.remote,
        salary_min: form.salary_min ? Number(form.salary_min) : null,
        salary_max: form.salary_max ? Number(form.salary_max) : null,
        salary_period: form.salary_period,
        contact_email: form.contact_email.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
      });
      toast.success('Offre publiée !');
      navigate(`/emploi/${r.data.id}`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Publication impossible'); }
    finally { setPosting(false); }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24" data-testid="post-job-page">
      <div className="bg-gradient-to-br from-[#0B1426] to-[#1E3A8A] text-white px-4 pt-12 pb-6 rounded-b-3xl">
        <button onClick={() => navigate(-1)} className="mb-3" data-testid="back-button"><ArrowLeft size={24} /></button>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Briefcase size={26} weight="fill" /> Publier une offre</h1>
        <p className="text-sm text-white/80 mt-1">Trouvez votre prochain·e collaborateur·rice.</p>
      </div>

      <div className="px-4 -mt-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <div>
            <label className={labelCls}>Intitulé du poste *</label>
            <input className={inputCls} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex : Chef de rang" data-testid="job-title-input" />
          </div>
          <div>
            <label className={labelCls}>Entreprise *</label>
            <input className={inputCls} value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="Ex : Restaurant La Vague" data-testid="job-company-input" />
          </div>
          <div>
            <label className={labelCls}>Type de contrat</label>
            <div className="flex flex-wrap gap-2">
              {JOB_TYPES.map((t) => (
                <button key={t.key} type="button" onClick={() => set('job_type', t.key)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${form.job_type === t.key ? 'bg-[#1E3A8A] text-white' : 'bg-gray-100 text-gray-600'}`} data-testid={`job-type-${t.key}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Lieu</label>
            <input className={inputCls} value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Ex : Gustavia" data-testid="job-location-input" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.remote} onChange={(e) => set('remote', e.target.checked)} data-testid="job-remote-checkbox" />
            Télétravail possible
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Salaire min (€)</label>
              <input className={inputCls} type="number" value={form.salary_min} onChange={(e) => set('salary_min', e.target.value)} data-testid="job-salary-min-input" />
            </div>
            <div>
              <label className={labelCls}>Salaire max (€)</label>
              <input className={inputCls} type="number" value={form.salary_max} onChange={(e) => set('salary_max', e.target.value)} data-testid="job-salary-max-input" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Période</label>
            <select className={inputCls} value={form.salary_period} onChange={(e) => set('salary_period', e.target.value)} data-testid="job-salary-period-select">
              <option value="heure">Par heure</option>
              <option value="jour">Par jour</option>
              <option value="mois">Par mois</option>
              <option value="an">Par an</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea className={`${inputCls} h-24 py-2`} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Missions, profil recherché..." data-testid="job-description-input" />
          </div>
          <div>
            <label className={labelCls}>Email de contact</label>
            <input className={inputCls} type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} data-testid="job-email-input" />
          </div>
          <div>
            <label className={labelCls}>Téléphone de contact</label>
            <input className={inputCls} value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} data-testid="job-phone-input" />
          </div>
        </div>

        <button
          onClick={submit}
          disabled={posting}
          className="w-full h-12 mt-4 rounded-2xl bg-[#1E3A8A] text-white font-bold disabled:opacity-60"
          data-testid="submit-job-btn"
        >
          {posting ? 'Publication...' : 'Publier l’offre'}
        </button>
      </div>
    </div>
  );
};

export default PostJobPage;
