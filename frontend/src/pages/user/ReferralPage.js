import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  ArrowLeft, Copy, Share, Gift, Users, Wallet, CheckCircle
} from '@phosphor-icons/react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const ReferralPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/referral/my-code`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (stats?.code) {
      navigator.clipboard.writeText(stats.code);
      setCopied(true);
      toast.success('Code copié !');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareCode = () => {
    if (navigator.share && stats?.code) {
      navigator.share({
        title: 'SB Drive VTC',
        text: `Rejoignez SB Drive avec mon code ${stats.code} et recevez ${stats.amount_per_referral}${stats.currency} de bonus !`,
        url: window.location.origin,
      }).catch(() => {});
    } else {
      copyCode();
    }
  };

  if (loading) {
    return (
      <div className="mobile-container min-h-screen bg-[#F2F2F7] flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[#FF4500]/30 border-t-[#FF4500] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen bg-[#F2F2F7] pb-8" data-testid="referral-page">
      {/* Header */}
      <div className="bg-[#FF4500] px-5 pt-5 pb-16">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center"
            data-testid="back-btn"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
          <h1 className="text-lg font-bold text-white">Inviter des amis</h1>
        </div>
        <p className="text-white/80 text-sm">
          Partagez votre code et gagnez {stats?.amount_per_referral || 5}{stats?.currency || 'EUR'} pour chaque ami qui rejoint !
        </p>
      </div>

      {/* Referral Code Card */}
      <div className="px-4 -mt-10 relative z-10">
        <div className="bg-white rounded-2xl shadow-lg p-5">
          <p className="text-sm text-gray-500 mb-2 text-center">Votre code de parrainage</p>
          <div className="bg-orange-50 border-2 border-dashed border-[#FF4500] rounded-xl py-4 px-6 flex items-center justify-center gap-3 mb-4">
            <span className="text-2xl font-black text-[#FF4500] tracking-wider" data-testid="referral-code">
              {stats?.code || '---'}
            </span>
            <button
              onClick={copyCode}
              className="w-9 h-9 rounded-full bg-[#FF4500]/10 flex items-center justify-center"
              data-testid="copy-code-btn"
            >
              {copied ? <CheckCircle size={20} className="text-green-500" /> : <Copy size={20} className="text-[#FF4500]" />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={copyCode}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm"
              data-testid="copy-btn"
            >
              <Copy size={18} />
              Copier
            </button>
            <button
              onClick={shareCode}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-[#FF4500] text-white font-medium text-sm"
              data-testid="share-btn"
            >
              <Share size={18} />
              Partager
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-4 mt-5 grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-4 text-center shadow-sm">
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-2">
            <Users size={20} className="text-[#FF4500]" />
          </div>
          <p className="text-xl font-bold text-gray-900" data-testid="total-referrals">{stats?.total_referrals || 0}</p>
          <p className="text-[11px] text-gray-500">Amis invités</p>
        </div>
        <div className="bg-white rounded-xl p-4 text-center shadow-sm">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
            <Wallet size={20} className="text-green-600" />
          </div>
          <p className="text-xl font-bold text-gray-900" data-testid="total-earned">{stats?.total_earned || 0}</p>
          <p className="text-[11px] text-gray-500">EUR gagnés</p>
        </div>
        <div className="bg-white rounded-xl p-4 text-center shadow-sm">
          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-2">
            <Gift size={20} className="text-purple-600" />
          </div>
          <p className="text-xl font-bold text-gray-900" data-testid="amount-per-ref">{stats?.amount_per_referral || 5}</p>
          <p className="text-[11px] text-gray-500">EUR / ami</p>
        </div>
      </div>

      {/* How it works */}
      <div className="px-4 mt-6">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Comment ça marche ?</h3>
        <div className="bg-white rounded-2xl p-4 space-y-4 shadow-sm">
          {[
            { step: '1', text: 'Partagez votre code de parrainage avec vos amis' },
            { step: '2', text: 'Votre ami s\'inscrit avec votre code' },
            { step: '3', text: `Vous recevez tous les deux ${stats?.amount_per_referral || 5}${stats?.currency || 'EUR'} sur votre portefeuille !` },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-[#FF4500] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{item.step}</span>
              </div>
              <p className="text-sm text-gray-600 pt-0.5">{item.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Referral List */}
      {stats?.referrals?.length > 0 && (
        <div className="px-4 mt-6">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Vos parrainages</h3>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
            {stats.referrals.map((ref) => (
              <div key={ref.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center">
                  <Users size={16} className="text-[#FF4500]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{ref.referred_name || 'Utilisateur'}</p>
                  <p className="text-[11px] text-gray-400">
                    {new Date(ref.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <span className="text-sm font-bold text-green-600">+{ref.amount_earned}{ref.currency}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferralPage;
