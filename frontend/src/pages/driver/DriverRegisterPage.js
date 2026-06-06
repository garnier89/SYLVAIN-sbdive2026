import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { driverAPI } from '../../services/api';
import { Car, Motorcycle, Bicycle, ArrowRight, ArrowLeft, Upload, CheckCircle, Package, Taxi, Lightning } from '@phosphor-icons/react';

const SERVICE_OPTIONS = [
  { value: 'taxi', label: 'Taxi', desc: 'Transport de personnes', Icon: Taxi },
  { value: 'delivery', label: 'Livreur', desc: 'Commandes marchands', Icon: Package },
  { value: 'courier', label: 'Coursier', desc: 'Colis & express', Icon: Lightning },
];
const VEHICLE_OPTIONS = [
  { value: 'velo', label: 'Vélo', Icon: Bicycle },
  { value: 'moto', label: 'Moto', Icon: Motorcycle },
  { value: 'car', label: 'Voiture', Icon: Car },
];
const TAXI_SUBS = [
  { value: 'particulier', label: 'Particulier', desc: 'Transport privé' },
  { value: 'vtc', label: 'VTC', desc: 'Carte VTC' },
  { value: 'taxi', label: 'Taxi', desc: 'Licence / ADS' },
];

const DriverRegisterPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);          // ['taxi','delivery','courier']
  const [vehicleClass, setVehicleClass] = useState('');  // 'velo' | 'moto' | 'car'
  const [taxiSub, setTaxiSub] = useState('');            // 'particulier' | 'vtc' | 'taxi'
  const [info, setInfo] = useState({ vehicle_number: '', vehicle_model: '', license_number: '' });
  const [documents, setDocuments] = useState({});

  useEffect(() => {
    const load = async () => {
      try {
        const res = await driverAPI.getCategories();
        setCategories(res.data || []);
      } catch (e) { console.error(e); }
    };
    load();
  }, []);

  const catMap = {};
  categories.forEach((c) => { catMap[c.id] = c; });

  const taxiSelected = services.includes('taxi');
  const veloAllowed = !taxiSelected; // taxi (transport de personnes) ne peut pas se faire à vélo

  const toggleService = (val) => {
    setServices((prev) => {
      const has = prev.includes(val);
      const next = has ? prev.filter((s) => s !== val) : [...prev, val];
      // selecting taxi while on a bike resets the vehicle (taxi needs moto/voiture)
      if (val === 'taxi' && !has && vehicleClass === 'velo') { setVehicleClass(''); setTaxiSub(''); }
      if (val === 'taxi' && has) setTaxiSub('');
      return next;
    });
  };
  const selectVehicle = (val) => {
    setVehicleClass(val);
    if (val !== 'car') setTaxiSub(''); // sous-catégorie taxi seulement en voiture
  };

  // Build the V3Cube category leaf ids from the selections
  const computeCategoryIds = () => {
    const ids = [];
    services.forEach((s) => {
      if (s === 'taxi') {
        if (vehicleClass === 'moto') ids.push('taxi_moto');
        else if (vehicleClass === 'car' && taxiSub) ids.push(`taxi_car_${taxiSub}`);
      } else if (vehicleClass) {
        ids.push(`${s}_${vehicleClass}`);
      }
    });
    return ids;
  };

  const requiredDocs = () => {
    const docs = []; const seen = new Set();
    computeCategoryIds().forEach((id) => {
      (catMap[id]?.documents || []).forEach((d) => {
        if (!seen.has(d.key)) { seen.add(d.key); docs.push(d); }
      });
    });
    return docs;
  };

  const needsVehicleInfo = vehicleClass && vehicleClass !== 'velo';
  const step1Valid = (
    services.length > 0 &&
    !!vehicleClass &&
    (!taxiSelected || vehicleClass !== 'velo') &&
    (!(taxiSelected && vehicleClass === 'car') || !!taxiSub) &&
    (!needsVehicleInfo || (info.vehicle_number && info.vehicle_model && info.license_number))
  );

  const docs = requiredDocs();
  const allDocsUploaded = docs.length > 0 && docs.every((d) => documents[d.key]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const ids = computeCategoryIds();
    if (ids.length === 0) { toast.error('Sélection incomplète'); return; }
    setLoading(true);
    try {
      await driverAPI.register({
        categories: ids,
        vehicle_number: info.vehicle_number,
        vehicle_model: info.vehicle_model,
        license_number: info.license_number,
      });
      for (const d of docs) {
        if (documents[d.key]) await driverAPI.uploadDocument(documents[d.key], d.key);
      }
      setStep(3);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Échec de l'inscription");
    } finally { setLoading(false); }
  };

  if (step === 3) {
    return (
      <div className="mobile-container min-h-screen bg-gray-950 flex items-center justify-center p-6" data-testid="driver-register-success">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
            <CheckCircle size={48} weight="duotone" className="text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Demande envoyée !</h2>
            <p className="text-gray-400 mt-2 max-w-xs mx-auto">
              Votre demande de chauffeur est en cours de vérification. Vous serez notifié une fois approuvé.
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
      <div className="px-4 pt-5 flex items-center gap-3">
        <button onClick={() => (step === 1 ? navigate('/chauffeur/home') : setStep(1))}
          className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center" data-testid="back-btn">
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-white">Devenir chauffeur</h1>
          <p className="text-gray-500 text-xs">Étape {step} sur 2 — {step === 1 ? 'Activité & véhicule' : 'Documents'}</p>
        </div>
      </div>

      <div className="flex gap-2 px-5 mt-4">
        <div className={`h-1 rounded-full flex-1 ${step >= 1 ? 'bg-amber-500' : 'bg-gray-800'}`} />
        <div className={`h-1 rounded-full flex-1 ${step >= 2 ? 'bg-amber-500' : 'bg-gray-800'}`} />
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-5 mt-6 pb-8">
        {step === 1 && (
          <div className="space-y-6 flex-1">
            {/* Services */}
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Je veux faire</label>
              <p className="text-[10px] text-gray-500 mb-2">Sélectionnez un ou plusieurs services</p>
              <div className="grid grid-cols-3 gap-3">
                {SERVICE_OPTIONS.map((opt) => {
                  const sel = services.includes(opt.value);
                  return (
                    <button key={opt.value} type="button"
                      className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${sel ? 'border-amber-500 bg-amber-500/10' : 'border-gray-800 bg-gray-900 hover:border-gray-700'}`}
                      onClick={() => toggleService(opt.value)}
                      aria-pressed={sel}
                      data-testid={`service-type-${opt.value}`}>
                      <opt.Icon size={30} weight="duotone" className={sel ? 'text-amber-500' : 'text-gray-500'} />
                      <span className={`text-xs font-semibold ${sel ? 'text-amber-400' : 'text-gray-300'}`}>{opt.label}</span>
                      <span className="text-[10px] text-gray-500 leading-tight text-center">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Vehicle class */}
            {services.length > 0 && (
              <div data-testid="vehicle-class-section">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Mon véhicule</label>
                <p className="text-[10px] text-gray-500 mb-2">{taxiSelected ? 'Le Taxi se fait en moto (moto-taxi) ou en voiture' : 'Vélo, moto ou voiture'}</p>
                <div className="grid grid-cols-3 gap-3">
                  {VEHICLE_OPTIONS.map((v) => {
                    const disabled = v.value === 'velo' && !veloAllowed;
                    const active = vehicleClass === v.value;
                    return (
                      <button key={v.value} type="button" disabled={disabled}
                        className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${disabled ? 'border-gray-800 bg-gray-900/50 opacity-40' : active ? 'border-amber-500 bg-amber-500/10' : 'border-gray-800 bg-gray-900 hover:border-gray-700'}`}
                        onClick={() => selectVehicle(v.value)}
                        data-testid={`vehicle-class-${v.value}`}>
                        <v.Icon size={32} weight="duotone" className={active ? 'text-amber-500' : 'text-gray-500'} />
                        <span className={`text-xs font-medium ${active ? 'text-amber-400' : 'text-gray-400'}`}>{v.label}</span>
                        {disabled && <span className="text-[9px] text-gray-600">Taxi: moto/voiture</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Taxi sub-category (only car taxi) */}
            {taxiSelected && vehicleClass === 'car' && (
              <div data-testid="taxi-sub-section">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 block">Vous êtes (Taxi voiture)</label>
                <p className="text-[10px] text-gray-500 mb-2">Chaque catégorie a ses documents</p>
                <div className="grid grid-cols-3 gap-3">
                  {TAXI_SUBS.map((s) => {
                    const active = taxiSub === s.value;
                    return (
                      <button key={s.value} type="button"
                        className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${active ? 'border-amber-500 bg-amber-500/10' : 'border-gray-800 bg-gray-900 hover:border-gray-700'}`}
                        onClick={() => setTaxiSub(s.value)}
                        data-testid={`taxi-sub-${s.value}`}>
                        <span className={`text-xs font-semibold ${active ? 'text-amber-400' : 'text-gray-300'}`}>{s.label}</span>
                        <span className="text-[10px] text-gray-500 leading-tight text-center">{s.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Vehicle info (not needed for bike) */}
            {needsVehicleInfo && (
              <div className="space-y-4" data-testid="vehicle-info-section">
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">Immatriculation</label>
                  <input value={info.vehicle_number}
                    onChange={(e) => setInfo({ ...info, vehicle_number: e.target.value })}
                    placeholder="AB-123-CD"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base outline-none focus:border-amber-500 transition-colors placeholder:text-gray-500"
                    data-testid="vehicle-number-input" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">Modèle</label>
                  <input value={info.vehicle_model}
                    onChange={(e) => setInfo({ ...info, vehicle_model: e.target.value })}
                    placeholder="Toyota Camry 2022"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base outline-none focus:border-amber-500 transition-colors placeholder:text-gray-500"
                    data-testid="vehicle-model-input" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">N° permis de conduire</label>
                  <input value={info.license_number}
                    onChange={(e) => setInfo({ ...info, license_number: e.target.value })}
                    placeholder="12AB34567"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-base outline-none focus:border-amber-500 transition-colors placeholder:text-gray-500"
                    data-testid="license-number-input" />
                </div>
              </div>
            )}

            <div className="mt-auto pt-4">
              <button type="button" onClick={() => setStep(2)} disabled={!step1Valid}
                className="w-full h-14 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
                data-testid="next-step-btn">
                Continuer <ArrowRight size={20} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 flex-1">
            <p className="text-xs text-gray-400">Documents requis pour vos catégories sélectionnées</p>
            {docs.length === 0 ? (
              <p className="text-sm text-gray-500" data-testid="no-docs">Revenez à l&apos;étape 1 pour compléter votre sélection.</p>
            ) : docs.map((doc) => (
              <div key={doc.key}>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5 block">{doc.label}</label>
                <div className="relative">
                  <input type="file" accept="image/*,.pdf"
                    onChange={(e) => setDocuments({ ...documents, [doc.key]: e.target.files[0] })}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    data-testid={`upload-${doc.key}`} />
                  <div className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${documents[doc.key] ? 'border-amber-500 bg-amber-500/5' : 'border-gray-700 bg-gray-900'}`}>
                    {documents[doc.key] ? (
                      <div className="flex items-center justify-center gap-2 text-amber-500">
                        <CheckCircle size={20} weight="fill" />
                        <span className="font-medium text-sm truncate max-w-[200px]">{documents[doc.key].name}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-gray-500">
                        <Upload size={24} />
                        <span className="text-xs">Cliquez pour télécharger</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <div className="mt-auto pt-4 flex gap-3">
              <button type="button" onClick={() => setStep(1)}
                className="flex-1 h-14 rounded-xl border border-gray-700 text-gray-300 font-bold transition-colors hover:bg-gray-800"
                data-testid="back-step-btn">
                Retour
              </button>
              <button type="submit" disabled={loading || !allDocsUploaded}
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
