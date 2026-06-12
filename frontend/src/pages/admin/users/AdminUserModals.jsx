import React, { useState, useEffect } from 'react';
import { X, FileText, Trash, UploadSimple, PlusCircle, MinusCircle } from '@phosphor-icons/react';

/**
 * Wallet adjustment modal — explicit CRÉDITER / DÉBITER mode (amount stays
 * positive; the sign is derived from the chosen mode). Self-contained state.
 * Reusable across the Users CRM and the Drivers CRM.
 *   onSubmit(signedAmount: number, note: string)
 */
export const CreditModal = ({ target, saving, onClose, onSubmit }) => {
  const [mode, setMode] = useState('credit'); // 'credit' | 'debit'
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (target) { setMode('credit'); setAmount(''); setNote(''); }
  }, [target]);

  if (!target) return null;
  const isDebit = mode === 'debit';
  const current = target.wallet_balance != null ? target.wallet_balance : 0;
  const amt = parseFloat(amount);
  const preview = !isNaN(amt) && amt > 0 ? current + (isDebit ? -amt : amt) : current;

  const submit = () => {
    const v = parseFloat(amount);
    if (isNaN(v) || v <= 0) return;
    onSubmit(isDebit ? -Math.abs(v) : Math.abs(v), note);
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()} data-testid="credit-modal">
        <div className="bg-gray-900 text-white px-5 py-4 flex items-center justify-between">
          <h2 className="text-base font-bold">Ajuster le solde</h2>
          <button onClick={onClose} className="bg-white text-gray-900 rounded-full w-7 h-7 flex items-center justify-center" data-testid="credit-close-x">
            <X size={14} weight="bold" />
          </button>
        </div>
        <div className="p-5">
          <p className="text-sm text-gray-700 mb-1">
            <strong>{target.name || target.email}</strong>
            {target.role ? <span className="text-xs text-gray-400"> · {target.role}</span> : null}
          </p>
          <p className="text-xs text-gray-500 mb-4">Solde actuel : <strong>{current.toFixed(2)} €</strong></p>

          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button type="button" onClick={() => setMode('credit')} data-testid="mode-credit"
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${!isDebit ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300'}`}>
              <PlusCircle size={16} weight="fill" /> Créditer
            </button>
            <button type="button" onClick={() => setMode('debit')} data-testid="mode-debit"
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${isDebit ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300'}`}>
              <MinusCircle size={16} weight="fill" /> Débiter
            </button>
          </div>

          <label className="block text-sm font-semibold text-gray-800 mb-1.5">Montant (€)</label>
          <input type="number" step="0.01" min="0" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="ex: 10.00" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mb-1" data-testid="credit-amount" />
          {!isNaN(amt) && amt > 0 && (
            <p className="text-xs mb-3" data-testid="credit-preview">
              Nouveau solde : <strong className={preview < 0 ? 'text-red-600' : 'text-emerald-700'}>{preview.toFixed(2)} €</strong>
            </p>
          )}
          <label className="block text-sm font-semibold text-gray-800 mb-1.5 mt-2">Note <span className="font-normal text-xs text-gray-400">(optionnel)</span></label>
          <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={isDebit ? 'Raison du débit' : 'Raison du crédit'} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm" data-testid="credit-note" />
        </div>
        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-5 py-2.5 rounded-full border border-gray-300 text-sm font-semibold text-gray-700" data-testid="credit-close-btn">Fermer</button>
          <button onClick={submit} disabled={saving || !amount || parseFloat(amount) <= 0}
            className={`px-6 py-2.5 rounded-full text-white text-sm font-semibold disabled:opacity-50 ${isDebit ? 'bg-red-600' : 'bg-emerald-600'}`} data-testid="credit-save-btn">
            {saving ? 'Enregistrement...' : (isDebit ? 'Débiter' : 'Créditer')}
          </button>
        </div>
      </div>
    </div>
  );
};

/** User documents viewer + uploader modal. State is owned by the parent. */
export const DocumentsModal = ({ target, data, loading, onClose, onUpload, onRemoveDoc }) => {
  if (!target) return null;
  return (
    <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="docs-modal">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-gray-900" data-testid="docs-modal-title">Documents de {target.name || target.email}</h2>
          <div className="flex items-center gap-2">
            <label htmlFor="admin-upload-doc-input" className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold flex items-center gap-1.5 cursor-pointer" data-testid="upload-doc-btn">
              <UploadSimple size={14} weight="bold" /> Ajouter
            </label>
            <input id="admin-upload-doc-input" type="file" accept="image/*,application/pdf" className="hidden" onChange={onUpload} data-testid="upload-doc-input" />
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-cyan-500 text-white text-sm font-semibold" data-testid="docs-close-btn">Fermer</button>
          </div>
        </div>
        <div className="p-6">
          {loading && <div className="text-center text-gray-400 py-10">Chargement...</div>}
          {!loading && data && data.documents.length === 0 && (
            <div className="text-center py-12 text-gray-500" data-testid="no-docs-msg">
              <FileText size={40} className="mx-auto text-gray-300 mb-2" />
              <p className="text-base font-semibold">Aucun document trouvé</p>
              <p className="text-xs mt-1">Cliquez sur « Ajouter » pour téléverser un document pour cet utilisateur.</p>
            </div>
          )}
          {!loading && data && data.documents.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.documents.map((d) => (
                <div key={d.id} className="border border-gray-200 rounded-xl overflow-hidden flex flex-col" data-testid={`doc-card-${d.id}`}>
                  <div className="bg-gray-50 aspect-video flex items-center justify-center">
                    {d.mime_type && d.mime_type.startsWith('image/') ? (
                      <a href={d.file_url} target="_blank" rel="noreferrer"><img src={d.file_url} alt={d.label} className="max-h-full max-w-full object-contain" /></a>
                    ) : (
                      <a href={d.file_url} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 text-gray-500"><FileText size={32} /> <span className="text-xs">Ouvrir</span></a>
                    )}
                  </div>
                  <div className="p-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate" title={d.label}>{d.label}</p>
                      <p className="text-[11px] text-gray-400">{d.type}{d.status ? ` · ${d.status}` : ''}</p>
                    </div>
                    {!d.id.startsWith('profile_') && (
                      <button onClick={() => onRemoveDoc(d.id)} className="text-gray-400 hover:text-red-600" data-testid={`delete-doc-${d.id}`} title="Supprimer"><Trash size={14} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
