import React, { useState, useEffect } from 'react';
import { Gear, Globe, CurrencyEur, Percent, Bell, ShieldCheck } from '@phosphor-icons/react';

const AdminSettings = () => {
  const [settings, setSettings] = useState({
    platform_name: 'SB Drive VTC',
    default_currency: 'EUR',
    default_language: 'fr',
    commission_rate: 10,
    min_fare: 5.0,
    surge_multiplier: 1.0,
    auto_assign_rides: true,
    notifications_enabled: true,
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const SettingRow = ({ icon: Icon, label, desc, children }) => (
    <div className="bg-[#161923] border border-gray-800 rounded-xl p-4 flex items-center gap-4 hover:border-gray-700 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-[#FF4500]/10 flex items-center justify-center flex-shrink-0">
        <Icon size={20} className="text-[#FF4500]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">{label}</p>
        <p className="text-gray-500 text-xs">{desc}</p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );

  const Toggle = ({ checked, onChange }) => (
    <button onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-[#FF4500]' : 'bg-gray-700'}`}>
      <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${checked ? 'translate-x-5.5 left-[22px]' : 'left-0.5'}`} />
    </button>
  );

  return (
    <div className="p-5 lg:p-6 space-y-5" data-testid="admin-settings-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Configuration</h1>
          <p className="text-gray-500 text-sm">Parametres de la plateforme</p>
        </div>
        <button onClick={handleSave}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
            saved ? 'bg-emerald-500 text-white' : 'bg-[#FF4500] text-white hover:bg-[#FF6B35]'}`}
          data-testid="save-settings-btn">
          {saved ? 'Enregistre !' : 'Enregistrer'}
        </button>
      </div>

      <div className="space-y-3">
        <h3 className="text-gray-400 text-xs uppercase tracking-wider font-bold px-1">General</h3>
        <SettingRow icon={Globe} label="Nom de la plateforme" desc="Affiche dans l'application">
          <input value={settings.platform_name}
            onChange={(e) => setSettings({...settings, platform_name: e.target.value})}
            className="bg-[#0f1117] border border-gray-800 rounded-lg px-3 py-1.5 text-white text-sm w-40 outline-none focus:border-[#FF4500]"
            data-testid="platform-name-input" />
        </SettingRow>
        <SettingRow icon={CurrencyEur} label="Devise" desc="Devise par defaut">
          <select value={settings.default_currency}
            onChange={(e) => setSettings({...settings, default_currency: e.target.value})}
            className="bg-[#0f1117] border border-gray-800 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-[#FF4500]">
            <option value="EUR">EUR</option><option value="USD">USD</option><option value="XAF">XAF</option>
          </select>
        </SettingRow>
        <SettingRow icon={Globe} label="Langue" desc="Langue par defaut">
          <select value={settings.default_language}
            onChange={(e) => setSettings({...settings, default_language: e.target.value})}
            className="bg-[#0f1117] border border-gray-800 rounded-lg px-3 py-1.5 text-white text-sm outline-none focus:border-[#FF4500]">
            <option value="fr">Francais</option><option value="en">English</option>
          </select>
        </SettingRow>

        <h3 className="text-gray-400 text-xs uppercase tracking-wider font-bold px-1 mt-6">Tarification</h3>
        <SettingRow icon={Percent} label="Commission (%)" desc="Pourcentage preleve sur chaque course">
          <input type="number" value={settings.commission_rate}
            onChange={(e) => setSettings({...settings, commission_rate: parseInt(e.target.value) || 0})}
            className="bg-[#0f1117] border border-gray-800 rounded-lg px-3 py-1.5 text-white text-sm w-20 outline-none focus:border-[#FF4500] text-center"
            data-testid="commission-input" />
        </SettingRow>
        <SettingRow icon={CurrencyEur} label="Tarif minimum" desc="Montant minimum d'une course">
          <input type="number" step="0.5" value={settings.min_fare}
            onChange={(e) => setSettings({...settings, min_fare: parseFloat(e.target.value) || 0})}
            className="bg-[#0f1117] border border-gray-800 rounded-lg px-3 py-1.5 text-white text-sm w-20 outline-none focus:border-[#FF4500] text-center" />
        </SettingRow>

        <h3 className="text-gray-400 text-xs uppercase tracking-wider font-bold px-1 mt-6">Operations</h3>
        <SettingRow icon={ShieldCheck} label="Auto-assignation" desc="Assigner automatiquement les courses aux chauffeurs">
          <Toggle checked={settings.auto_assign_rides} onChange={(v) => setSettings({...settings, auto_assign_rides: v})} />
        </SettingRow>
        <SettingRow icon={Bell} label="Notifications" desc="Envoyer des notifications push">
          <Toggle checked={settings.notifications_enabled} onChange={(v) => setSettings({...settings, notifications_enabled: v})} />
        </SettingRow>
      </div>
    </div>
  );
};

export default AdminSettings;
