import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { driverAPI } from '../../services/api';
import { DriverBottomNav } from './DriverEarningsPage';
import {
  User, Car, Star, SignOut, Phone, Envelope, FileText, ShieldCheck,
  Wallet, CaretRight, Gear, CheckCircle, Clock, XCircle
} from '@phosphor-icons/react';

const DriverProfilePage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const res = await driverAPI.getProfile();
      setDriver(res.data);
    } catch { }
    finally { setLoading(false); }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/chauffeur');
  };

  if (loading) {
    return (
      <div className="mobile-container min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-12 h-12 border-3 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  const statusConfig = {
    approved: { label: 'Approuv\u00e9', color: 'text-emerald-400', bg: 'bg-emerald-500/10', Icon: CheckCircle },
    pending: { label: 'En attente', color: 'text-amber-400', bg: 'bg-amber-500/10', Icon: Clock },
    rejected: { label: 'Rejet\u00e9', color: 'text-red-400', bg: 'bg-red-500/10', Icon: XCircle },
  };
  const status = statusConfig[driver?.status] || statusConfig.pending;

  return (
    <div className="mobile-container min-h-screen bg-gray-950 flex flex-col pb-20" data-testid="driver-profile-page">
      {/* Profile Header */}
      <div className="px-5 pt-6 pb-2">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center border-2 border-amber-500/40">
            <User size={32} className="text-amber-500" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white" data-testid="profile-name">{user?.name || 'Chauffeur'}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Star size={14} weight="fill" className="text-amber-500" />
              <span className="text-gray-400 text-sm">{driver?.rating?.toFixed(1) || '5.0'}</span>
              <span className="text-gray-600 text-sm">&bull;</span>
              <span className="text-gray-400 text-sm">{driver?.total_trips || 0} courses</span>
            </div>
          </div>
        </div>
        {/* Status Badge */}
        <div className={`mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl ${status.bg}`}>
          <status.Icon size={18} weight="fill" className={status.color} />
          <span className={`text-sm font-semibold ${status.color}`}>Statut: {status.label}</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3 px-5 mt-5">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
          <p className="text-white font-bold text-lg">{driver?.total_trips || 0}</p>
          <p className="text-gray-500 text-xs">Courses</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
          <p className="text-white font-bold text-lg">{(driver?.earnings || 0).toFixed(0)}&euro;</p>
          <p className="text-gray-500 text-xs">Gains</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
          <p className="text-white font-bold text-lg">{driver?.rating?.toFixed(1) || '5.0'}</p>
          <p className="text-gray-500 text-xs">Note</p>
        </div>
      </div>

      {/* Menu Items */}
      <div className="px-5 mt-6 space-y-1">
        <h3 className="text-gray-400 text-xs uppercase tracking-wide font-bold mb-2 px-1">Informations</h3>

        <MenuItem icon={Phone} label="T&eacute;l&eacute;phone" value={user?.phone || '-'} />
        <MenuItem icon={Envelope} label="Email" value={user?.email || '-'} />
        <MenuItem icon={Car} label="V&eacute;hicule"
          value={driver ? `${driver.vehicle_model || '-'} (${driver.vehicle_number || '-'})` : '-'} />
        <MenuItem icon={FileText} label="Permis" value={driver?.license_number || '-'} />

        <h3 className="text-gray-400 text-xs uppercase tracking-wide font-bold mb-2 mt-5 px-1">Actions</h3>

        <MenuButton icon={Wallet} label="Mon portefeuille" onClick={() => navigate('/wallet')} />
        <MenuButton icon={FileText} label="Mes documents"
          badge={driver?.documents?.length ? `${driver.documents.length} fichier(s)` : null}
          onClick={() => navigate('/driver/register')} />
        <MenuButton icon={ShieldCheck} label="Aide & Support" onClick={() => navigate('/support')} />
        <MenuButton icon={Gear} label="Param&egrave;tres" onClick={() => {}} />

        {/* Logout */}
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-red-500/10 mt-4 hover:bg-red-500/20 transition-colors"
          data-testid="logout-btn">
          <SignOut size={20} className="text-red-400" />
          <span className="text-red-400 font-medium text-sm">D&eacute;connexion</span>
        </button>
      </div>

      <DriverBottomNav active="profile" navigate={navigate} />
    </div>
  );
};

const MenuItem = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gray-900 border border-gray-800">
    <Icon size={18} className="text-amber-500 flex-shrink-0" />
    <span className="text-gray-400 text-sm flex-shrink-0">{label}</span>
    <span className="text-white text-sm ml-auto truncate max-w-[180px] text-right">{value}</span>
  </div>
);

const MenuButton = ({ icon: Icon, label, badge, onClick }) => (
  <button onClick={onClick}
    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gray-900 border border-gray-800 hover:bg-gray-800 transition-colors">
    <Icon size={18} className="text-amber-500 flex-shrink-0" />
    <span className="text-white text-sm font-medium">{label}</span>
    {badge && <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full ml-auto">{badge}</span>}
    <CaretRight size={16} className="text-gray-500 ml-auto flex-shrink-0" />
  </button>
);

export default DriverProfilePage;
