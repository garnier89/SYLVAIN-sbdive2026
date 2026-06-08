import { useLocale } from '../../contexts/LocaleContext';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { medicalAPI } from '../../services/api';
import {
  ArrowLeft, Star, Stethoscope, House, Hospital, CalendarBlank, Clock, CheckCircle, CaretRight, PhoneCall,
} from '@phosphor-icons/react';

const TIME_SLOTS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];

const MedicalAppointmentPage = () => {
  const { money } = useLocale();
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState([]);
  const [specialties, setSpecialties] = useState([]);
  const [specialty, setSpecialty] = useState('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // doctor
  const [form, setForm] = useState({ mode: 'clinic', date: '', time: '', patient_name: '', patient_phone: '', patient_age: '', symptoms: '', address: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setLoading(true);
    medicalAPI.listDoctors(specialty).then((r) => {
      setDoctors(r.data.doctors || []);
      setSpecialties(r.data.specialties || []);
    }).catch(() => toast.error('Erreur de chargement')).finally(() => setLoading(false));
  }, [specialty]);

  const openBooking = (doc) => {
    setSelected(doc);
    setForm((f) => ({ ...f, mode: doc.modes?.[0] || 'clinic', date: '', time: '' }));
  };

  const submit = async () => {
    if (!form.date || !form.time || !form.patient_name) return toast.error('Date, heure et nom du patient requis');
    if (form.mode === 'home' && !form.address) return toast.error('Adresse requise pour une visite à domicile');
    setSubmitting(true);
    try {
      await medicalAPI.createAppointment({
        doctor_id: selected.id, doctor_name: selected.name, specialty: selected.specialty,
        mode: form.mode, scheduled_date: form.date, scheduled_time: form.time,
        patient_name: form.patient_name, patient_phone: form.patient_phone, patient_age: form.patient_age,
        symptoms: form.symptoms, address: form.address, fee: selected.fee, payment_method: 'cash',
      });
      setDone(true);
      setTimeout(() => navigate('/history'), 2500);
    } catch { toast.error('Échec de la réservation'); } finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center" data-testid="appointment-success">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6"><CheckCircle size={40} weight="fill" className="text-green-600" /></div>
        <h2 className="text-2xl font-bold mb-2">Rendez-vous confirmé !</h2>
        <p className="text-gray-500">{selected?.name} · {form.date} à {form.time} ({form.mode === 'home' ? 'à domicile' : 'en cabinet'}).</p>
      </div>
    );
  }

  // ===== BOOKING FORM =====
  if (selected) {
    return (
      <div className="mobile-container min-h-screen bg-gray-50" data-testid="appointment-booking">
        <div className="bg-[#FF4500] px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setSelected(null)} data-testid="appointment-back-btn"><ArrowLeft size={22} className="text-white" /></button>
          <h1 className="text-white font-bold text-lg">Prendre rendez-vous</h1>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl p-4 flex items-center gap-3">
            <img src={selected.image_url} alt={selected.name} className="w-14 h-14 rounded-full object-cover" />
            <div className="flex-1">
              <h2 className="font-bold text-gray-900">{selected.name}</h2>
              <p className="text-sm text-gray-500">{selected.specialty}</p>
            </div>
            <span className="text-[#FF4500] font-bold">{money(selected.fee)}</span>
          </div>

          {/* Mode */}
          <div className="bg-white rounded-2xl p-4">
            <label className="text-sm font-semibold text-gray-700 block mb-2">Lieu de consultation</label>
            <div className="grid grid-cols-2 gap-2">
              {selected.modes?.includes('clinic') && (
                <button onClick={() => setForm({ ...form, mode: 'clinic' })} data-testid="mode-clinic"
                  className={`flex items-center gap-2 py-3 px-3 rounded-xl border text-sm font-medium ${form.mode === 'clinic' ? 'border-[#FF4500] bg-orange-50 text-[#FF4500]' : 'border-gray-200 text-gray-600'}`}>
                  <Hospital size={18} /> En cabinet
                </button>
              )}
              {selected.modes?.includes('home') && (
                <button onClick={() => setForm({ ...form, mode: 'home' })} data-testid="mode-home"
                  className={`flex items-center gap-2 py-3 px-3 rounded-xl border text-sm font-medium ${form.mode === 'home' ? 'border-[#FF4500] bg-orange-50 text-[#FF4500]' : 'border-gray-200 text-gray-600'}`}>
                  <House size={18} /> À domicile
                </button>
              )}
            </div>
            {form.mode === 'clinic' && <p className="text-xs text-gray-400 mt-2">{selected.clinic}</p>}
            {form.mode === 'home' && (
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Votre adresse complète" className="w-full mt-2 border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="appointment-address" />
            )}
          </div>

          {/* Date & time */}
          <div className="bg-white rounded-2xl p-4">
            <label className="text-sm font-semibold text-gray-700 block mb-2 flex items-center gap-1.5"><CalendarBlank size={16} /> Date</label>
            <input type="date" value={form.date} min={new Date().toISOString().split('T')[0]} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="appointment-date" />
            <label className="text-sm font-semibold text-gray-700 block mt-3 mb-2 flex items-center gap-1.5"><Clock size={16} /> Créneau</label>
            <div className="flex flex-wrap gap-2">
              {TIME_SLOTS.map((t) => (
                <button key={t} onClick={() => setForm({ ...form, time: t })} data-testid={`slot-${t}`}
                  className={`px-3.5 py-2 rounded-lg text-sm font-medium border ${form.time === t ? 'border-[#FF4500] bg-orange-50 text-[#FF4500]' : 'border-gray-200 text-gray-600'}`}>{t}</button>
              ))}
            </div>
          </div>

          {/* Patient */}
          <div className="bg-white rounded-2xl p-4 space-y-2">
            <label className="text-sm font-semibold text-gray-700 block">Patient</label>
            <input value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} placeholder="Nom du patient" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="patient-name" />
            <div className="grid grid-cols-2 gap-2">
              <input value={form.patient_phone} onChange={(e) => setForm({ ...form, patient_phone: e.target.value })} placeholder="Téléphone" className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="patient-phone" />
              <input value={form.patient_age} onChange={(e) => setForm({ ...form, patient_age: e.target.value })} placeholder="Âge" className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="patient-age" />
            </div>
            <textarea value={form.symptoms} onChange={(e) => setForm({ ...form, symptoms: e.target.value })} placeholder="Symptômes / motif (optionnel)" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none h-20" data-testid="patient-symptoms" />
          </div>

          <button onClick={submit} disabled={submitting} className="w-full bg-[#FF4500] text-white py-3.5 rounded-2xl font-semibold disabled:opacity-60" data-testid="confirm-appointment-btn">
            {submitting ? 'Réservation...' : `Confirmer le RDV · ${money(selected.fee)}`}
          </button>
        </div>
      </div>
    );
  }

  // ===== DOCTOR LIST =====
  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="medical-appointment-page">
      <div className="bg-gradient-to-br from-[#FF4500] to-[#E03D00] px-4 pt-4 pb-6">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate('/home')} className="text-white" data-testid="medical-back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold text-white">Prendre rendez-vous</h1>
        </div>
        <p className="text-sm text-white/80">Médecin ou expert médical, en cabinet ou à domicile.</p>
        <a href="tel:15" data-testid="emergency-call-btn"
          className="mt-3 flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 text-white text-xs font-bold py-2 rounded-xl backdrop-blur-sm">
          <PhoneCall size={15} weight="fill" /> Urgence vitale ? Appelez le 15 (SAMU) · 112
        </a>
      </div>

      <div className="px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide" data-testid="specialty-filter">
        {['all', ...specialties].map((s) => (
          <button key={s} onClick={() => setSpecialty(s)} data-testid={`specialty-${s}`}
            className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap border ${specialty === s ? 'bg-[#FF4500] text-white border-[#FF4500]' : 'bg-white text-gray-600 border-gray-200'}`}>
            {s === 'all' ? 'Tous' : s}
          </button>
        ))}
      </div>

      <div className="px-4 pb-6 space-y-3">
        {loading ? (
          <div className="text-center py-8 text-gray-400">Chargement...</div>
        ) : doctors.map((doc) => (
          <button key={doc.id} onClick={() => openBooking(doc)} data-testid={`doctor-${doc.id}`}
            className="w-full bg-white rounded-2xl p-4 border border-gray-100 flex gap-3 text-left hover:border-orange-200 transition-colors">
            <img src={doc.image_url} alt={doc.name} className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-sm">{doc.name}</h3>
              <p className="text-xs text-gray-500">{doc.specialty}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="flex items-center gap-1 text-xs"><Star size={12} weight="fill" className="text-amber-400" />{doc.rating}</span>
                <span className="text-[10px] text-gray-400">{doc.experience_years} ans</span>
                <span className="text-[10px] text-green-600 font-medium">{doc.next_slot}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                {doc.modes?.includes('clinic') && <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full">Cabinet</span>}
                {doc.modes?.includes('home') && <span className="text-[9px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded-full">Domicile</span>}
              </div>
            </div>
            <div className="flex flex-col items-end justify-between">
              <span className="text-[#FF4500] font-bold text-sm">{money(doc.fee)}</span>
              <CaretRight size={18} className="text-gray-300" />
            </div>
          </button>
        ))}
        {!loading && doctors.length === 0 && <p className="text-center text-gray-400 py-8">Aucun médecin trouvé</p>}
      </div>
    </div>
  );
};

export default MedicalAppointmentPage;
