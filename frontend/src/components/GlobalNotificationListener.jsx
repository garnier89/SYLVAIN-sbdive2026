import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;
const POLL_MS = 20000;

/**
 * GlobalNotificationListener — affiche une notification in-app (toast) dès qu'une
 * nouvelle notification serveur arrive, même si l'utilisateur n'a PAS activé le
 * Web Push. Sondage léger de /api/push/list (le manager WebSocket ne garde qu'une
 * connexion par utilisateur → un 2ᵉ socket casserait le suivi de course, d'où le
 * polling). N'affiche jamais l'historique au 1er chargement (baseline horodatée,
 * persistée par utilisateur pour ne pas re-notifier après un rechargement).
 */
const GlobalNotificationListener = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const baselineRef = useRef(0);
  const seenRef = useRef(new Set());

  useEffect(() => {
    if (!user?.id) return undefined;
    const lsKey = `sb_notif_baseline_${user.id}`;
    baselineRef.current = Number(localStorage.getItem(lsKey) || 0);
    let stopped = false;

    const ts = (n) => {
      const t = Date.parse(n?.created_at || '');
      return Number.isFinite(t) ? t : 0;
    };

    const poll = async (firstRun) => {
      try {
        const res = await fetch(`${API}/api/push/list`, { credentials: 'include' });
        if (!res.ok) return;
        const items = await res.json();
        if (!Array.isArray(items) || !items.length) return;
        const newest = items.reduce((m, n) => Math.max(m, ts(n)), 0);

        if (firstRun && !baselineRef.current) {
          // Premier passage sans historique connu : ne pas spammer l'existant.
          baselineRef.current = newest;
          localStorage.setItem(lsKey, String(newest));
          return;
        }

        const fresh = items
          .filter((n) => ts(n) > baselineRef.current && !n.read && !seenRef.current.has(n.id))
          .sort((a, b) => ts(a) - ts(b));

        fresh.slice(-3).forEach((n) => {
          seenRef.current.add(n.id);
          const url = n.data?.url || (n.data?.ride_id ? `/ride/${n.data.ride_id}` : null);
          toast(n.title || 'Notification', {
            description: n.body || undefined,
            duration: 7000,
            action: url ? { label: 'Voir', onClick: () => navigate(url) } : undefined,
          });
        });

        if (newest > baselineRef.current) {
          baselineRef.current = newest;
          localStorage.setItem(lsKey, String(newest));
        }
      } catch { /* réseau — ignore */ }
    };

    poll(true);
    const id = setInterval(() => { if (!stopped) poll(false); }, POLL_MS);
    return () => { stopped = true; clearInterval(id); };
  }, [user?.id, navigate]);

  return null;
};

export default GlobalNotificationListener;
