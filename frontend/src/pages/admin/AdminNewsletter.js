import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Newspaper, Users, EnvelopeSimple, PaperPlaneRight, Trash } from '@phosphor-icons/react';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';

const AdminNewsletter = () => {
  const [subscribers] = useState([
    { email: 'marie.l@email.com', name: 'Marie L.', subscribed_at: '2026-03-15', status: 'active' },
    { email: 'jean.d@email.com', name: 'Jean D.', subscribed_at: '2026-03-20', status: 'active' },
    { email: 'amadou.b@email.com', name: 'Amadou B.', subscribed_at: '2026-04-01', status: 'active' },
    { email: 'sophie.m@email.com', name: 'Sophie M.', subscribed_at: '2026-04-05', status: 'unsubscribed' },
  ]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const activeCount = subscribers.filter(s => s.status === 'active').length;

  const handleSend = () => {
    if (!subject.trim() || !body.trim()) { toast.error('Remplissez le sujet et le contenu'); return; }
    setSending(true);
    setTimeout(() => {
      toast.success(`Newsletter envoyee a ${activeCount} abonnes !`);
      setSending(false);
      setSubject('');
      setBody('');
    }, 1500);
  };

  return (
    <div className="p-6" data-testid="admin-newsletter">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Newsletter</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Users size={16} /> Abonnes actifs</div>
          <p className="text-2xl font-bold text-green-600">{activeCount}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Newspaper size={16} /> Total abonnes</div>
          <p className="text-2xl font-bold text-gray-900">{subscribers.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><EnvelopeSimple size={16} /> Desinscrits</div>
          <p className="text-2xl font-bold text-red-500">{subscribers.filter(s => s.status === 'unsubscribed').length}</p>
        </CardContent></Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Envoyer une newsletter</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Sujet de la newsletter" value={subject} onChange={e => setSubject(e.target.value)} data-testid="newsletter-subject" />
            <Textarea placeholder="Contenu de la newsletter..." value={body} onChange={e => setBody(e.target.value)} rows={6} data-testid="newsletter-body" />
            <Button onClick={handleSend} disabled={sending} className="bg-[#3b82f6] text-white w-full" data-testid="send-newsletter-btn">
              <PaperPlaneRight size={16} className="mr-1" /> {sending ? 'Envoi en cours...' : `Envoyer a ${activeCount} abonnes`}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Liste des abonnes</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {subscribers.map(sub => (
                <div key={sub.email} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0" data-testid={`subscriber-${sub.email}`}>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{sub.name}</p>
                    <p className="text-xs text-gray-500">{sub.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{sub.subscribed_at}</span>
                    <Badge className={sub.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{sub.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminNewsletter;
