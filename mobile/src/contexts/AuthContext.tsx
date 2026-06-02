import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { authAPI } from '@/api/endpoints';
import { clearTokens, setTokens, getAccessToken } from '@/api/client';

type User = {
  id: string;
  email?: string;
  phone?: string;
  name?: string;
  role: 'user' | 'driver' | 'merchant' | 'admin' | string;
  [key: string]: any;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (data: { email?: string; phone?: string; password: string }) => Promise<User>;
  loginWithOtp: (phone: string, otp: string) => Promise<User>;
  register: (data: any) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (u: User | null) => void;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) {
        setUser(null);
        return;
      }
      const res = await authAPI.me();
      setUser(res.data);
    } catch {
      setUser(null);
      await clearTokens();
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refreshUser();
      setLoading(false);
    })();
  }, [refreshUser]);

  const persistAndSet = async (data: any) => {
    const access = data?.access_token;
    const refresh = data?.refresh_token ?? null;
    if (access) await setTokens(access, refresh);
    const u = data?.user ?? null;
    setUser(u);
    return u;
  };

  const login = useCallback(async (payload: any) => {
    const res = await authAPI.login(payload);
    return (await persistAndSet(res.data)) as User;
  }, []);

  const loginWithOtp = useCallback(async (phone: string, otp: string) => {
    const res = await authAPI.verifyOtp(phone, otp);
    return (await persistAndSet(res.data)) as User;
  }, []);

  const register = useCallback(async (payload: any) => {
    const res = await authAPI.register(payload);
    return (await persistAndSet(res.data)) as User;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch {}
    await clearTokens();
    setUser(null);
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      login,
      loginWithOtp,
      register,
      logout,
      refreshUser,
      setUser,
    }),
    [user, loading, login, loginWithOtp, register, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
