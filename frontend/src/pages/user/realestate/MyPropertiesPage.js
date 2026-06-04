import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { realEstateAPI } from '../../../services/api';
import { ArrowLeft, Plus, PencilSimple, Trash, Buildings, Envelope, CurrencyEur, Phone } from '@phosphor-icons/react';
import { fmtPrice, catLabel, STATUS_META } from './realEstateConstants';

const MyPropertiesPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState('listings');
  const [listings, setListings] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openInq, setOpenInq] = useState(null); // listing id -> inquiries

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, i] = await Promise.all([realEstateAPI.myListings(), realEstateAPI.myInquiries()]);
      setListings(l.data || []); setInquiries(i.data || []);
    } catch { toast.error('Erreur de chargement'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (id, status) => { try { await realEstateAPI.setStatus(id, status); toast.success('Statut mis à jour'); load(); } catch { toast.error('Échec'); } };
  const remove = async (id) => { if (!window.confirm('Supprimer cette annonce ?')) return; try { await realEstateAPI.remove(id); toast.success('Annonce supprimée'); load(); } catch { toast.error('Échec'); } };
  const viewInquiries = async (id) => {
    if (openInq?.id === id) return setOpenInq(null);
    try { const r = await realEstateAPI.listingInquiries(id); setOpenInq({ id, items: r.data || [] }); } catch { toast.error('Échec'); }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-50 pb-24" data-testid="my-properties-page">
      <div className="bg-[#FF5000] px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => navigate('/real-estate')} className="text-white" data-testid="my-back-btn"><ArrowLeft size={22} /></button>
        <h1 className="text-white font-bold text-lg flex-1">Mes annonces</h1>
        <button onClick={() => navigate('/real-estate/post')} className="text-white" data-testid="my-add-btn"><Plus size={22} weight="bold" /></button>
      </div>

      <div className="flex bg-white border-b border-gray-100 sticky top-[52px] z-10">
        <button onClick={() => setTab('listings')} data-testid="my-tab-listings" className={`flex-1 py-3 text-sm font-semibold ${tab === 'listings' ? 'text-[#FF5000] border-b-2 border-[#FF5000]' : 'text-gray-400'}`}>Mes biens {listings.length > 0 && `(${listings.length})`}</button>
        <button onClick={() => setTab('inquiries')} data-testid="my-tab-inquiries" className={`flex-1 py-3 text-sm font-semibold ${tab === 'inquiries' ? 'text-[#FF5000] border-b-2 border-[#FF5000]' : 'text-gray-400'}`}>Mes demandes {inquiries.length > 0 && `(${inquiries.length})`}</button>
      </div>

      <div className="p-4 space-y-3">
        {loading && <p className="text-center text-gray-400 py-10">Chargement...</p>}

        {!loading && tab === 'listings' && (
          <>
            {listings.length === 0 && (
              <div className="text-center py-12">
                <Buildings size={48} weight="duotone" className="text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 mb-4">Vous n'avez aucune annonce.</p>
                <button onClick={() => navigate('/real-estate/post')} className="bg-[#FF5000] text-white px-5 py-2.5 rounded-xl font-semibold text-sm" data-testid="my-empty-post-btn">Publier ma première annonce</button>
              </div>
            )}
            {listings.map((p) => {
              const st = STATUS_META[p.status] || STATUS_META.active;
              return (
                <div key={p.id} className="bg-white rounded-2xl overflow-hidden border border-gray-100" data-testid={`my-listing-${p.id}`}>
                  <div className="flex gap-3 p-3">
                    <div className="w-20 h-20 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                      {p.thumbnail ? <img src={p.thumbnail} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><Buildings size={26} /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                        <span className="text-[10px] text-gray-400">{catLabel(p.category)}</span>
                      </div>
                      <p className="font-bold text-[#FF5000] text-sm mt-0.5">{fmtPrice(p.price)}</p>
                      <p className="text-sm text-gray-800 truncate">{p.title}</p>
                      <p className="text-[11px] text-gray-400">{p.views || 0} vues · {p.inquiries_count || 0} demandes</p>
                    </div>
                  </div>
                  <div className="flex border-t border-gray-100 text-xs font-semibold">
                    <button onClick={() => navigate(`/real-estate/edit/${p.id}`)} className="flex-1 py-2.5 text-gray-600 flex items-center justify-center gap-1 border-r border-gray-100" data-testid={`my-edit-${p.id}`}><PencilSimple size={14} /> Modifier</button>
                    <button onClick={() => viewInquiries(p.id)} className="flex-1 py-2.5 text-gray-600 flex items-center justify-center gap-1 border-r border-gray-100" data-testid={`my-inquiries-${p.id}`}><Envelope size={14} /> Demandes</button>
                    {p.status === 'active'
                      ? <button onClick={() => setStatus(p.id, p.listing_type === 'rent' ? 'rented' : 'sold')} className="flex-1 py-2.5 text-green-600 flex items-center justify-center gap-1 border-r border-gray-100" data-testid={`my-close-${p.id}`}>Marquer {p.listing_type === 'rent' ? 'loué' : 'vendu'}</button>
                      : <button onClick={() => setStatus(p.id, 'active')} className="flex-1 py-2.5 text-[#FF5000] flex items-center justify-center gap-1 border-r border-gray-100" data-testid={`my-reactivate-${p.id}`}>Réactiver</button>}
                    <button onClick={() => remove(p.id)} className="flex-1 py-2.5 text-red-500 flex items-center justify-center gap-1" data-testid={`my-delete-${p.id}`}><Trash size={14} /> Suppr.</button>
                  </div>
                  {openInq?.id === p.id && (
                    <div className="bg-gray-50 px-3 py-2 space-y-2" data-testid={`my-inquiries-list-${p.id}`}>
                      {openInq.items.length === 0 && <p className="text-xs text-gray-400 py-2 text-center">Aucune demande pour le moment.</p>}
                      {openInq.items.map((iq) => (
                        <div key={iq.id} className="bg-white rounded-xl p-2.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-gray-800">{iq.from_name || 'Intéressé'}</span>
                            {iq.offer_amount != null && <span className="font-bold text-green-600 flex items-center gap-0.5"><CurrencyEur size={12} />{iq.offer_amount}</span>}
                          </div>
                          {iq.message && <p className="text-gray-600 mt-0.5">{iq.message}</p>}
                          {iq.contact_phone && <a href={`tel:${iq.contact_phone}`} className="text-[#FF5000] font-semibold flex items-center gap-1 mt-1"><Phone size={12} weight="fill" /> {iq.contact_phone}</a>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {!loading && tab === 'inquiries' && (
          <>
            {inquiries.length === 0 && <p className="text-center text-gray-400 py-12" data-testid="my-inquiries-empty">Vous n'avez envoyé aucune demande.</p>}
            {inquiries.map((iq) => (
              <button key={iq.id} onClick={() => navigate(`/real-estate/${iq.listing_id}`)} className="w-full text-left bg-white rounded-2xl p-3 border border-gray-100" data-testid={`my-sent-inquiry-${iq.id}`}>
                <p className="font-bold text-sm text-gray-900 truncate">{iq.listing_title || 'Annonce'}</p>
                {iq.offer_amount != null && <p className="text-sm text-green-600 font-bold flex items-center gap-0.5"><CurrencyEur size={13} /> Offre : {iq.offer_amount}</p>}
                {iq.message && <p className="text-xs text-gray-500 mt-0.5 truncate">{iq.message}</p>}
                <p className="text-[10px] text-gray-400 mt-1">{new Date(iq.created_at).toLocaleDateString('fr-FR')}</p>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default MyPropertiesPage;
