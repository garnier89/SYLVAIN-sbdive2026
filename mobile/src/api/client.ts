import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const API_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (Constants.expoConfig?.extra as any)?.backendUrl ||
  '';

if (!API_URL) {
  console.warn('[api] EXPO_PUBLIC_BACKEND_URL is not set');
}

const TOKEN_KEY = 'sbdrive.access_token';
const REFRESH_KEY = 'sbdrive.refresh_token';

export async function setTokens(access: string | null, refresh?: string | null) {
  if (access) await SecureStore.setItemAsync(TOKEN_KEY, access);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
  if (refresh !== undefined) {
    if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh);
    else await SecureStore.deleteItemAsync(REFRESH_KEY);
  }
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

const api: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    (config.headers as any) = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth refresh queue (simple)
let isRefreshing = false;
let pendingQueue: Array<{ resolve: () => void; reject: (e: any) => void }> = [];

function flushQueue(err: any) {
  pendingQueue.forEach((p) => (err ? p.reject(err) : p.resolve()));
  pendingQueue = [];
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
    if (!originalRequest || originalRequest._retry) return Promise.reject(error);
    const status = error.response?.status;
    const url = (originalRequest.url || '').toString();
    if (status === 401 && !url.includes('/auth/')) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({
            resolve: () => resolve(api(originalRequest)),
            reject,
          });
        });
      }
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
        if (!refresh) throw new Error('No refresh token');
        const res = await axios.post(
          `${API_URL}/api/auth/refresh`,
          {},
          { headers: { Authorization: `Bearer ${refresh}` } }
        );
        const newAccess = res.data?.access_token;
        if (newAccess) await setTokens(newAccess);
        flushQueue(null);
        return api(originalRequest);
      } catch (e) {
        flushQueue(e);
        await clearTokens();
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export { API_URL };
export default api;
