import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LocaleProvider } from './contexts/LocaleContext';
import { CallProvider } from './contexts/CallContext';
import { Toaster } from './components/ui/sonner';
import InstallPWA from './components/InstallPWA';
import EnableNotificationsBanner from './components/EnableNotificationsBanner';
import ActiveRideFlag from './components/ActiveRideFlag';
import VerifyEmailBanner from './components/VerifyEmailBanner';
import DemoBanner from './components/DemoBanner';
import AuthCallback from './components/AuthCallback';
import VoiceAssistant from './components/VoiceAssistant';
import { KioskApp, ProAccessPage, SbStoreSignupPage } from './routes/pages';

const SharedTripPage = React.lazy(() => import('./pages/SharedTripPage'));
import { clientRoutes } from './routes/clientRoutes';
import { driverRoutes } from './routes/driverRoutes';
import { merchantRoutes } from './routes/merchantRoutes';
import { adminRoutes } from './routes/adminRoutes';
import { panelRoutes } from './routes/panelRoutes';
import { useRoutePrefetch } from './routes/useRoutePrefetch';
import './index.css';

const PageLoader = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div className="w-9 h-9 border-[3px] border-gray-200 border-t-[#FF5000] rounded-full animate-spin" />
  </div>
);

const AppRouter = () => {
  const location = useLocation();
  const { user } = useAuth();

  useRoutePrefetch(user?.role);

  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  // Mount global voice FAB ONLY on the passenger home screen (/home)
  const showVoiceFab = !!user && user.role === 'user' && location.pathname === '/home';

  return (
    <>
      {showVoiceFab && <VoiceAssistant />}
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* ======= SB DRIVE TAB (Kiosk libre-service) ======= */}
          <Route path="/kiosk" element={<KioskApp />} />
          <Route path="/tab" element={<KioskApp />} />
          {/* ======= Espace Pro — hub de connexion multi-apps ======= */}
          <Route path="/connexion" element={<ProAccessPage />} />
          <Route path="/espace-pro" element={<ProAccessPage />} />
          <Route path="/apps" element={<ProAccessPage />} />
          {/* ======= SB Store — inscription self-service commerçant ======= */}
          <Route path="/sb-store/inscription" element={<SbStoreSignupPage />} />
          <Route path="/store-signup" element={<SbStoreSignupPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* ======= PUBLIC — Suivi de trajet partagé (sécurité, sans login) ======= */}
          <Route path="/t/:token" element={<SharedTripPage />} />

          {/* ======= SB DRIVE CLIENT (App Passager) ======= */}
          {clientRoutes(user)}

          {/* ======= SB DRIVE CHAUFFEUR (App Chauffeur) ======= */}
          {driverRoutes(user)}

          {/* ======= MERCHANT ======= */}
          {merchantRoutes()}

          {/* ======= ADMIN ======= */}
          {adminRoutes()}

          {/* ======= DISPATCHER & ROLE-BASED PANELS ======= */}
          {panelRoutes()}

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LocaleProvider>
          <CallProvider>
            <AppRouter />
          </CallProvider>
          <DemoBanner />
          <Toaster position="top-center" />
          <InstallPWA />
          <EnableNotificationsBanner />
          <ActiveRideFlag />
          <VerifyEmailBanner />
        </LocaleProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
