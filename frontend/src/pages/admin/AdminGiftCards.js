import React, { useState, useEffect } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Gift, Plus, Trash, MagnifyingGlass, Eye } from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminGiftCards = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTemplates(); }, []);

  const loadTemplates = async () => {
    try {
      const res = await fetch(`${API}/api/giftcards/templates`);
      const data = await res.json();
      // API returns {templates: [...], amounts: [...]} or array directly
      const templateList = data.templates || (Array.isArray(data) ? data : []);
      setTemplates(templateList);
    } catch (err) { console.error('Failed:', err); }
    finally { setLoading(false); }
  };

  return (
    <div className="p-6" data-testid="admin-giftcards">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Gift Cards Management</h1>
          <p className="text-sm text-gray-500 mt-1">{templates.length} templates disponibles</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => (
          <div key={t.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden" data-testid={`giftcard-${t.id}`}>
            <div className="h-32 bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Gift size={48} className="text-white/80" weight="duotone" />
            </div>
            <div className="p-4">
              <h3 className="font-bold text-gray-900">{t.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{t.description}</p>
              <div className="flex items-center justify-between mt-3">
                <div className="flex gap-1">
                  {(t.amounts || []).map(a => (
                    <Badge key={a} variant="outline" className="text-xs">{a}EUR</Badge>
                  ))}
                </div>
                <Badge className={t.active !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                  {t.active !== false ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
      {loading && <div className="text-center py-8 text-gray-400">Chargement...</div>}
      {!loading && templates.length === 0 && <div className="text-center py-8 text-gray-400">Aucun template de carte cadeau</div>}
    </div>
  );
};

export default AdminGiftCards;
