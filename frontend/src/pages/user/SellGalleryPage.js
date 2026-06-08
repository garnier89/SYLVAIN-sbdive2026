import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, IdentificationCard, House, ShieldCheck, Hourglass, XCircle, Camera, Plus, Trash, Tag } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { kycAPI, marketplaceAPI } from '../../services/api';

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => resolve(e.target.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const SellGalleryPage = () => {
  const navigate = useNavigate();
  const [kyc, setKyc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cni, setCni] = useState(null);
  const [proof, setProof] = useState(null);
  const [fullName, setFullName] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const cniRef = useRef(null);
  const proofRef = useRef(null);

  // Listing form
  const [listing, setListing] = useState({ title: '', price: '', category: 'general', description: '' });
  const [listingImg, setListingImg] = useState(null);
  const [posting, setPosting] = useState(false);
  const [myListings, setMyListings] = useState([]);
  const listingImgRef = useRef(null);

  const reload = async () => {
    try {
      const r = await kycAPI.me();
      setKyc(r.data);
      if (r.data?.can_sell) {
        const m = await marketplaceAPI.myListings();
        setMyListings(m.data?.listings || []);
      }
    } catch { setKyc({ status: 'none', can_sell: false }); }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await kycAPI.me();
        if (!alive) return;
        setKyc(r.data);
        if (r.data?.can_sell) {
          const m = await marketplaceAPI.myListings();
          if (!alive) return;
          setMyListings(m.data?.listings || []);
        }
      } catch { if (alive) setKyc({ status: 'none', can_sell: false }); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const pickDoc = async (file, setter) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Fichier trop volumineux (max 5 Mo)'); return; }
    setter(await fileToDataUrl(file));
  };

  const submitKyc = async () => {
    if (!cni || !proof) { toast.error('Ajoutez la CNI et le justificatif de domicile'); return; }
    setSubmitting(true);
    try {
      await kycAPI.submit({ cni_url: cni, proof_url: proof, full_name: fullName, address });
      toast.success('Documents soumis. En attente de validation par l\u2019administrateur.');
      setCni(null); setProof(null);
      reload();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Erreur lors de l\u2019envoi'); }
    finally { setSubmitting(false); }
  };

  const postListing = async () => {
    if (!listing.title.trim() || !listing.price) { toast.error('Titre et prix requis'); return; }
    setPosting(true);
    try {
      await marketplaceAPI.createListing({
        title: listing.title.trim(),
        price: Number(listing.price),
        category: listing.category,
        description: listing.description,
        type: 'items',
        listing_type: 'sell',
        images: listingImg ? [listingImg] : [],
      });
      toast.success('Article publié sur le Marketplace !');
      setListing({ title: '', price: '', category: 'general', description: '' });
      setListingImg(null);
      reload();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Publication impossible'); }
    finally { setPosting(false); }
  };

  const removeListing = async (id) => {
    if (!window.confirm('Supprimer cette annonce ?')) return;
    try { await marketplaceAPI.deleteListing(id); toast.success('Annonce supprimée'); reload(); }
    catch { toast.error('Suppression impossible'); }
  };

  const status = kyc?.status || 'none';

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24" data-testid="sell-gallery-page">
      <div className="bg-gradient-to-br from-emerald-700 to-teal-900 text-white px-4 pt-12 pb-6 rounded-b-3xl">
        <button onClick={() => navigate(-1)} className="mb-3" data-testid="back-button"><ArrowLeft size={24} /></button>
        <h1 className="text-2xl font-bold">Gérer ma galerie</h1>
        <p className="text-sm text-white/80 mt-1">Vendez vos articles et proposez vos prestations.</p>
      </div>

      <div className="px-4 -mt-3">
        {loading ? (
          <div className="py-16 flex justify-center"><div className="w-8 h-8 border-3 rounded-full animate-spin" style={{ borderColor: '#e5e7eb', borderTopColor: '#0d9488' }} /></div>
        ) : kyc?.can_sell ? (
          <>
            {/* Verified — create listing */}
            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4 flex items-center gap-2 text-emerald-700" data-testid="kyc-verified-banner">
              <ShieldCheck size={22} weight="fill" /> <span className="text-sm font-semibold">Identité vérifiée — vous pouvez vendre.</span>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
              <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2"><Plus size={18} /> Ajouter un article</h2>
              <input value={listing.title} onChange={(e) => setListing({ ...listing, title: e.target.value })} placeholder="Titre de l'article" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-2" data-testid="listing-title" />
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="relative">
                  <Tag size={15} className="absolute left-3 top-3 text-gray-400" />
                  <input type="number" value={listing.price} onChange={(e) => setListing({ ...listing, price: e.target.value })} placeholder="Prix (€)" className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2.5 text-sm" data-testid="listing-price" />
                </div>
                <select value={listing.category} onChange={(e) => setListing({ ...listing, category: e.target.value })} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm" data-testid="listing-category">
                  <option value="general">Divers</option>
                  <option value="electronics">Électronique</option>
                  <option value="fashion">Mode</option>
                  <option value="home">Maison</option>
                  <option value="services">Prestations</option>
                </select>
              </div>
              <textarea value={listing.description} onChange={(e) => setListing({ ...listing, description: e.target.value })} placeholder="Description" rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-2" data-testid="listing-description" />
              <input ref={listingImgRef} type="file" accept="image/*" hidden onChange={(e) => pickDoc(e.target.files?.[0], setListingImg)} />
              <button onClick={() => listingImgRef.current?.click()} className="w-full border-2 border-dashed border-gray-200 rounded-xl py-2.5 text-sm text-gray-500 flex items-center justify-center gap-2 mb-3" data-testid="listing-photo-btn">
                <Camera size={16} /> {listingImg ? 'Photo ajoutée ✓' : 'Ajouter une photo'}
              </button>
              <button onClick={postListing} disabled={posting} className="w-full bg-emerald-600 text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50" data-testid="post-listing-btn">
                {posting ? 'Publication…' : 'Publier l\u2019article'}
              </button>
            </div>

            <h2 className="text-sm font-bold text-gray-700 mb-2 px-1">Mes annonces ({myListings.length})</h2>
            {myListings.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Aucune annonce pour le moment.</p>
            ) : (
              <div className="space-y-2" data-testid="my-listings">
                {myListings.map((l) => (
                  <div key={l.id} className="bg-white rounded-2xl p-3 shadow-sm flex items-center gap-3" data-testid={`my-listing-${l.id}`}>
                    {l.images?.[0] ? <img src={l.images[0]} alt={l.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" /> : <div className="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900 truncate">{l.title}</p>
                      <p className="text-xs text-emerald-600 font-semibold">{l.price} {l.currency || 'EUR'}</p>
                    </div>
                    <button onClick={() => removeListing(l.id)} className="text-gray-300 hover:text-red-500" data-testid={`delete-listing-${l.id}`}><Trash size={18} /></button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* Not verified — KYC flow */}
            {status === 'pending' && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-center gap-2 text-amber-700" data-testid="kyc-pending-banner">
                <Hourglass size={22} weight="fill" /> <span className="text-sm font-semibold">Documents en cours de vérification par l’administrateur.</span>
              </div>
            )}
            {status === 'rejected' && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 text-red-700" data-testid="kyc-rejected-banner">
                <div className="flex items-center gap-2 font-semibold text-sm"><XCircle size={22} weight="fill" /> Documents refusés</div>
                {kyc?.reject_reason && <p className="text-xs mt-1">{kyc.reject_reason}</p>}
                <p className="text-xs mt-1">Veuillez soumettre à nouveau vos documents.</p>
              </div>
            )}

            {status !== 'pending' && (
              <div className="bg-white rounded-2xl p-4 shadow-sm" data-testid="kyc-form">
                <div className="flex items-center gap-2 text-gray-900 mb-1">
                  <ShieldCheck size={22} weight="fill" className="text-emerald-600" />
                  <h2 className="text-base font-bold">Vérification d’identité</h2>
                </div>
                <p className="text-xs text-gray-500 mb-4">Pour vendre vos articles ou proposer vos prestations, vérifiez votre identité. L’administrateur validera vos documents.</p>

                <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nom complet (tel que sur la CNI)" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-2" data-testid="kyc-fullname" />
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adresse de domicile" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3" data-testid="kyc-address" />

                <input ref={cniRef} type="file" accept="image/*" hidden onChange={(e) => pickDoc(e.target.files?.[0], setCni)} />
                <button onClick={() => cniRef.current?.click()} className={`w-full border-2 border-dashed rounded-xl py-3 text-sm flex items-center justify-center gap-2 mb-2 ${cni ? 'border-emerald-300 text-emerald-600' : 'border-gray-200 text-gray-500'}`} data-testid="kyc-cni-btn">
                  <IdentificationCard size={18} /> {cni ? "Carte d'identité ajoutée ✓" : "Carte d'identité (CNI)"}
                </button>

                <input ref={proofRef} type="file" accept="image/*" hidden onChange={(e) => pickDoc(e.target.files?.[0], setProof)} />
                <button onClick={() => proofRef.current?.click()} className={`w-full border-2 border-dashed rounded-xl py-3 text-sm flex items-center justify-center gap-2 mb-4 ${proof ? 'border-emerald-300 text-emerald-600' : 'border-gray-200 text-gray-500'}`} data-testid="kyc-proof-btn">
                  <House size={18} /> {proof ? 'Justificatif ajouté ✓' : 'Justificatif de domicile'}
                </button>

                <button onClick={submitKyc} disabled={submitting || !cni || !proof} className="w-full bg-emerald-600 text-white rounded-xl py-3 font-bold text-sm disabled:opacity-50" data-testid="kyc-submit-btn">
                  {submitting ? 'Envoi…' : 'Soumettre pour vérification'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SellGalleryPage;
