import React, { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';

const settingsTabs = [
  'General', 'Email', 'Appearance', 'SMS', 'Social Media',
  'App Settings', 'Installation Settings', 'Store Settings',
  'Maps Api Settings', 'Payment', 'Notification Sound'
];

const AdminSettings = () => {
  const [activeTab, setActiveTab] = useState('General');
  const [settings, setSettings] = useState({
    platform_name: 'SB Drive VTC',
    admin_country_code: '1',
    country_code: 'FR',
    default_distance_unit: 'KMs',
    wallet_amount_1: '699',
    wallet_amount_2: '799',
    wallet_amount_3: '899',
    google_analytics_id: '',
    records_per_page: '50',
    maintenance_mode: 'No',
    default_currency: 'EUR',
    default_language: 'fr',
    commission_rate: '10',
    min_fare: '5.0',
    surge_multiplier: '1.0',
    auto_assign_rides: true,
    notifications_enabled: true,
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_password: '',
    sender_email: '',
    sms_provider: 'twilio',
    sms_api_key: '',
    primary_color: '#3b82f6',
    secondary_color: '#FF4500',
    maps_api_key: '',
    stripe_key: '',
    stripe_secret: '',
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const r = await adminAPI.getSettings();
        if (r.data?.settings) setSettings(prev => ({ ...prev, ...r.data.settings }));
      } catch (e) { console.error('Failed to load settings:', e); }
      finally { setLoading(false); }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      await adminAPI.updateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error('Failed to save settings:', e); }
  };

  const update = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

  const Field = ({ label, keyName, type = 'text', tooltip, half, options }) => (
    <div className={half ? 'w-full md:w-1/2' : 'w-full'}>
      <label className="block text-sm font-bold text-gray-700 mb-1">
        {label} {tooltip && <span className="text-gray-400 cursor-help" title={tooltip}>&#9432;</span>}
      </label>
      {options ? (
        <select value={settings[keyName]} onChange={e => update(keyName, e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-400 bg-white"
          data-testid={`setting-${keyName}`}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : type === 'toggle' ? (
        <button onClick={() => update(keyName, !settings[keyName])}
          className={`w-12 h-6 rounded-full transition-colors relative ${settings[keyName] ? 'bg-green-500' : 'bg-gray-300'}`}
          data-testid={`setting-${keyName}`}>
          <div className={`w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${settings[keyName] ? 'left-[26px]' : 'left-0.5'}`} />
        </button>
      ) : (
        <input type={type} value={settings[keyName]} onChange={e => update(keyName, e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 outline-none focus:border-blue-400"
          data-testid={`setting-${keyName}`} />
      )}
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'General':
        return (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-5">
              <Field label="Project Name" keyName="platform_name" tooltip="Name displayed in the app" half />
              <Field label="Wallet fixed amount 1" keyName="wallet_amount_1" tooltip="Preset wallet topup amount" half />
            </div>
            <div className="flex flex-wrap gap-5">
              <Field label="Admin Country ISD Code" keyName="admin_country_code" tooltip="ISD code" half />
              <Field label="Wallet fixed amount 2" keyName="wallet_amount_2" tooltip="Preset wallet topup amount" half />
            </div>
            <div className="flex flex-wrap gap-5">
              <Field label="Country Code" keyName="country_code" tooltip="Country code" half
                options={[{ value: 'FR', label: 'France (FR)' }, { value: 'US', label: 'United States (US)' }, { value: 'IN', label: 'India (IN)' }, { value: 'CM', label: 'Cameroon (CM)' }]} />
              <Field label="Wallet fixed amount 3" keyName="wallet_amount_3" tooltip="Preset wallet topup amount" half />
            </div>
            <div className="flex flex-wrap gap-5">
              <Field label="Default Distance Unit" keyName="default_distance_unit" tooltip="KMs or Miles" half
                options={[{ value: 'KMs', label: 'KMs' }, { value: 'Miles', label: 'Miles' }]} />
              <Field label="Google Analytics ID" keyName="google_analytics_id" tooltip="GA tracking ID" half />
            </div>
            <div className="flex flex-wrap gap-5">
              <Field label="Display record per page in Admin panel" keyName="records_per_page" tooltip="Number of records per page" half />
              <Field label="Maintenance mode for Website" keyName="maintenance_mode" tooltip="Enable maintenance mode" half
                options={[{ value: 'No', label: 'No' }, { value: 'Yes', label: 'Yes' }]} />
            </div>
            <div className="flex flex-wrap gap-5">
              <Field label="Default Currency" keyName="default_currency" half
                options={[{ value: 'EUR', label: 'EUR' }, { value: 'USD', label: 'USD' }, { value: 'XAF', label: 'XAF' }]} />
              <Field label="Default Language" keyName="default_language" half
                options={[{ value: 'fr', label: 'Francais' }, { value: 'en', label: 'English' }]} />
            </div>
            <div className="flex flex-wrap gap-5">
              <Field label="Commission Rate (%)" keyName="commission_rate" type="number" half />
              <Field label="Minimum Fare" keyName="min_fare" type="number" half />
            </div>
            <div className="flex flex-wrap gap-5">
              <Field label="Auto-Assign Rides" keyName="auto_assign_rides" type="toggle" half />
              <Field label="Push Notifications" keyName="notifications_enabled" type="toggle" half />
            </div>
          </div>
        );
      case 'Email':
        return (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-5">
              <Field label="SMTP Host" keyName="smtp_host" half />
              <Field label="SMTP Port" keyName="smtp_port" half />
            </div>
            <div className="flex flex-wrap gap-5">
              <Field label="SMTP Username" keyName="smtp_user" half />
              <Field label="SMTP Password" keyName="smtp_password" type="password" half />
            </div>
            <Field label="Sender Email" keyName="sender_email" />
          </div>
        );
      case 'Appearance':
        return (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-5">
              <Field label="Primary Color" keyName="primary_color" type="color" half />
              <Field label="Secondary Color" keyName="secondary_color" type="color" half />
            </div>
          </div>
        );
      case 'SMS':
        return (
          <div className="space-y-5">
            <Field label="SMS Provider" keyName="sms_provider" options={[{ value: 'twilio', label: 'Twilio' }, { value: 'nexmo', label: 'Nexmo' }]} />
            <Field label="SMS API Key" keyName="sms_api_key" />
          </div>
        );
      case 'Maps Api Settings':
        return (
          <div className="space-y-5">
            <Field label="Maps API Key" keyName="maps_api_key" />
          </div>
        );
      case 'Payment':
        return (
          <div className="space-y-5">
            <Field label="Stripe Publishable Key" keyName="stripe_key" />
            <Field label="Stripe Secret Key" keyName="stripe_secret" type="password" />
          </div>
        );
      default:
        return (
          <div className="py-12 text-center text-gray-400">
            <p className="text-lg">Settings for "{activeTab}" will be available soon</p>
          </div>
        );
    }
  };

  return (
    <div className="p-6" data-testid="admin-settings-page">
      <h1 className="text-3xl font-light text-gray-800 mb-1" style={{ fontFamily: 'Georgia, Times, serif' }}>General Settings</h1>
      <hr className="border-gray-200 mb-5" />

      {/* Sub-header */}
      <div className="border border-gray-200 rounded-t px-4 py-3 bg-gray-50">
        <p className="text-sm font-medium text-gray-700">General Settings</p>
      </div>

      {/* Tabs */}
      <div className="border-x border-gray-200 px-4 pt-4 flex flex-wrap gap-x-1 gap-y-1">
        {settingsTabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-sm transition-colors rounded-t ${
              activeTab === tab ? 'bg-white border border-b-white border-gray-200 text-gray-800 font-medium -mb-px' : 'text-[#17a2b8] hover:text-gray-800'}`}
            data-testid={`tab-${tab.toLowerCase().replace(/\s+/g, '-')}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="border border-gray-200 rounded-b p-6">
        {renderTabContent()}
      </div>

      {/* Save Button */}
      <div className="flex justify-end mt-5">
        <button onClick={handleSave}
          className={`px-6 py-2.5 rounded text-sm font-bold transition-all ${
            saved ? 'bg-green-500 text-white' : 'bg-[#3b82f6] text-white hover:bg-blue-600'}`}
          data-testid="save-settings-btn">
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};

export default AdminSettings;
