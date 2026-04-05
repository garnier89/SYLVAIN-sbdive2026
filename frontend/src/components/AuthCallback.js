import React, { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Car } from '@phosphor-icons/react';

const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { handleGoogleCallback, setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double processing in StrictMode
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processCallback = async () => {
      const hash = location.hash;
      const sessionIdMatch = hash.match(/session_id=([^&]+)/);
      
      if (sessionIdMatch) {
        const sessionId = sessionIdMatch[1];
        try {
          const result = await handleGoogleCallback(sessionId);
          // Redirect based on role
          const roleRedirects = {
            user: '/',
            driver: '/driver',
            merchant: '/merchant',
            admin: '/admin',
            dispatcher: '/dispatcher',
          };
          navigate(roleRedirects[result.user.role] || '/', { 
            replace: true,
            state: { user: result.user }
          });
        } catch (error) {
          console.error('Auth callback error:', error);
          navigate('/login', { replace: true });
        }
      } else {
        navigate('/login', { replace: true });
      }
    };

    processCallback();
  }, [location, handleGoogleCallback, navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
          <Car size={32} weight="duotone" className="text-primary" />
        </div>
        <p className="text-muted-foreground">Authenticating...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
