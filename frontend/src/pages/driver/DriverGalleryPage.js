/**
 * DriverGalleryPage — V3Cube Pack B
 * Driver can upload up to 20 photos (vehicle / ID / other) with caption.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash, Image as ImageIcon, Camera } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const CATEGORIES = [
  { key: 'vehicle', label: 'Véhicule', color: 'bg-amber-100 text-amber-700' },
  { key: 'id', label: 'Identité', color: 'bg-blue-100 text-blue-700' },
  { key: 'other', label: 'Autres', color: 'bg-gray-100 text-gray-700' },
];

const DriverGalleryPage = () => {
  const navigate = useNavigate();
  const fileInput = useRef(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('vehicle');
  const [caption, setCaption] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/driver-pro/gallery`, { credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        setItems(d.items || []);
      }
    } catch (e) { console.warn('gallery load:', e?.message || e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('Fichier trop volumineux (max 5 Mo)');
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const r = await fetch(`${API}/api/driver-pro/gallery`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_url: ev.target.result, mime_type: file.type, caption, category }),
        });
        if (r.ok) { toast.success('Photo ajoutée'); setCaption(''); load(); }
        else { const e = await r.json(); toast.error(e.detail || 'Erreur'); }
      } catch (e) { toast.error('Erreur réseau'); }
      finally { setUploading(false); }
    };
    reader.readAsDataURL(file);
  };

  const remove = async (id) => {
    if (!window.confirm('Supprimer cette photo ?')) return;
    try {
      const r = await fetch(`${API}/api/driver-pro/gallery/${id}`, { method: 'DELETE', credentials: 'include' });
      if (r.ok) { toast.success('Supprimée'); load(); }
    } catch (e) { toast.error('Erreur'); }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24" data-testid="gallery-page">
      <div className="bg-gradient-to-br from-pink-700 to-fuchsia-900 text-white px-4 pt-12 pb-6 rounded-b-3xl">
        <button onClick={() => navigate(-1)} className="mb-3" data-testid="back-button"><ArrowLeft size={24} /></button>
        <h1 className="text-xl font-bold flex items-center gap-2"><ImageIcon size={22} /> Ma galerie</h1>
        <p className="text-xs text-pink-100 mt-1">{items.length}/20 photos enregistrées</p>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {/* Upload form */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border-2 border-dashed border-pink-200" data-testid="upload-form">
          <h3 className="font-bold text-gray-900 mb-3 text-sm">Ajouter une photo</h3>
          <div className="flex gap-2 mb-3 flex-wrap">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                data-testid={`cat-${c.key}`}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${category === c.key ? 'bg-pink-600 text-white' : c.color}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Description (optionnel)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3"
            data-testid="caption-input"
            maxLength={120}
          />
          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} data-testid="file-input" />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading || items.length >= 20}
            className="w-full bg-pink-600 text-white py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            data-testid="upload-button"
          >
            <Camera size={18} /> {uploading ? 'Envoi...' : 'Choisir une photo'}
          </button>
        </div>

        {/* Gallery grid */}
        {loading && <p className="text-center text-gray-400 py-8 animate-pulse text-sm">Chargement...</p>}
        {!loading && items.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <ImageIcon size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-600 font-medium">Aucune photo</p>
            <p className="text-xs text-gray-400 mt-1">Ajoutez votre première photo ci-dessus</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {items.map((it) => (
            <div key={it.id} className="bg-white rounded-2xl overflow-hidden shadow-sm" data-testid={`photo-${it.id}`}>
              <div className="aspect-square bg-gray-100 relative">
                <img src={it.file_url} alt={it.caption} className="w-full h-full object-cover" />
                <button onClick={() => remove(it.id)} className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5" data-testid={`remove-${it.id}`}>
                  <Trash size={14} />
                </button>
                <span className={`absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full font-bold ${CATEGORIES.find((c) => c.key === it.category)?.color || 'bg-gray-100 text-gray-700'}`}>
                  {CATEGORIES.find((c) => c.key === it.category)?.label || it.category}
                </span>
              </div>
              {it.caption && <p className="text-xs text-gray-700 px-2 py-1.5 truncate">{it.caption}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DriverGalleryPage;
