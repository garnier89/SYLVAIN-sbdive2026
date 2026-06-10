import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { autoSubscribePush } from '../lib/webpush';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    // CRITICAL: If returning from OAuth callback, skip the /me check.
    // AuthCallback will exchange the session_id and establish the session first.
    if (window.location.hash?.includes('session_id=')) {
      setLoading(false);
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/api/auth/me`, {
        withCredentials: true,
      });
      setUser(response.data);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Subscribe this browser to Web Push once a user is authenticated.
  useEffect(() => {
    if (user) autoSubscribePush();
  }, [user]);

  const login = async (email, password) => {
    const response = await axios.post(
      `${API_URL}/api/auth/login`,
      { email, password },
      { withCredentials: true }
    );
    setUser(response.data.user);
    return response.data;
  };

  const register = async (data) => {
    const response = await axios.post(
      `${API_URL}/api/auth/register`,
      data,
      { withCredentials: true }
    );
    setUser(response.data.user);
    return response.data;
  };

  const logout = async () => {
    try {
      await axios.post(`${API_URL}/api/auth/logout`, {}, { withCredentials: true });
    } catch (error) {
      console.error('Logout error:', error);
    }
    setUser(null);
  };

  const loginWithGoogle = (roleHint = 'user') => {
    // Remember whether the user is signing in as a client or a chauffeur so the
    // backend can assign the right role to a brand-new Google account (the OAuth
    // redirect drops query state, so we stash it in sessionStorage).
    try { sessionStorage.setItem('sb_oauth_role', roleHint === 'driver' ? 'driver' : 'user'); } catch (e) { /* ignore */ }
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/auth/callback';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const handleGoogleCallback = async (sessionId) => {
    let roleHint = 'user';
    try { roleHint = sessionStorage.getItem('sb_oauth_role') || 'user'; } catch (e) { /* ignore */ }
    const response = await axios.post(
      `${API_URL}/api/auth/google/session`,
      { session_id: sessionId, role_hint: roleHint },
      { withCredentials: true }
    );
    try { sessionStorage.removeItem('sb_oauth_role'); } catch (e) { /* ignore */ }
    setUser(response.data.user);
    return response.data;
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    loginWithGoogle,
    handleGoogleCallback,
    checkAuth,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
