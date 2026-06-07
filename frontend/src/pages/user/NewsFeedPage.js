/**
 * NewsFeedPage — fil d'actualités in-app (client & chauffeur).
 * Récupère /news/feed filtré par zone (géolocalisation navigateur, best-effort).
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretLeft, Newspaper, PushPin } from '@phosphor-icons/react';
import { newsAPI } from '../../services/api';
import { getBrowserLocationLabel } from '../../lib/browserZone';

const fmtDate = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return ''; }
};

const NewsFeedPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = async (location) => {
      try {
        const r = await newsAPI.feed(location);
        if (alive) setItems(r.data || []);
      } catch { if (alive) setItems([]); }
    };
    load();
    getBrowserLocationLabel().then((label) => { if (label && alive) load(label); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="mobile-container min-h-screen bg-gray-50" data-testid="news-feed-page">
      <div className="bg-[#FF4500] px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} data-testid="news-back-btn"><CaretLeft size={24} className="text-white" /></button>
        <h1 className="text-white font-bold text-lg flex items-center gap-2"><Newspaper size={20} weight="duotone" /> Actualités</h1>
      </div>

      <div className="p-4 space-y-4">
        {items === null && <p className="text-gray-400 text-center py-10" data-testid="news-loading">Chargement…</p>}
        {items !== null && items.length === 0 && (
          <div className="text-center py-16" data-testid="news-empty">
            <Newspaper size={48} weight="duotone" className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">Aucune actualité pour le moment.</p>
          </div>
        )}
        {(items || []).map((n) => (
          <div key={n.id} className="bg-white rounded-2xl shadow-sm overflow-hidden" data-testid={`news-item-${n.id}`}>
            {n.image_url && <div className="h-40 bg-cover bg-center" style={{ backgroundImage: `url('${n.image_url}')` }} />}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-1">
                {n.pinned && <PushPin size={15} weight="fill" className="text-amber-500" />}
                <h2 className="font-bold text-gray-900 text-base leading-tight">{n.title}</h2>
              </div>
              {n.published_at && <p className="text-[11px] text-gray-400 mb-2">{fmtDate(n.published_at)}</p>}
              <p className="text-sm text-gray-600 whitespace-pre-line">{n.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default NewsFeedPage;
