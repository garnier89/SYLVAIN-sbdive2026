import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, SpinnerGap } from '@phosphor-icons/react';
import { marketplaceAPI } from '../../services/api';
import { useLocale } from '../../contexts/LocaleContext';

/**
 * Stripe return page — polls the checkout status until paid / failed / timeout.
 * Reached via success_url ?session_id=... after Stripe Checkout.
 */
const OrderSuccessPage = () => {
  const navigate = useNavigate();
  const { money } = useLocale();
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const [state, setState] = useState('checking'); // checking | paid | failed | timeout
  const [order, setOrder] = useState(null);
  const attempts = useRef(0);

  useEffect(() => {
    if (!sessionId) { setState('failed'); return; }
    let alive = true;
    const poll = async () => {
      if (!alive) return;
      if (attempts.current >= 6) { setState('timeout'); return; }
      attempts.current += 1;
      try {
        const r = await marketplaceAPI.checkoutStatus(sessionId);
        if (!alive) return;
        if (r.data.payment_status === 'paid') { setOrder(r.data.order); setState('paid'); return; }
        if (r.data.status === 'expired') { setState('failed'); return; }
      } catch { /* retry */ }
      setTimeout(poll, 2000);
    };
    poll();
    return () => { alive = false; };
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6" data-testid="order-success-page">
      <div className="bg-white rounded-3xl shadow-sm p-8 max-w-sm w-full text-center">
        {state === 'checking' && (
          <>
            <SpinnerGap size={56} className="text-blue-600 mx-auto animate-spin" />
            <h2 className="text-xl font-extrabold text-gray-900 mt-4">Vérification du paiement…</h2>
            <p className="text-sm text-gray-500 mt-1">Merci de patienter quelques secondes.</p>
          </>
        )}
        {state === 'paid' && (
          <>
            <CheckCircle size={64} weight="fill" className="text-emerald-500 mx-auto" />
            <h2 className="text-xl font-extrabold text-gray-900 mt-4" data-testid="payment-success">Paiement réussi 🎉</h2>
            {order && <p className="text-sm text-gray-600 mt-2">« {order.listing_title} » — {money(order.amount)}. Le vendeur a été notifié de votre commande.</p>}
            <button onClick={() => navigate('/marketplace/orders')} className="mt-6 w-full bg-blue-600 text-white rounded-xl py-3 font-bold" data-testid="view-orders-btn">Voir mes achats</button>
            <button onClick={() => navigate('/marketplace')} className="mt-2 w-full text-gray-500 py-2 text-sm font-semibold">Retour au Marketplace</button>
          </>
        )}
        {(state === 'failed' || state === 'timeout') && (
          <>
            <XCircle size={64} weight="fill" className="text-red-500 mx-auto" />
            <h2 className="text-xl font-extrabold text-gray-900 mt-4">{state === 'timeout' ? 'Vérification trop longue' : 'Paiement non confirmé'}</h2>
            <p className="text-sm text-gray-500 mt-1">{state === 'timeout' ? 'Vérifiez « Mes achats » dans un instant.' : 'Aucun montant n’a été débité.'}</p>
            <button onClick={() => navigate('/marketplace')} className="mt-6 w-full bg-blue-600 text-white rounded-xl py-3 font-bold">Retour au Marketplace</button>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderSuccessPage;
