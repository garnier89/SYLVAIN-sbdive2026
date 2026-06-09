import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChatCircleText, Info, ShieldCheck, Lock, Question, EnvelopeSimple } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { DriverBottomNav } from './DriverProfilePage';
import { SupportChatPanel } from '../../components/SupportChatPanel';

const GREEN = '#FF5000';

const FAQS = [
  { q: 'Comment activer mon compte chauffeur ?', a: 'Deposez vos documents (permis, carte grise, assurance, KBIS) dans la section Documents. Notre equipe valide sous 24h.' },
  { q: 'Quand suis-je paye ?', a: 'Les gains sont credites sur votre portefeuille en temps reel. Vous pouvez demander un retrait vers votre IBAN a tout moment.' },
  { q: 'Comment augmenter mes points et ma priorite ?', a: 'Acceptez un maximum de courses, evitez les annulations et terminez vos courses. Les points montent automatiquement.' },
  { q: 'Que faire en cas de panne pendant une course ?', a: 'Utilisez le bouton SOS dans l\'app. Notre support vous contacte immediatement.' },
  { q: 'Comment contester une note de client ?', a: 'Rendez-vous dans Contactez-nous avec le numero de la course. Nous examinons toute injustice.' },
];

const TEXTS = {
  about: {
    title: 'A propos de nous',
    icon: Info,
    color: '#F59E0B',
    content: `SB Drive VTC est une plateforme multi-services de transport et livraison pensee pour les chauffeurs independants et les entreprises. 
    
Nous mettons a votre disposition :
- Un systeme de rewards transparent
- Des points de priorite equitables
- Un portefeuille instantane
- Un support 7j/7

Notre mission : permettre aux chauffeurs de gagner mieux avec des outils modernes et une communaute de confiance.`
  },
  privacy: {
    title: 'Politique de confidentialite',
    icon: ShieldCheck,
    color: '#374151',
    content: `Vos donnees personnelles sont protegees conformement au RGPD.

Donnees collectees :
- Identifiants (nom, email, telephone)
- Donnees de geolocalisation pendant les courses
- Donnees de paiement (tokens Stripe, non stockes en clair)
- Documents d'identite (cryptes)

Usage : exclusivement pour l'execution du service. Aucune revente a des tiers.

Droits : acces, rectification, suppression. Contactez dpo@sbdrivevtc.com.`
  },
  terms: {
    title: 'Termes et conditions',
    icon: Lock,
    color: '#F87171',
    content: `En utilisant SB Drive VTC, vous acceptez les conditions suivantes :

1. Statut : chauffeur independant VTC ou coursier. Vous declarez vos revenus a votre regime fiscal.

2. Commission : l'application preleve un pourcentage de chaque course (voir Reward Program).

3. Engagement : maintenir un taux d'acceptation decent, respecter les clients, garder les documents a jour.

4. Resiliation : votre compte peut etre suspendu en cas de fraude, agression, ou violations repetees.

5. Responsabilite : l'application n'est pas responsable des accidents de la route. Souscrivez a une assurance professionnelle.`
  },
};

const DriverSupportPage = () => {
  const navigate = useNavigate();
  const { section } = useParams();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const text = TEXTS[section];

  const handleSendContact = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/support/contact`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ subject: 'Demande support chauffeur', message: message.trim() }),
      });
      if (!res.ok) throw new Error('Server error');
      toast.success('Message envoye ! Nous vous repondons sous 24h.');
      setMessage('');
    } catch (err) { toast.error('Erreur d\'envoi, reessayez'); }
    finally { setSending(false); }
  };

  return (
    <div className="mobile-container min-h-screen bg-gray-100 pb-20" data-testid={`driver-support-${section}`}>
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-3" style={{ background: GREEN }}>
        <button onClick={() => navigate('/chauffeur/profile')} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center" data-testid="support-back">
          <ArrowLeft size={18} className="text-white" />
        </button>
        <h1 className="text-white text-lg font-bold">
          {section === 'faq' ? 'FAQ' : section === 'chat' ? 'Parler en direct' : section === 'contact' ? 'Contactez nous' : (text?.title || 'Support')}
        </h1>
      </div>

      {/* ===== STATIC TEXT PAGES ===== */}
      {text && (
        <div className="p-5">
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: text.color + '20' }}>
                <text.icon size={24} weight="duotone" style={{ color: text.color }} />
              </div>
              <h2 className="text-xl font-bold text-gray-800">{text.title}</h2>
            </div>
            <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{text.content}</p>
          </div>
        </div>
      )}

      {/* ===== FAQ ===== */}
      {section === 'faq' && (
        <div className="p-5 space-y-2" data-testid="faq-list">
          {FAQS.map((f, i) => <FaqItem key={f.q} q={f.q} a={f.a} idx={i} />)}
        </div>
      )}

      {/* ===== PARLER EN DIRECT (IA + escalade conseiller) ===== */}
      {section === 'chat' && (
        <div className="flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
          <SupportChatPanel accent={GREEN} />
        </div>
      )}

      {/* ===== CONTACTEZ NOUS ===== */}
      {section === 'contact' && (
        <div className="p-5 space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <EnvelopeSimple size={32} weight="duotone" style={{ color: '#F97316' }} className="mb-2" />
            <p className="text-sm text-gray-600 mb-4">Envoyez-nous un message, nous vous repondons sous 24h.</p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Decrivez votre demande..."
              rows={6}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-500 resize-none"
              data-testid="contact-message"
            />
            <button
              onClick={handleSendContact}
              disabled={sending || !message.trim()}
              className="w-full mt-3 py-3 rounded-xl text-white font-bold text-sm disabled:opacity-50"
              style={{ background: '#F97316' }}
              data-testid="contact-send"
            >
              {sending ? 'Envoi...' : 'Envoyer le message'}
            </button>
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <p className="text-xs text-gray-500 uppercase font-bold mb-2">Autres moyens</p>
            <div className="space-y-2 text-sm">
              <p><b>Email :</b> support@sbdrivevtc.com</p>
              <p><b>Telephone :</b> +33 1 23 45 67 89</p>
              <p><b>Horaires :</b> 7j/7 de 7h a 23h</p>
            </div>
          </div>
        </div>
      )}

      <DriverBottomNav active="profile" />
    </div>
  );
};

const FaqItem = ({ q, a, idx }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl overflow-hidden" data-testid={`faq-${idx}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="text-sm font-semibold text-gray-800 pr-3">{q}</span>
        <span className="text-xl" style={{ color: GREEN }}>{open ? '-' : '+'}</span>
      </button>
      {open && <p className="px-4 pb-4 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">{a}</p>}
    </div>
  );
};

export default DriverSupportPage;
