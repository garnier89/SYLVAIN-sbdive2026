import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretLeft, LockKey, Eye, EyeSlash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { authAPI } from '../../services/api';

const DriverChangePasswordPage = () => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (next.length < 6) return toast.error('Le nouveau mot de passe doit faire au moins 6 caractères');
    if (next !== confirm) return toast.error('Les mots de passe ne correspondent pas');
    setSaving(true);
    try {
      await authAPI.changePassword({ current_password: current, new_password: next });
      toast.success('Mot de passe modifié avec succès');
      setTimeout(() => navigate(-1), 800);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Échec de la modification');
    } finally { setSaving(false); }
  };

  const field = (label, value, setValue, testId) => (
    <div>
      <label className="text-xs font-bold text-gray-500 uppercase">{label}</label>
      <div className="relative mt-1">
        <input type={show ? 'text' : 'password'} value={value} onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-xl border-2 border-gray-200 px-3 py-3 text-sm focus:border-[#FF5000] outline-none pr-10" data-testid={testId} />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
          {show ? <EyeSlash size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="mobile-container min-h-screen bg-[#F2F2F7]" data-testid="driver-change-password-page">
      <div className="bg-[#0B1426] text-white px-4 pt-6 pb-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center" data-testid="change-password-back-btn"><CaretLeft size={20} /></button>
        <div className="flex items-center gap-2">
          <LockKey size={20} weight="fill" className="text-[#FF5000]" />
          <h1 className="text-lg font-bold">Changer le mot de passe</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-2xl p-4 space-y-4">
          {field('Mot de passe actuel', current, setCurrent, 'current-password-input')}
          {field('Nouveau mot de passe', next, setNext, 'new-password-input')}
          {field('Confirmer le nouveau mot de passe', confirm, setConfirm, 'confirm-password-input')}
        </div>
        <button onClick={submit} disabled={saving || !current || !next} className="w-full py-3.5 rounded-xl font-black disabled:opacity-50" style={{ backgroundColor: '#FF5000', color: '#0B1426' }} data-testid="change-password-submit-btn">
          {saving ? 'Modification…' : 'Modifier le mot de passe'}
        </button>
      </div>
    </div>
  );
};

export default DriverChangePasswordPage;
