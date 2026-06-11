/**
 * SbMarketplacePage — Phase 6: student marketplace (C2C) + AI (Gemini).
 * Browse/buy student listings (Livres, Logement, Coloc, Matériel, Services),
 * AI smart search, and (verified students only) publish a listing with an
 * AI-suggested fair price + auto-generated description.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  CaretLeft, Storefront, MagnifyingGlass, Sparkle, Plus, X, Tag,
  BookOpen, House, UsersThree, Laptop, Wrench, ShoppingBag, Wallet, Camera,
} from '@phosphor-icons/react';
import { studentAPI } from '../../services/api';

const BRAND = '#5B21B6';
const CAT_ICONS = { livres: BookOpen, logement: House, coloc: UsersThree, materiel: Laptop, services: Wrench };
const COND_LABELS = { neuf: 'Neuf', tres_bon: 'Très bon état', bon: 'Bon état', use: 'Usé' };

const SbMarketplacePage = () => {
  const navigate = useNavigate();
  const [cats, setCats] = useState([]);
  const [activeCat, setActiveCat] = useState('');
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);

  // AI search
  const [aiQuery, setAiQuery] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReply, setAiReply] = useState('');

  // sheets
  const [sellOpen, setSellOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  const loadListings = (cat = activeCat, override) => {
    setLoading(true);
    studentAPI.mktListings({ ...(cat ? { category: cat } : {}) })
      .then((r) => setListings(override || r.data.listings || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    studentAPI.mktCategories().then((r) => setCats(r.data.categories || [])).catch(() => {});
    studentAPI.me().then((r) => setVerified(!!r.data.is_student)).catch(() => {});
    loadListings('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickCat = (slug) => {
    const next = activeCat === slug ? '' : slug;
    setActiveCat(next);
    setAiReply('');
    loadListings(next);
  };

  const runAiSearch = async () => {
    if (!aiQuery.trim()) return;
    setAiBusy(true); setAiReply('');
    try {
      const r = await studentAPI.mktAiSearch(aiQuery.trim());
      setAiReply(r.data.reply || '');
      setListings(r.data.listings || []);
      setActiveCat('');
    } catch (e) { toast.error(e?.response?.data?.detail || 'Recherche IA indisponible'); }
    finally { setAiBusy(false); }
  };

  return (
    <div className="mobile-container min-h-screen bg-[#F5F3FF] pb-24" data-testid="sb-marketplace-page">
      <div className="text-white px-4 pt-6 pb-8 rounded-b-3xl" style={{ background: `linear-gradient(135deg, ${BRAND}, #7C3AED)` }}>
        <button onClick={() => navigate('/sb-student')} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center mb-3" data-testid="mkt-back-btn"><CaretLeft size={20} /></button>
        <div className="flex items-center gap-2">
          <Storefront size={28} weight="fill" />
          <h1 className="text-2xl font-black">Marketplace étudiante</h1>
        </div>
        <p className="text-white/80 text-sm mt-1">Achète & vends entre étudiants. Payé via ton SB Pay.</p>
      </div>

      <div className="px-4 -mt-4 space-y-4">
        {/* AI search */}
        <div className="bg-white rounded-2xl p-3 shadow-sm" data-testid="mkt-ai-search">
          <div className="flex items-center gap-2 border border-violet-200 rounded-xl px-3 py-2.5 bg-violet-50/50">
            <Sparkle size={18} weight="fill" style={{ color: BRAND }} />
            <input
              value={aiQuery} onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runAiSearch()}
              placeholder="Recherche IA : « manuel de droit pas cher »…"
              className="flex-1 text-sm outline-none bg-transparent" data-testid="mkt-ai-input" />
            <button onClick={runAiSearch} disabled={aiBusy} className="text-xs font-bold text-white px-3 py-1.5 rounded-lg disabled:opacity-50" style={{ background: BRAND }} data-testid="mkt-ai-btn">
              {aiBusy ? '…' : 'Chercher'}
            </button>
          </div>
          {aiReply && <p className="text-xs text-gray-700 mt-2 px-1" data-testid="mkt-ai-reply">💡 {aiReply}</p>}
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" data-testid="mkt-categories">
          {cats.map((c) => {
            const Icon = CAT_ICONS[c.slug] || Tag;
            const on = activeCat === c.slug;
            return (
              <button key={c.slug} onClick={() => pickCat(c.slug)} data-testid={`mkt-cat-${c.slug}`}
                className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 rounded-full text-sm font-semibold border ${on ? 'text-white' : 'text-gray-600 bg-white border-gray-200'}`}
                style={on ? { background: BRAND, borderColor: BRAND } : {}}>
                <Icon size={16} weight={on ? 'fill' : 'regular'} /> {c.label}
              </button>
            );
          })}
        </div>

        {/* Listings */}
        {loading ? (
          <div className="p-6 text-gray-400 text-sm">Chargement…</div>
        ) : listings.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-400 text-sm" data-testid="mkt-empty">
            <Storefront size={36} className="mx-auto mb-2 text-gray-300" />
            Aucune annonce pour le moment.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3" data-testid="mkt-listings">
            {listings.map((l) => (
              <button key={l.id} onClick={() => setDetail(l)} className="bg-white rounded-2xl overflow-hidden shadow-sm text-left active:scale-[0.98] transition-transform" data-testid={`mkt-listing-${l.id}`}>
                <div className="h-28 bg-gray-100 flex items-center justify-center overflow-hidden">
                  {l.image_url ? <img src={l.image_url} alt={l.title} className="w-full h-full object-cover" />
                    : React.createElement(CAT_ICONS[l.category] || Tag, { size: 32, className: 'text-gray-300' })}
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-bold text-gray-900 line-clamp-2 leading-tight">{l.title}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{l.category_label} · {COND_LABELS[l.condition] || l.condition}</p>
                  <p className="font-black text-base mt-1" style={{ color: BRAND }}>{Number(l.price).toFixed(2)} €</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sell FAB */}
      <button onClick={() => setSellOpen(true)} className="fixed bottom-6 right-5 z-30 w-14 h-14 rounded-full text-white shadow-lg flex items-center justify-center" style={{ background: BRAND }} data-testid="mkt-sell-fab">
        <Plus size={26} weight="bold" />
      </button>

      {detail && <DetailSheet listing={detail} onClose={() => setDetail(null)} onBought={() => { setDetail(null); loadListings(); }} />}
      {sellOpen && <SellSheet verified={verified} cats={cats} onClose={() => setSellOpen(false)} onCreated={() => { setSellOpen(false); loadListings(); }} navigate={navigate} />}
    </div>
  );
};

const DetailSheet = ({ listing, onClose, onBought }) => {
  const [busy, setBusy] = useState(false);
  const buy = async () => {
    if (!window.confirm(`Acheter « ${listing.title} » pour ${Number(listing.price).toFixed(2)} € depuis votre SB Pay ?`)) return;
    setBusy(true);
    try {
      await studentAPI.mktBuy(listing.id);
      toast.success('Achat réussi ! Le vendeur a été notifié.');
      onBought();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec de l\'achat'); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onClose} data-testid="mkt-detail-sheet">
      <div className="w-full bg-white rounded-t-3xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          <div className="h-44 bg-gray-100 flex items-center justify-center overflow-hidden">
            {listing.image_url ? <img src={listing.image_url} alt={listing.title} className="w-full h-full object-cover" />
              : React.createElement(CAT_ICONS[listing.category] || Tag, { size: 48, className: 'text-gray-300' })}
          </div>
          <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-xs font-semibold" style={{ color: BRAND }}>{listing.category_label} · {COND_LABELS[listing.condition] || listing.condition}</p>
          <h2 className="text-lg font-black text-gray-900">{listing.title}</h2>
          <p className="text-2xl font-black" style={{ color: BRAND }}>{Number(listing.price).toFixed(2)} €</p>
          {listing.location && <p className="text-xs text-gray-500">📍 {listing.location}</p>}
          {listing.description && <p className="text-sm text-gray-700 whitespace-pre-line">{listing.description}</p>}
          <p className="text-xs text-gray-400">Vendu par {listing.seller_name}</p>
          {listing.status === 'sold' ? (
            <div className="w-full py-3 rounded-xl bg-gray-100 text-gray-400 text-center font-bold text-sm" data-testid="mkt-sold">Vendu</div>
          ) : (
            <button onClick={buy} disabled={busy} className="w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: BRAND }} data-testid="mkt-buy-btn">
              <Wallet size={18} weight="fill" /> {busy ? 'Achat…' : `Acheter · ${Number(listing.price).toFixed(2)} €`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const SellSheet = ({ verified, cats, onClose, onCreated, navigate }) => {
  const [form, setForm] = useState({ category: 'livres', title: '', condition: 'bon', price: '', description: '', location: '', image_url: null });
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const aiSuggest = async () => {
    if (!form.title.trim()) return toast.error('Donnez d\'abord un titre');
    setAiBusy(true);
    try {
      const r = await studentAPI.mktAiSuggest({ category: form.category, title: form.title.trim(), condition: form.condition, details: form.description });
      const d = r.data;
      setForm((f) => ({ ...f, description: d.description || f.description, price: f.price || (d.suggested_price ?? '') }));
      toast.success(`Prix suggéré : ${d.suggested_price} € (${d.price_low}–${d.price_high} €)`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'IA indisponible'); }
    finally { setAiBusy(false); }
  };

  const pickImage = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try { const r = await studentAPI.mktUploadImage(file); set('image_url', r.data.url); toast.success('Photo ajoutée'); }
      catch { toast.error('Échec de l\'upload'); }
    };
    input.click();
  };

  const submit = async () => {
    if (!form.title.trim()) return toast.error('Titre requis');
    if (!form.price || Number(form.price) < 0) return toast.error('Prix invalide');
    setBusy(true);
    try {
      await studentAPI.mktCreate({ ...form, price: Number(form.price) });
      toast.success('Annonce publiée 🎉');
      onCreated();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec de la publication'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={onClose} data-testid="mkt-sell-sheet">
      <div className="w-full bg-white rounded-t-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-black text-gray-900">Publier une annonce</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"><X size={18} /></button>
        </div>

        {!verified ? (
          <div className="p-6 text-center space-y-3" data-testid="mkt-sell-locked">
            <ShoppingBag size={40} className="mx-auto text-gray-300" />
            <p className="text-sm text-gray-600">Publier sur la marketplace étudiante est réservé aux <b>étudiants vérifiés</b>.</p>
            <button onClick={() => navigate('/sb-student')} className="w-full py-3 rounded-xl font-bold text-white" style={{ background: BRAND }} data-testid="mkt-verify-cta">Vérifier mon statut</button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500">Catégorie</label>
              <div className="flex gap-2 overflow-x-auto pb-1 mt-1">
                {cats.map((c) => (
                  <button key={c.slug} onClick={() => set('category', c.slug)} data-testid={`mkt-sell-cat-${c.slug}`}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold border ${form.category === c.slug ? 'text-white' : 'text-gray-600 bg-white border-gray-200'}`}
                    style={form.category === c.slug ? { background: BRAND, borderColor: BRAND } : {}}>{c.label}</button>
                ))}
              </div>
            </div>

            <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Titre (ex. Manuel de droit civil L1)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" data-testid="mkt-sell-title" />

            <div className="flex gap-2">
              <select value={form.condition} onChange={(e) => set('condition', e.target.value)} className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-white" data-testid="mkt-sell-condition">
                {Object.entries(COND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input value={form.price} onChange={(e) => set('price', e.target.value)} type="number" min="0" placeholder="Prix €"
                className="w-28 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" data-testid="mkt-sell-price" />
            </div>

            <div className="relative">
              <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={4} placeholder="Description…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none resize-none" data-testid="mkt-sell-description" />
              <button onClick={aiSuggest} disabled={aiBusy} className="absolute bottom-2 right-2 flex items-center gap-1 text-xs font-bold text-white px-2.5 py-1.5 rounded-lg disabled:opacity-50" style={{ background: BRAND }} data-testid="mkt-sell-ai-btn">
                <Sparkle size={13} weight="fill" /> {aiBusy ? 'IA…' : 'Prix & texte IA'}
              </button>
            </div>

            <input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Lieu (ex. Campus Schœlcher)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none" data-testid="mkt-sell-location" />

            <button onClick={pickImage} className="w-full flex items-center justify-center gap-2 border border-dashed border-gray-300 rounded-xl py-3 text-sm text-gray-600" data-testid="mkt-sell-image">
              <Camera size={18} /> {form.image_url ? 'Photo ajoutée ✓ — changer' : 'Ajouter une photo (optionnel)'}
            </button>

            <button onClick={submit} disabled={busy} className="w-full py-3.5 rounded-xl font-bold text-white disabled:opacity-50" style={{ background: BRAND }} data-testid="mkt-sell-submit">
              {busy ? 'Publication…' : 'Publier l\'annonce'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SbMarketplacePage;
