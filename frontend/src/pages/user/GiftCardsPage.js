import { useLocale } from '../../contexts/LocaleContext';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Gift, CurrencyEur, Envelope, Heart, Star, ShoppingCart, Check, Copy } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const AMOUNT_OPTIONS = [10, 20, 30, 50, 75, 100, 150, 200];

const GiftCardsPage = () => {
  const { money } = useLocale();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [myCards, setMyCards] = useState([]);
  const [activeTab, setActiveTab] = useState('buy');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedAmount, setSelectedAmount] = useState(50);
  const [form, setForm] = useState({ recipient_name: '', recipient_email: '', message: '' });
  const [redeemCode, setRedeemCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [purchaseResult, setPurchaseResult] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/giftcards/templates`, { credentials: 'include' })
      .then(r => r.json()).then(d => setTemplates(d.templates || []))
      .catch(() => {});
    fetch(`${API}/api/giftcards/my-cards`, { credentials: 'include' })
      .then(r => r.json()).then(d => setMyCards(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const handlePurchase = async () => {
    if (!selectedTemplate) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/giftcards/purchase`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          template_id: selectedTemplate, amount: selectedAmount,
          recipient_name: form.recipient_name, recipient_email: form.recipient_email,
          message: form.message
        })
      });
      if (res.ok) {
        const card = await res.json();
        setPurchaseResult(card);
        setMyCards(prev => [card, ...prev]);
        toast.success(`Carte cadeau de ${selectedAmount} € achetée ✅`);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(typeof err.detail === 'string' ? err.detail : 'Achat impossible');
      }
    } catch (e) { toast.error('Erreur réseau. Réessayez.'); }
    finally { setLoading(false); }
  };

  const handleRedeem = async () => {
    if (!redeemCode) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/giftcards/redeem`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ code: redeemCode })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Carte-cadeau créditée sur votre portefeuille ✅');
        setRedeemCode('');
      } else {
        toast.error(data.detail || 'Code invalide');
      }
    } catch (e) { toast.error('Erreur réseau. Réessayez.'); }
    finally { setLoading(false); }
  };

  if (purchaseResult) {
    return (
      <div className="mobile-container min-h-screen bg-white flex flex-col items-center justify-center p-8" data-testid="purchase-success">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <Gift size={40} weight="duotone" className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Carte cadeau créée !</h2>
        <p className="text-sm text-gray-500 text-center mb-4">
          Montant: <strong>{money(Number(purchaseResult.amount))}</strong>
        </p>
        <div className="bg-gray-50 rounded-xl p-4 w-full text-center mb-6">
          <p className="text-xs text-gray-400 mb-1">Code de la carte</p>
          <p className="text-xl font-bold text-gray-900 tracking-widest" data-testid="gift-code">{purchaseResult.code}</p>
        </div>
        <div className="flex gap-3 w-full">
          <button onClick={() => { setPurchaseResult(null); setSelectedTemplate(null); }}
            className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold text-sm">
            Acheter une autre
          </button>
          <button onClick={() => navigate('/home')}
            className="flex-1 bg-[#FF4500] text-white py-3 rounded-xl font-semibold text-sm">
            Accueil
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="giftcards-page">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FF4500] to-orange-600 px-4 pt-4 pb-5">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate('/home')} className="text-white" data-testid="back-btn"><ArrowLeft size={22} /></button>
          <h1 className="text-lg font-bold text-white">Cartes Cadeaux</h1>
        </div>
        <p className="text-sm text-white/80">Offrez du crédit SB Drive VTC à vos proches</p>
      </div>

      {/* Tabs */}
      <div className="px-4 py-3 flex gap-2">
        {['buy', 'redeem', 'my-cards'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all ${activeTab === tab ? 'bg-[#FF4500] text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
            data-testid={`tab-${tab}`}>
            {tab === 'buy' ? 'Acheter' : tab === 'redeem' ? 'Utiliser un code' : `Mes cartes (${myCards.length})`}
          </button>
        ))}
      </div>

      <div className="px-4 pb-6">
        {activeTab === 'buy' && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2">Choisir un design</label>
              <div className="grid grid-cols-3 gap-2">
                {templates.map(t => (
                  <button key={t.id} onClick={() => setSelectedTemplate(t.id)}
                    className={`rounded-xl overflow-hidden border-2 transition-all ${selectedTemplate === t.id ? 'border-[#FF4500]' : 'border-transparent'}`}
                    data-testid={`template-${t.id}`}>
                    <div className="h-16 bg-cover bg-center" style={{ backgroundImage: `url(${t.image_url})` }} />
                    <p className="text-[10px] font-medium text-gray-600 p-1.5 text-center bg-white">{t.name}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2">Montant</label>
              <div className="grid grid-cols-4 gap-2">
                {AMOUNT_OPTIONS.map(a => (
                  <button key={a} onClick={() => setSelectedAmount(a)}
                    className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${selectedAmount === a ? 'bg-[#FF4500] text-white border-[#FF4500]' : 'bg-white text-gray-600 border-gray-200'}`}
                    data-testid={`amount-${a}`}>
                    {a}€
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Nom du destinataire</label>
              <input value={form.recipient_name} onChange={e => setForm({ ...form, recipient_name: e.target.value })}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm" placeholder="Prénom Nom"
                data-testid="recipient-name" />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Email du destinataire</label>
              <input value={form.recipient_email} onChange={e => setForm({ ...form, recipient_email: e.target.value })}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm" placeholder="email@exemple.com" type="email"
                data-testid="recipient-email" />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">Message personnel</label>
              <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none h-20"
                placeholder="Joyeux anniversaire !" data-testid="gift-message" />
            </div>

            <button onClick={handlePurchase} disabled={loading || !selectedTemplate}
              className="w-full bg-[#FF4500] text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-orange-600 transition-colors disabled:opacity-50"
              data-testid="purchase-btn">
              {loading ? 'Achat en cours...' : `Acheter - ${selectedAmount}€`}
            </button>
          </div>
        )}

        {activeTab === 'redeem' && (
          <div className="space-y-4 mt-2">
            <div className="bg-white rounded-2xl p-6 border border-gray-100 text-center">
              <Gift size={48} weight="duotone" className="text-[#FF4500] mx-auto mb-3" />
              <h3 className="font-bold text-gray-900 mb-1">Utiliser une carte cadeau</h3>
              <p className="text-xs text-gray-500 mb-4">Entrez le code de votre carte pour créditer votre portefeuille</p>
              <input value={redeemCode} onChange={e => setRedeemCode(e.target.value.toUpperCase())}
                className="w-full border border-gray-200 rounded-xl p-3 text-sm text-center uppercase tracking-widest font-bold"
                placeholder="SB-XXXXXXXX" data-testid="redeem-code" />
              <button onClick={handleRedeem} disabled={loading || !redeemCode}
                className="w-full mt-3 bg-[#FF4500] text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
                data-testid="redeem-btn">
                {loading ? 'Vérification...' : 'Utiliser le code'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'my-cards' && (
          <div className="space-y-3 mt-2">
            {myCards.length === 0 ? (
              <div className="text-center py-12">
                <Gift size={48} className="text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Aucune carte cadeau</p>
              </div>
            ) : myCards.map(card => (
              <div key={card.id} className="bg-white rounded-2xl p-4 border border-gray-100" data-testid={`card-${card.id}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-gray-900">{money(card.amount)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Code: {card.code}</p>
                    {card.recipient_name && <p className="text-[10px] text-gray-400">Pour: {card.recipient_name}</p>}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${card.redeemed ? 'bg-gray-100 text-gray-400' : 'bg-green-50 text-green-600'}`}>
                    {card.redeemed ? 'Utilisée' : 'Active'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GiftCardsPage;
