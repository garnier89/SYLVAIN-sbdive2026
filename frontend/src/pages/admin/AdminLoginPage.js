import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowCounterClockwise, User, SteeringWheel, Buildings } from '@phosphor-icons/react';

const adminTabs = ['All Admin', 'Dispatcher Admin', 'Billing Admin', 'Server Admin'];

const AdminLoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [activeTab, setActiveTab] = useState('All Admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Veuillez remplir tous les champs'); return; }
    setLoading(true); setError('');
    try {
      const result = await login(email, password);
      if (result.success) {
        if (result.user?.role === 'admin') navigate(result.user?.panel_preference || '/admin');
        else setError('Ce compte n\'a pas les droits administrateur');
      } else {
        setError(result.error || 'Identifiants invalides');
      }
    } catch (err) { setError('Erreur de connexion'); }
    finally { setLoading(false); }
  };

  const bottomLinks = [
    { icon: ArrowCounterClockwise, label: 'Main website', path: '/' },
    { icon: User, label: 'Client Login', path: '/login' },
    { icon: SteeringWheel, label: 'Chauffeur Login', path: '/chauffeur' },
    { icon: Buildings, label: 'Flotte - Entreprise Login', path: '/login' },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4" data-testid="admin-login-page">
      {/* Logo */}
      <div className="mb-4">
        <div className="w-20 h-20 mx-auto relative">
          <svg viewBox="0 0 80 80" className="w-full h-full">
            <circle cx="40" cy="40" r="38" fill="none" stroke="#FF4500" strokeWidth="3"/>
            <circle cx="40" cy="40" r="30" fill="none" stroke="#FFA500" strokeWidth="3"/>
            <circle cx="40" cy="40" r="22" fill="none" stroke="#FFD700" strokeWidth="3"/>
            <text x="40" y="48" textAnchor="middle" fontSize="24" fontWeight="bold" fill="#e53e3e" fontFamily="Arial">SB</text>
          </svg>
        </div>
      </div>

      {/* Title */}
      <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8 text-center" style={{ fontFamily: 'Georgia, Times, serif' }} data-testid="admin-login-title">
        Welcome to Admin Panel
      </h1>

      {/* Login Card */}
      <div className="w-full max-w-lg">
        {/* Tabs */}
        <div className="flex rounded-lg overflow-hidden mb-6 border border-gray-200" data-testid="admin-tabs">
          {adminTabs.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 px-2 text-sm font-medium text-center transition-all ${
                activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-50'}`}
              data-testid={`tab-${tab.toLowerCase().replace(/\s+/g, '-')}`}>
              {tab}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSignIn} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-800 mb-2">Admin E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email Address"
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-gray-700 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all"
              data-testid="admin-email-input" />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-800 mb-2">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 text-gray-700 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all"
              data-testid="admin-password-input" />
          </div>

          {/* Forgot password */}
          <div className="flex justify-end">
            <button type="button" className="text-sm text-blue-500 hover:text-blue-700 transition-colors" data-testid="forgot-password-link">
              mot de passe oublie?
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600" data-testid="login-error">
              {error}
            </div>
          )}

          {/* Sign In Button */}
          <div className="flex justify-center pt-2">
            <button type="submit" disabled={loading}
              className="bg-[#3b6df5] text-white font-bold text-sm tracking-wider px-12 py-3.5 rounded-full hover:bg-blue-700 disabled:opacity-50 transition-all shadow-sm"
              data-testid="admin-signin-btn">
              {loading ? 'CONNEXION...' : 'SIGN IN'}
            </button>
          </div>
        </form>
      </div>

      {/* Bottom Navigation Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16 w-full max-w-3xl" data-testid="bottom-nav-cards">
        {bottomLinks.map((link) => (
          <button key={link.path} onClick={() => navigate(link.path)}
            className="flex flex-col items-center justify-center py-6 px-4 rounded-xl border border-gray-200 bg-white hover:shadow-md hover:border-gray-300 transition-all group"
            data-testid={`nav-card-${link.label.toLowerCase().replace(/\s+/g, '-')}`}>
            <link.icon size={28} className="text-blue-500 mb-3 group-hover:text-blue-600 transition-colors" weight="regular" />
            <span className="text-sm text-gray-700 font-medium text-center leading-tight">{link.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default AdminLoginPage;
