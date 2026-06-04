import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { realEstateAPI } from '../../../services/api';
import { useAuth } from '../../../contexts/AuthContext';
import { useWebSocket } from '../../../hooks/useWebSocket';
import { ArrowLeft, Plus, PencilSimple, Trash, Buildings, Envelope, CurrencyEur, Phone, Star, Rocket, X, Wallet, Bank, CaretLeft } from '@phosphor-icons/react';
import { fmtPrice, catLabel, STATUS_META } from './realEstateConstants';

const money = (v, cur = 'EUR') => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(v || 0);

const MyPropertiesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { on } = useWebSocket(user?.id);
  const [tab, setTab] = useState('listings');
  const [listings, setListings] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openInq, setOpenInq] = useState(null); // listing id -> inquiries
  const [boostFor, setBoostFor] = useState(null); // listing being boosted
  const [boostPlans, setBoostPlans] = useState([]);
  const [boostLoading, setBoostLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [payMethods, setPayMethods] = useState([]);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, i] = await Promise.all([realEstateAPI.myListings(), realEstateAPI.myInquiries()]);
      setListings(l.data || []); setInquiries(i.data || []);
    } catch { toast.error('Erreur de chargement'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Real-time signal when a buyer sends an inquiry/offer on one of my listings
  useEffect(() => {
    const unsub = on('new_property_inquiry', (msg) => {
      const offer = msg.offer_amount != null ? ` · offre ${msg.offer_amount} €` : '';
      toast.success(`📩 Nouvelle demande sur « ${msg.listing_title || 'votre annonce'} »${offer}`, { duration: 7000 });
      load();
    });
    return () => unsub();
  }, [on, load]);

  const setStatus = async (id, status) => { try { await realEstateAPI.setStatus(id, status); toast.success('Statut mis à jour'); load(); } catch { toast.error('Échec'); } };
  const remove = async (id) => { if (!window.confirm('Supprimer cette annonce ?')) return; try { await realEstateAPI.remove(id); toast.success('Annonce supprimée'); load(); } catch { toast.error('Échec'); } };
  const viewInquiries = async (id) => {
    if (openInq?.id === id) return setOpenInq(null);
    try { const r = await realEstateAPI.listingInquiries(id); setOpenInq({ id, items: r.data || [] }); } catch { toast.error('Échec'); }
  };

  const openBoost = async (listing) => {
    setBoostFor(listing); setBoostPlans([]); setSelectedPlan(null); setPayMethods([]); setBoostLoading(true);
    try {
      const [p, m] = await Promise.all([realEstateAPI.boostPlans(listing.country), realEstateAPI.boostPaymentMethods()]);
      setBoostPlans(p.data || []); setPayMethods(m.data?.methods || []);
    } catch { toast.error('Aucun plan disponible'); } finally { setBoostLoading(false); }
  };
  const closeBoost = () => { setBoostFor(null); setSelectedPlan(null); };
  const payBoost = async (methodId) => {
    setPaying(true);
    try {
      await realEstateAPI.boostPay(boostFor.id, selectedPlan.id, methodId);
      toast.success('🚀 Votre annonce est boostée et sponsorisée !', { duration: 6000 });
      closeBoost(); load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec du paiement'); } finally { setPaying(false); }
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
                        {p.is_featured && <span className="flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 text-white"><Star size={10} weight="fill" /> Sponsorisé</span>}
                        <span className="text-[10px] text-gray-400">{catLabel(p.category)}</span>
                      </div>
                      <p className="font-bold text-[#FF5000] text-sm mt-0.5">{fmtPrice(p.price)}</p>
                      <p className="text-sm text-gray-800 truncate">{p.title}</p>
                      <p className="text-[11px] text-gray-400">{p.views || 0} vues · {p.inquiries_count || 0} demandes</p>
                    </div>
                  </div>
                  <div className="flex border-t border-gray-100 text-xs font-semibold">
                    <button onClick={() => navigate(`/real-estate/edit/${p.id}`)} className="flex-1 py-2.5 text-gray-600 flex items-center justify-center gap-1 border-r border-gray-100" data-testid={`my-edit-${p.id}`}><PencilSimple size={14} /> Modifier</button>
                    <button onClick={() => viewInquiries(p.id)} className="flex-1 py-2.5 text-gray-600 flex items-center justify-center gap-1 border-r border-gray-100 relative" data-testid={`my-inquiries-${p.id}`}>
                      <Envelope size={14} /> Demandes
                      {p.unread_inquiries > 0 && <span className="absolute top-1 right-2 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center" data-testid={`my-unread-${p.id}`}>{p.unread_inquiries}</span>}
                    </button>
                    {p.status === 'active'
                      ? <button onClick={() => setStatus(p.id, p.listing_type === 'rent' ? 'rented' : 'sold')} className="flex-1 py-2.5 text-green-600 flex items-center justify-center gap-1 border-r border-gray-100" data-testid={`my-close-${p.id}`}>Marquer {p.listing_type === 'rent' ? 'loué' : 'vendu'}</button>
                      : <button onClick={() => setStatus(p.id, 'active')} className="flex-1 py-2.5 text-[#FF5000] flex items-center justify-center gap-1 border-r border-gray-100" data-testid={`my-reactivate-${p.id}`}>Réactiver</button>}
                    <button onClick={() => remove(p.id)} className="flex-1 py-2.5 text-red-500 flex items-center justify-center gap-1" data-testid={`my-delete-${p.id}`}><Trash size={14} /> Suppr.</button>
                  </div>
                  {p.status === 'active' && !p.is_featured && (
                    <button onClick={() => openBoost(p)} data-testid={`my-boost-${p.id}`}
                      className="w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white py-2.5 text-sm font-bold border-t border-amber-300">
                      <Rocket size={15} weight="fill" /> Booster mon annonce
                    </button>
                  )}
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

      {/* Boost: 2-step modal (plan selection -> payment method) */}
      {boostFor && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center" onClick={closeBoost}>
          <div className="bg-white w-full max-w-[480px] rounded-t-3xl sm:rounded-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()} data-testid="boost-modal">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selectedPlan && <button onClick={() => setSelectedPlan(null)} className="text-gray-400" data-testid="boost-back"><CaretLeft size={20} /></button>}
                <div>
                  <h3 className="font-bold text-lg flex items-center gap-2"><Rocket size={20} weight="fill" className="text-orange-500" /> {selectedPlan ? 'Choisir le paiement' : "Booster l'annonce"}</h3>
                  <p className="text-xs text-gray-500 truncate max-w-[280px]">{boostFor.title}</p>
                </div>
              </div>
              <button onClick={closeBoost} className="text-gray-400" data-testid="boost-close"><X size={22} /></button>
            </div>

            {/* Step 1: plans */}
            {!selectedPlan && (
              <>
                <p className="text-sm text-gray-600">Passez en tête de liste avec le badge <span className="font-bold text-orange-500">★ Sponsorisé</span> pendant la durée choisie.</p>
                {boostLoading && boostPlans.length === 0 && <p className="text-center text-gray-400 py-6">Chargement des offres...</p>}
                {!boostLoading && boostPlans.length === 0 && <p className="text-center text-gray-400 py-6" data-testid="boost-no-plans">Aucune offre disponible pour cette zone.</p>}
                <div className="space-y-2">
                  {boostPlans.map((pl) => (
                    <button key={pl.id} onClick={() => setSelectedPlan(pl)} data-testid={`boost-plan-${pl.id}`}
                      className="w-full flex items-center justify-between p-3.5 rounded-xl border border-gray-200 hover:border-orange-400 hover:bg-orange-50 transition-colors">
                      <div className="text-left">
                        <p className="font-bold text-gray-900 text-sm">{pl.label || `Boost ${pl.duration_days} jours`}</p>
                        <p className="text-xs text-gray-500">{pl.duration_days} jours en tête de liste</p>
                      </div>
                      <span className="font-extrabold text-orange-500">{money(pl.price, pl.currency)}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 text-center">Paiement sécurisé via votre portefeuille ou SB PayGo.</p>
              </>
            )}

            {/* Step 2: payment method */}
            {selectedPlan && (
              <>
                <div className="bg-orange-50 rounded-xl p-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-800">{selectedPlan.label || `Boost ${selectedPlan.duration_days} jours`}</span>
                  <span className="font-extrabold text-orange-500">{money(selectedPlan.price, selectedPlan.currency)}</span>
                </div>
                <p className="text-sm font-semibold text-gray-700">Payer avec :</p>
                <div className="space-y-2">
                  {payMethods.map((m) => {
                    const insufficient = m.balance < selectedPlan.price;
                    const Icon = m.id === 'wallet' ? Wallet : Bank;
                    return (
                      <button key={m.id} disabled={insufficient || paying} onClick={() => payBoost(m.id)} data-testid={`boost-pay-${m.id}`}
                        className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-colors ${insufficient ? 'border-gray-200 opacity-60 cursor-not-allowed' : 'border-gray-200 hover:border-[#FF5000] hover:bg-orange-50'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${m.id === 'wallet' ? 'bg-[#FF5000]/10 text-[#FF5000]' : 'bg-blue-50 text-blue-600'}`}><Icon size={20} weight="duotone" /></div>
                        <div className="flex-1 text-left">
                          <p className="font-bold text-gray-900 text-sm">{m.label}</p>
                          <p className={`text-xs ${insufficient ? 'text-red-500' : 'text-gray-500'}`}>Solde : {money(m.balance, m.currency)}{insufficient ? ' · insuffisant' : ''}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {payMethods.some((m) => m.balance < selectedPlan.price) && (
                  <button onClick={() => navigate('/wallet')} className="w-full text-sm font-semibold text-[#FF5000] py-2" data-testid="boost-topup">Recharger mon portefeuille →</button>
                )}
                {paying && <p className="text-center text-gray-400 text-sm">Paiement en cours...</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MyPropertiesPage;
