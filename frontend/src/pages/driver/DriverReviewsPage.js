import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretLeft, Star, ChatCircleText } from '@phosphor-icons/react';
import { driverAPI } from '../../services/api';

const Stars = ({ value, size = 14 }) => (
  <span className="inline-flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((i) => (
      <Star key={i} size={size} weight={i <= Math.round(value) ? 'fill' : 'regular'} className={i <= Math.round(value) ? 'text-[#F59E0B]' : 'text-gray-300'} />
    ))}
  </span>
);

const DriverReviewsPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    driverAPI.getReviews()
      .then((r) => setData(r.data))
      .catch(() => setData({ average: 5, total: 0, distribution: {}, reviews: [] }))
      .finally(() => setLoading(false));
  }, []);

  const dist = data?.distribution || {};
  const total = data?.total || 0;

  return (
    <div className="mobile-container min-h-screen bg-[#F2F2F7] pb-10" data-testid="driver-reviews-page">
      <div className="bg-[#0B1426] text-white px-4 pt-6 pb-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center" data-testid="reviews-back-btn"><CaretLeft size={20} /></button>
        <div>
          <h1 className="text-lg font-bold">Commentaires des utilisateurs</h1>
          <p className="text-xs text-white/60">Avis laissés par vos passagers</p>
        </div>
      </div>

      {loading ? <div className="p-6 text-gray-400 text-sm">Chargement…</div> : (
        <div className="p-4 space-y-3">
          {/* Summary */}
          <div className="bg-white rounded-2xl p-5 flex items-center gap-5" data-testid="reviews-summary">
            <div className="text-center shrink-0">
              <p className="text-4xl font-black text-[#0B1426]" data-testid="reviews-average">{Number(data?.average || 0).toFixed(1)}</p>
              <Stars value={data?.average || 0} size={16} />
              <p className="text-xs text-gray-400 mt-1">{total} avis</p>
            </div>
            <div className="flex-1 space-y-1">
              {[5, 4, 3, 2, 1].map((s) => {
                const c = dist[String(s)] || 0;
                const pct = total ? (c / total) * 100 : 0;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 w-3">{s}</span>
                    <Star size={11} weight="fill" className="text-[#F59E0B]" />
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-[#F59E0B]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] text-gray-400 w-5 text-right">{c}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* List */}
          {(data?.reviews || []).length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center" data-testid="reviews-empty">
              <ChatCircleText size={36} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Aucun avis pour le moment.</p>
              <p className="text-xs text-gray-400 mt-1">Vos évaluations apparaîtront ici après vos courses.</p>
            </div>
          ) : (
            (data.reviews).map((rev) => (
              <div key={rev.id} className="bg-white rounded-2xl p-4" data-testid={`review-${rev.id}`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-full bg-[#FF5000]/10 flex items-center justify-center text-[#FF5000] font-bold text-sm overflow-hidden">
                    {rev.user_avatar ? <img src={rev.user_avatar} alt="" className="w-full h-full object-cover" /> : (rev.user_name || 'C')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[#0B1426] truncate">{rev.user_name}</p>
                    <Stars value={rev.rating} />
                  </div>
                  {rev.created_at && <span className="text-[10px] text-gray-400">{new Date(rev.created_at).toLocaleDateString('fr-FR')}</span>}
                </div>
                {rev.comment && <p className="text-sm text-gray-600 leading-snug">{rev.comment}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default DriverReviewsPage;
