import React, { useState, useRef } from 'react';
import { UploadSimple, X, SpinnerGap, Image as ImageIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const uploadFile = async (file) => {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}/api/uploads/image`, { method: 'POST', credentials: 'include', body: fd });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.detail || 'Échec de l\'upload');
  }
  return (await res.json()).url; // /api/uploads/{id}
};

const src = (url) => (url && url.startsWith('/api/') ? `${API}${url}` : url);

/** Single image uploader with preview. */
export const ImageUpload = ({ value, onChange, label = 'Image', testId }) => {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try { const url = await uploadFile(file); onChange(url); toast.success('Image téléversée'); }
    catch (err) { toast.error(err.message); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
      <div className="flex items-center gap-3">
        <div className="w-20 h-20 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center flex-shrink-0 border border-gray-200">
          {value ? <img src={src(value)} alt="preview" className="w-full h-full object-cover" />
                 : <ImageIcon size={26} className="text-gray-300" />}
        </div>
        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 disabled:opacity-50" data-testid={testId}>
            {busy ? <SpinnerGap size={16} className="animate-spin" /> : <UploadSimple size={16} />}
            {busy ? 'Téléversement…' : value ? 'Changer' : 'Téléverser'}
          </button>
          {value && <button type="button" onClick={() => onChange('')} className="text-xs text-gray-400 hover:text-red-500 text-left">Retirer</button>}
        </div>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={pick} />
      </div>
    </div>
  );
};

/** Multi-image gallery uploader (array of urls). */
export const GalleryUpload = ({ value = [], onChange, label = 'Galerie', max = 8, testId }) => {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const pick = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    try {
      const urls = [];
      for (const f of files.slice(0, max - value.length)) urls.push(await uploadFile(f));
      onChange([...value, ...urls]); toast.success(`${urls.length} photo(s) ajoutée(s)`);
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label} ({value.length}/{max})</label>
      <div className="flex flex-wrap gap-2">
        {value.map((u, i) => (
          <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
            <img src={src(u)} alt={`g-${i}`} className="w-full h-full object-cover" />
            <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"><X size={11} className="text-white" /></button>
          </div>
        ))}
        {value.length < max && (
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}
            className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-blue-400" data-testid={testId}>
            {busy ? <SpinnerGap size={18} className="animate-spin" /> : <UploadSimple size={18} />}
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" onChange={pick} />
      </div>
    </div>
  );
};

export default ImageUpload;
