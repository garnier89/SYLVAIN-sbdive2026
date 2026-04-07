import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { driverAPI } from '../../services/api';
import { Car, Motorcycle, Bicycle, ArrowRight, ArrowLeft, Upload, CheckCircle } from '@phosphor-icons/react';

const DriverRegisterPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ vehicle_type: '', vehicle_number: '', vehicle_model: '', license_number: '' });
  const [documents, setDocuments] = useState({ license: null, registration: null, insurance: null });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await driverAPI.register(formData);
      for (const [docType, file] of Object.entries(documents)) {
        if (file) await driverAPI.uploadDocument(file, docType);
      }
      setStep(3);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const vehicles = [
    { value: 'car', label: 'Voiture', Icon: Car },
    { value: 'motorcycle', label: 'Moto', Icon: Motorcycle },
    { value: 'bicycle', label: 'V\u00e9lo', Icon: Bicycle },
  ];

  if (step === 3) {
    return (
      <div className="mobile-container min-h-screen bg-gray-950 flex items-center justify-center p-6" data-testid="driver-register-success">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
            <CheckCircle size={48} weight="duotone" className="text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Demande envoy&eacute;e !</h2>
            <p className="text-gray-400 mt-2 max-w-xs mx-auto">
              Votre demande de chauffeur est en cours de v&eacute;rification. Vous serez notifi&eacute; une fois approuv&eacute;.
            </p>
          </div>
          <button onClick={() => navigate('/chauffeur/home')}
            className="w-full h-14 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-base transition-colors"
            data-testid="go-dashboard-btn">
            Aller au tableau de bord
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-950 flex flex-col" data-testid="driver-register-page">
      {/* Header */}
      <div className="px-4 pt-5 flex items-center gap-3">
        <button onClick={() => step === 1 ? navigate('/chauffeur/home') : setStep(1)}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white">Devenir chauffeur</h1>
          <p className="text-gray-500 text-xs">&Eacute;tape {step} sur 2 &mdash; {step === 1 ? 'V\u00e9hicule' : 'Documents'}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex gap-2 px-5 mt-4">
        <div className={`h-1 rounded-full flex-1 ${step >= 1 ? 'bg-amber-500' : 'bg-gray-800'}`} />
        <div className={`h-1 rounded-full flex-1 ${step >= 2 ? 'bg-amber-500' : 'bg-gray-800'}`} />
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-5 mt-6">
        {step === 1 && (
          <div className="space-y-5 flex-1">
            {/* Vehicle Type */}
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 block">Type de v&eacute;hicule</label>
              <div className="grid grid-cols-3 gap-3">
                {vehicles.map(v => (
                  <button key={v.value} type="button"
                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                      formData.vehicle_type === v.value
                        ? 'border-amber-500 bg-amber-500/10' : 'border-gray-800 bg-gray-900 hover:border-gray-700'}`}
                    onClick={() => setFormData({ ...formData, vehicle_type: v.value })}
                    data-testid={`vehicle-type-${v.value}`}>
                    <v.Icon size={32} weight="duotone" className={formData.vehicle_type === v.value ? 'text-amber-500' : 'text-gray-500'} />
                    <span className={`text-xs font-medium ${formData.vehicle_type === v.value ? 'text-amber-400' : 'text-gray-400'}`}>{v.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Vehicle Number */}
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">Immatriculation</label>
              <input name="vehicle_number" value={formData.vehicle_number}
                onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value })}
                placeholder="AB-123-CD" required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base outline-none focus:border-amber-500 transition-colors placeholder:text-gray-500"
                data-testid="vehicle-number-input" />
            </div>

            {/* Vehicle Model */}
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">Mod&egrave;le</label>
              <input name="vehicle_model" value={formData.vehicle_model}
                onChange={(e) => setFormData({ ...formData, vehicle_model: e.target.value })}
                placeholder="Toyota Camry 2022" required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base outline-none focus:border-amber-500 transition-colors placeholder:text-gray-500"
                data-testid="vehicle-model-input" />
            </div>

            {/* License */}
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">N&deg; permis de conduire</label>
              <input name="license_number" value={formData.license_number}
                onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                placeholder="12AB34567" required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base outline-none focus:border-amber-500 transition-colors placeholder:text-gray-500"
                data-testid="license-number-input" />
            </div>

            <div className="mt-auto pb-8 pt-4">
              <button type="button" onClick={() => setStep(2)}
                disabled={!formData.vehicle_type || !formData.vehicle_number || !formData.vehicle_model || !formData.license_number}
                className="w-full h-14 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
                data-testid="next-step-btn">
                Continuer <ArrowRight size={20} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 flex-1">
            {[
              { key: 'license', label: 'Permis de conduire' },
              { key: 'registration', label: 'Carte grise' },
              { key: 'insurance', label: "Attestation d'assurance" },
            ].map((doc) => (
              <div key={doc.key}>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">{doc.label}</label>
                <div className="relative">
                  <input type="file" accept="image/*,.pdf"
                    onChange={(e) => setDocuments({ ...documents, [doc.key]: e.target.files[0] })}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    data-testid={`upload-${doc.key}`} />
                  <div className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
                    documents[doc.key] ? 'border-amber-500 bg-amber-500/5' : 'border-gray-700 bg-gray-900'}`}>
                    {documents[doc.key] ? (
                      <div className="flex items-center justify-center gap-2 text-amber-500">
                        <CheckCircle size={20} weight="fill" />
                        <span className="font-medium text-sm truncate max-w-[200px]">{documents[doc.key].name}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-gray-500">
                        <Upload size={24} />
                        <span className="text-xs">Cliquez pour t&eacute;l&eacute;charger</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div className="mt-auto pb-8 pt-4 flex gap-3">
              <button type="button" onClick={() => setStep(1)}
                className="flex-1 h-14 rounded-xl border border-gray-700 text-gray-300 font-bold transition-colors hover:bg-gray-800"
                data-testid="back-step-btn">
                Retour
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 h-14 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold transition-colors disabled:opacity-40"
                data-testid="submit-btn">
                {loading ? 'Envoi...' : 'Soumettre'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

export default DriverRegisterPage;
