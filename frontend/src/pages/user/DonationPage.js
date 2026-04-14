import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, HandHeart, ArrowSquareOut } from '@phosphor-icons/react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const DonationPage = () => {
  const navigate = useNavigate();
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDonations();
  }, []);

  const fetchDonations = async () => {
    try {
      const res = await fetch(`${API_URL}/api/donations`, {
        credentials: 'include',
      });
      if (res.ok) setDonations(await res.json());
    } catch (err) { console.error('Failed to load donations:', err); }
    finally { setLoading(false); }
  };

  return (
    <div className="mobile-container min-h-screen bg-[#F2F2F7] pb-8" data-testid="donation-page">
      {/* Header */}
      <div className="bg-[#FF4500] px-5 pt-5 pb-14">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center" data-testid="back-btn">
            <ArrowLeft size={20} className="text-white" />
          </button>
          <h1 className="text-lg font-bold text-white">Faire un don</h1>
        </div>
        <p className="text-white/80 text-sm">Soutenez les causes qui vous tiennent à coeur</p>
      </div>

      {/* Content */}
      <div className="px-4 -mt-8 relative z-10 space-y-4">
        {loading ? (
          <div className="bg-white rounded-2xl p-8 flex items-center justify-center shadow-sm">
            <div className="w-8 h-8 border-3 border-[#FF4500]/30 border-t-[#FF4500] rounded-full animate-spin" />
          </div>
        ) : donations.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <HandHeart size={48} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Aucune campagne de don disponible pour le moment.</p>
          </div>
        ) : (
          donations.map((d) => (
            <div key={d.id} className="bg-white rounded-2xl shadow-sm overflow-hidden" data-testid={`donation-${d.id}`}>
              {d.image && (
                <img src={d.image} alt={d.title} className="w-full h-40 object-cover" />
              )}
              <div className="p-4">
                <h3 className="font-bold text-gray-900 mb-1">{d.title}</h3>
                <p className="text-sm text-gray-500 mb-3 line-clamp-3">{d.description}</p>
                {d.link && (
                  <a
                    href={d.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-[#FF4500] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#E03D00] transition-colors"
                    data-testid={`donate-link-${d.id}`}
                  >
                    <Heart size={16} weight="fill" />
                    Faire un don
                    <ArrowSquareOut size={14} />
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DonationPage;
