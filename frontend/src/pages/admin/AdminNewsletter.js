import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Newspaper, Users, EnvelopeSimple, PaperPlaneRight, Trash, ClockCounterClockwise } from '@phosphor-icons/react';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';
import { adminAPI } from '../../services/api';

const AdminNewsletter = () => {
  const [subscribers, setSubscribers] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, unsubscribed: 0 });
  const [campaigns, setCampaigns] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [subRes, campRes] = await Promise.all([
        adminAPI.listNewsletterSubscribers(),
        adminAPI.listNewsletterCampaigns(),
      ]);
      const data = subRes.data || {};
      setSubscribers(data.subscribers || []);
      setStats({ total: data.total || 0, active: data.active || 0, unsubscribed: data.unsubscribed || 0 });
      setCampaigns(campRes.data || []);
    } catch (e) {
      toast.error('Erreur de chargement des abonnés');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) { toast.error('Remplissez le sujet et le contenu'); return; }
    setSending(true);
    try {
      const r = await adminAPI.sendNewsletter({ subject, body });
      const c = r.data || {};
      if (c.status === 'sent') toast.success(`Newsletter envoyée à ${c.recipients} abonnés !`);
      else if (c.status === 'failed') toast.error(`Échec d'envoi: ${c.error || 'erreur Resend'}`);
      else toast.success(`Campagne enregistrée (${c.recipients} destinataires). Configurez Resend pour l'envoi réel.`);
      setSubject('');
      setBody('');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Erreur lors de l\'envoi');
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await adminAPI.deleteNewsletterSubscriber(id);
      toast.success('Abonné supprimé');
      load();
    } catch (e) {
      toast.error('Suppression impossible');
    }
  };

  return (
    <div className="p-6" data-testid="admin-newsletter">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Newsletter</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Users size={16} /> Abonnés actifs</div>
          <p className="text-2xl font-bold text-green-600" data-testid="newsletter-active-count">{stats.active}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Newspaper size={16} /> Total abonnés</div>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><EnvelopeSimple size={16} /> Désinscrits</div>
          <p className="text-2xl font-bold text-red-500">{stats.unsubscribed}</p>
        </CardContent></Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Envoyer une newsletter</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Sujet de la newsletter" value={subject} onChange={e => setSubject(e.target.value)} data-testid="newsletter-subject" />
            <Textarea placeholder="Contenu de la newsletter..." value={body} onChange={e => setBody(e.target.value)} rows={6} data-testid="newsletter-body" />
            <Button onClick={handleSend} disabled={sending} className="bg-[#FF5000] hover:bg-[#E54800] text-white w-full" data-testid="send-newsletter-btn">
              <PaperPlaneRight size={16} className="mr-1" /> {sending ? 'Envoi en cours...' : `Envoyer à ${stats.active} abonnés`}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Liste des abonnés</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-gray-400 py-6 text-center">Chargement…</p>
            ) : subscribers.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Aucun abonné</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {subscribers.map(sub => (
                  <div key={sub.id || sub.email} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0" data-testid={`subscriber-${sub.email}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{sub.name || '—'}</p>
                      <p className="text-xs text-gray-500 truncate">{sub.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={sub.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{sub.status}</Badge>
                      <button onClick={() => handleDelete(sub.id)} className="text-gray-300 hover:text-red-500 transition-colors" data-testid={`delete-subscriber-${sub.email}`} title="Supprimer">
                        <Trash size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ClockCounterClockwise size={18} /> Historique des campagnes</CardTitle></CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Aucune campagne envoyée</p>
          ) : (
            <div className="space-y-2">
              {campaigns.map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0" data-testid={`campaign-${c.id}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.subject}</p>
                    <p className="text-xs text-gray-500">{new Date(c.sent_at).toLocaleString('fr-FR')} · {c.recipients} destinataires</p>
                  </div>
                  <Badge className={c.status === 'sent' ? 'bg-green-100 text-green-700' : c.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}>{c.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminNewsletter;
