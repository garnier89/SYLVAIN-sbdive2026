import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LocaleProvider } from './contexts/LocaleContext';
import { Toaster } from './components/ui/sonner';
import InstallPWA from './components/InstallPWA';
import AuthCallback from './components/AuthCallback';
import VoiceAssistant from './components/VoiceAssistant';
import { KioskApp } from './routes/pages';
import { clientRoutes } from './routes/clientRoutes';
import { driverRoutes } from './routes/driverRoutes';
import { merchantRoutes } from './routes/merchantRoutes';
import { adminRoutes } from './routes/adminRoutes';
import { panelRoutes } from './routes/panelRoutes';
import './index.css';

const PageLoader = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div className="w-9 h-9 border-[3px] border-gray-200 border-t-[#FF5000] rounded-full animate-spin" />
  </div>
);

const AppRouter = () => {
  const location = useLocation();
  const { user } = useAuth();

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
          <Route path="/auth/callback" element={<AuthCallback />} />

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
          <AppRouter />
          <Toaster position="top-center" />
          <InstallPWA />
        </LocaleProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
