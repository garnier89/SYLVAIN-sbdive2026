import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import { ArrowLeft, UploadSimple, X, User as UserIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';

const LANGUAGES = [
  { code: 'fr', label: 'Français' }, { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' }, { code: 'pt', label: 'Português' },
];
const CURRENCIES = ['EUR', 'USD', 'XAF', 'XOF', 'GBP', 'INR'];
const COUNTRIES = [
  { code: 'FR', name: 'France', dial: '+33' }, { code: 'MQ', name: 'Martinique', dial: '+596' },
  { code: 'GP', name: 'Guadeloupe', dial: '+590' }, { code: 'GF', name: 'Guyane', dial: '+594' },
  { code: 'RE', name: 'Réunion', dial: '+262' }, { code: 'BE', name: 'Belgique', dial: '+32' },
  { code: 'CH', name: 'Suisse', dial: '+41' }, { code: 'CI', name: "Côte d'Ivoire", dial: '+225' },
  { code: 'SN', name: 'Sénégal', dial: '+221' }, { code: 'CM', name: 'Cameroun', dial: '+237' },
  { code: 'MA', name: 'Maroc', dial: '+212' }, { code: 'US', name: 'États-Unis', dial: '+1' },
  { code: 'GB', name: 'Royaume-Uni', dial: '+44' },
];

const empty = {
  first_name: '', last_name: '', email: '', password: '',
  gender: '', avatar_url: '',
  country: 'FR', phone_code: '+33', phone: '',
  language: 'fr', currency: 'EUR',
  is_active: true,
};

const AdminUserEdit = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState('');

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const r = await adminAPI.getUser(id);
      const u = r.data;
      const fn = u.first_name || (u.name || '').split(' ')[0] || '';
      const ln = u.last_name || (u.name || '').split(' ').slice(1).join(' ');
      const code = u.phone_code || (u.phone && u.phone.startsWith('+') ? u.phone.slice(0, 4) : '+33');
      const localPhone = u.phone ? (u.phone.startsWith(code) ? u.phone.slice(code.length) : u.phone) : '';
      setForm({
        first_name: fn,
        last_name: ln,
        email: u.email || '',
        password: '',
        gender: u.gender || '',
        avatar_url: u.avatar_url || '',
        country: u.country || 'FR',
        phone_code: code,
        phone: localPhone,
        language: u.language || 'fr',
        currency: u.currency || 'EUR',
        is_active: !u.is_suspended,
      });
      if (u.avatar_url) setAvatarPreview(u.avatar_url);
    } catch (e) {
      toast.error("Impossible de charger l'utilisateur");
      navigate('/admin/users');
    }
    setLoading(false);
  }, [id, isNew, navigate]);
  useEffect(() => { load(); }, [load]);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const reset = () => { if (isNew) setForm(empty); else load(); setAvatarPreview(''); };

  const onAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/svg+xml', 'image/bmp'].includes(file.type)) {
      toast.error('Format invalide (jpg, png, webp, bmp, heic, svg)'); return;
    }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image trop volumineuse (max 5 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setAvatarPreview(dataUrl);
      setField('avatar_url', dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.first_name || !form.email) {
      toast.error('Prénom et email sont requis'); return;
    }
    if (isNew && !form.password) { toast.error('Mot de passe requis pour création'); return; }
    setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      if (isNew) {
        const r = await adminAPI.createUser(payload);
        toast.success('Utilisateur créé');
        navigate(`/admin/users/${r.data.id}`, { replace: true });
      } else {
        await adminAPI.updateUser(id, payload);
        toast.success('Utilisateur mis à jour');
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Erreur');
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-400" data-testid="user-edit-loading">Chargement...</div>;
  }

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen" data-testid="admin-user-edit-page">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNew ? "Ajouter un utilisateur" : `Modifier ${form.first_name || form.email}`}
          </h1>
          <p className="text-sm text-gray-500">Gérez le profil et les coordonnées de ce passager.</p>
        </div>
        <button onClick={() => navigate('/admin/users')}
          className="px-4 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2" data-testid="back-listing-btn">
          <ArrowLeft size={14} /> Retour à la liste
        </button>
      </div>

      <form onSubmit={submit} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Prénom <span className="text-red-500">*</span></label>
            <input value={form.first_name} onChange={(e) => setField('first_name', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" data-testid="form-first-name" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Nom <span className="text-red-500">*</span></label>
            <input value={form.last_name} onChange={(e) => setField('last_name', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" data-testid="form-last-name" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" data-testid="form-email" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Mot de passe {isNew ? <span className="text-red-500">*</span> : <span className="text-gray-400 font-normal">(laisser vide pour conserver)</span>}
            </label>
            <input type="password" value={form.password} onChange={(e) => setField('password', e.target.value)}
              placeholder={isNew ? 'Mot de passe' : '••••••••'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" data-testid="form-password" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">Genre</label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="gender" value="male" checked={form.gender === 'male'} onChange={(e) => setField('gender', e.target.value)} data-testid="gender-male" /> Homme
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="gender" value="female" checked={form.gender === 'female'} onChange={(e) => setField('gender', e.target.value)} data-testid="gender-female" /> Femme
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" name="gender" value="other" checked={form.gender === 'other'} onChange={(e) => setField('gender', e.target.value)} data-testid="gender-other" /> Autre
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">Photo de profil</label>
          <label htmlFor="avatar-input" className="block border-2 border-dashed border-blue-200 bg-blue-50/30 rounded-2xl p-6 cursor-pointer hover:border-blue-400 transition-colors" data-testid="avatar-dropzone">
            {avatarPreview ? (
              <div className="flex items-center gap-4">
                <img src={avatarPreview} alt="aperçu" className="w-20 h-20 rounded-xl object-cover" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">Photo sélectionnée</p>
                  <p className="text-xs text-gray-500">Cliquez pour changer</p>
                </div>
                <button type="button" onClick={(e) => { e.preventDefault(); setAvatarPreview(''); setField('avatar_url', ''); }}
                  className="text-red-500 hover:text-red-700" data-testid="avatar-remove"><X size={20} /></button>
              </div>
            ) : (
              <div className="text-center">
                <UploadSimple size={28} className="mx-auto text-gray-400 mb-1" />
                <p className="text-sm font-medium text-gray-700">Glissez-déposez ou cliquez pour téléverser</p>
                <p className="text-xs text-gray-400 mt-1">JPG / PNG recommandé. Extensions valides : jpg, jpeg, png, bmp, heic, svg.</p>
              </div>
            )}
            <input id="avatar-input" type="file" accept="image/*" onChange={onAvatarChange} className="hidden" data-testid="avatar-input" />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Pays <span className="text-red-500">*</span></label>
            <select value={form.country} onChange={(e) => {
              const c = COUNTRIES.find(x => x.code === e.target.value);
              setField('country', e.target.value);
              if (c) setField('phone_code', c.dial);
            }} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white" data-testid="form-country">
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Téléphone <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <input value={form.phone_code} onChange={(e) => setField('phone_code', e.target.value)}
                className="w-20 border border-gray-300 rounded-lg px-3 py-2.5 text-sm" data-testid="form-phone-code" />
              <input value={form.phone} onChange={(e) => setField('phone', e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm" data-testid="form-phone" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Langue <span className="text-red-500">*</span></label>
            <select value={form.language} onChange={(e) => setField('language', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white" data-testid="form-language">
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Devise <span className="text-red-500">*</span></label>
            <select value={form.currency} onChange={(e) => setField('currency', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white" data-testid="form-currency">
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-2">Statut</label>
          <button type="button" onClick={() => setField('is_active', !form.is_active)}
            className={`relative inline-flex items-center h-9 w-28 rounded-md transition-colors ${form.is_active ? 'bg-gray-100' : 'bg-gray-200'}`}
            data-testid="form-status-toggle">
            <span className={`absolute right-2 text-xs font-bold uppercase px-2 py-1 rounded ${form.is_active ? 'bg-emerald-500 text-white' : 'bg-gray-400 text-white left-2 right-auto'}`}>
              {form.is_active ? 'Actif' : 'Inactif'}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 rounded-lg bg-emerald-500 text-white font-semibold disabled:opacity-50" data-testid="form-submit-btn">
            {saving ? 'Enregistrement...' : (isNew ? 'Créer' : 'Mettre à jour')}
          </button>
          <button type="button" onClick={reset}
            className="px-6 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-semibold" data-testid="form-reset-btn">
            Réinitialiser
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminUserEdit;
