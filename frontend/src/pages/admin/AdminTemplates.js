import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { EnvelopeOpen, ChatCircleText, Plus, PencilSimple, Trash, Eye } from '@phosphor-icons/react';
import { Badge } from '../../components/ui/badge';

const emailTemplates = [
  { id: 'et_1', name: 'Bienvenue', subject: 'Bienvenue sur SB Drive VTC !', trigger: 'user_register', active: true },
  { id: 'et_2', name: 'Course confirmee', subject: 'Votre course a ete confirmee', trigger: 'ride_confirmed', active: true },
  { id: 'et_3', name: 'Facture', subject: 'Facture de votre course #{ride_id}', trigger: 'ride_completed', active: true },
  { id: 'et_4', name: 'Mot de passe oublie', subject: 'Reinitialiser votre mot de passe', trigger: 'password_reset', active: true },
  { id: 'et_5', name: 'Compte chauffeur approuve', subject: 'Votre compte chauffeur est active', trigger: 'driver_approved', active: true },
];

const smsTemplates = [
  { id: 'st_1', name: 'OTP Connexion', message: 'Votre code de verification SB Drive : {otp}', trigger: 'login_otp', active: true },
  { id: 'st_2', name: 'Chauffeur en route', message: 'Votre chauffeur {driver_name} arrive dans {eta} min.', trigger: 'driver_arriving', active: true },
  { id: 'st_3', name: 'Course terminee', message: 'Course terminee. Montant: {fare} EUR. Merci !', trigger: 'ride_completed', active: true },
  { id: 'st_4', name: 'Promo', message: '{promo_code}: {discount}% de reduction sur votre prochaine course !', trigger: 'promo_send', active: false },
];

const AdminTemplates = () => {
  const [tab, setTab] = useState('email');
  const [editing, setEditing] = useState(null);

  const templates = tab === 'email' ? emailTemplates : smsTemplates;

  return (
    <div className="p-6" data-testid="admin-templates">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Email & SMS Templates</h1>
      <p className="text-sm text-gray-500 mb-6">Gerez les modeles de communication automatique</p>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('email')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'email' ? 'bg-[#3b82f6] text-white' : 'bg-gray-100 text-gray-600'}`} data-testid="tab-email">
          <EnvelopeOpen size={16} /> Email Templates ({emailTemplates.length})
        </button>
        <button onClick={() => setTab('sms')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'sms' ? 'bg-[#3b82f6] text-white' : 'bg-gray-100 text-gray-600'}`} data-testid="tab-sms">
          <ChatCircleText size={16} /> SMS Templates ({smsTemplates.length})
        </button>
      </div>

      <div className="space-y-3">
        {templates.map(t => (
          <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4" data-testid={`template-${t.id}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tab === 'email' ? 'bg-blue-50' : 'bg-green-50'}`}>
              {tab === 'email' ? <EnvelopeOpen size={20} className="text-blue-500" /> : <ChatCircleText size={20} className="text-green-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900">{t.name}</span>
                <Badge variant="outline" className="text-[10px]">{t.trigger}</Badge>
                <Badge className={t.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>{t.active ? 'Active' : 'Inactive'}</Badge>
              </div>
              <p className="text-sm text-gray-500 mt-0.5 truncate">{t.subject || t.message}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button size="icon" variant="ghost" className="h-8 w-8"><PencilSimple size={14} /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8"><Eye size={14} /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminTemplates;
