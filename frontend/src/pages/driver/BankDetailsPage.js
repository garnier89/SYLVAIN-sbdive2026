/**
 * BankDetailsPage — V3Cube Pack B
 * Driver manages their bank account (account_holder, IBAN, BIC) for payouts.
 * IBAN is masked in GET response (only iban_last4 returned to UI).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Bank, Shield, Check } from '@phosphor-icons/react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';

const API = process.env.REACT_APP_BACKEND_URL;

const BankDetailsPage = () => {
  const navigate = useNavigate();
  const [existing, setExisting] = useState(null);
  const [form, setForm] = useState({ account_holder: '', iban: '', bic: '', bank_name: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/driver-pro/bank`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        if (d?.driver_id) {
          setExisting(d);
          setForm((f) => ({ ...f, account_holder: d.account_holder || '', bic: d.bic || '', bank_name: d.bank_name || '' }));
        }
      }
    } catch (e) { console.warn(e?.message || e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.account_holder || !form.iban || !form.bic) {
      return toast.error('Titulaire, IBAN et BIC requis');
    }
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/api/driver-pro/bank`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (r.ok) {
        toast.success('Coordonnées bancaires enregistrées');
        load();
        setForm({ ...form, iban: '' }); // clear IBAN field
      } else {
        const e = await r.json();
        toast.error(e.detail || 'Erreur');
      }
    } catch (e) { toast.error('Erreur réseau'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24" data-testid="bank-details-page">
      <div className="bg-gradient-to-br from-[#0B1426] to-[#1E293B] text-white px-4 pt-12 pb-6 rounded-b-3xl">
        <button onClick={() => navigate(-1)} className="mb-3"><ArrowLeft size={24} /></button>
        <h1 className="text-xl font-bold">Coordonnées bancaires</h1>
        <p className="text-xs text-gray-400 mt-1">Pour vos paiements hebdomadaires</p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {existing && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4" data-testid="bank-existing">
            <div className="flex items-center gap-2 mb-2">
              <Bank size={20} className="text-emerald-700" />
              <p className="font-bold text-emerald-900">Compte enregistré</p>
              {existing.verified && <Check size={16} className="text-emerald-700" />}
            </div>
            <p className="text-sm text-gray-700">Titulaire : {existing.account_holder}</p>
            <p className="text-sm text-gray-700 font-mono">{existing.iban_masked}</p>
            <p className="text-xs text-gray-500">BIC : {existing.bic} · {existing.bank_name || 'Banque non précisée'}</p>
            {!existing.verified && <p className="text-[10px] text-amber-700 mt-2">En attente de vérification (24-48h)</p>}
          </div>
        )}

        <div className="bg-white rounded-2xl p-4 shadow-sm" data-testid="bank-form">
          <h3 className="font-bold text-gray-900 mb-3">{existing ? 'Modifier' : 'Renseigner mes coordonnées'}</h3>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-gray-500 font-semibold uppercase">Titulaire du compte</label>
              <Input value={form.account_holder} onChange={(e) => setForm({ ...form, account_holder: e.target.value })} placeholder="Ex: Jean Dupont" data-testid="form-holder" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-semibold uppercase">IBAN</label>
              <Input value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value.toUpperCase() })} placeholder="FR76 1234 5678 9012 3456 7890 123" data-testid="form-iban" />
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                <Shield size={10} /> Stocké de manière sécurisée, masqué dans l&apos;app
              </p>
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-semibold uppercase">BIC / SWIFT</label>
              <Input value={form.bic} onChange={(e) => setForm({ ...form, bic: e.target.value.toUpperCase() })} placeholder="BNPAFRPPXXX" data-testid="form-bic" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-semibold uppercase">Banque (optionnel)</label>
              <Input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} placeholder="BNP Paribas" data-testid="form-bank" />
            </div>
            <Button onClick={save} className="w-full mt-2" disabled={submitting} data-testid="save-bank">
              {submitting ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BankDetailsPage;
