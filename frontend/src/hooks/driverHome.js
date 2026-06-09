import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { rideAPI } from '../services/api';
import { playAlert } from '../lib/driverAlert';

const API = process.env.REACT_APP_BACKEND_URL;

// Heat-map demand cells, refreshed every 30s while the layer is toggled on.
export function useHeatmap(enabled) {
  const [heatPoints, setHeatPoints] = useState([]);
  useEffect(() => {
    if (!enabled) return undefined;
    const load = async () => {
      try {
        const res = await fetch(`${API}/api/phase2/heatmap`, { credentials: 'include' });
        if (!res.ok) return;
        const d = await res.json();
        setHeatPoints(d.points || []);
      } catch { /* ignore */ }
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [enabled]);
  return heatPoints;
}

// V3Cube driver home feed: scheduled (RED) / upcoming circle / available (YELLOW)
// / deliveries (BLUE), with sound+vibration alerts on new reservations and T-40min.
export function useDriverHomeFeed() {
  const [homeFeed, setHomeFeed] = useState({
    scheduled_pending: [], upcoming: [], available_rides: [], available_deliveries: [], next_scheduled_at: null,
  });
  const seenScheduledRef = useRef(null); // Set of known scheduled ids (null = not yet primed)
  const alerted40Ref = useRef(new Set());

  useEffect(() => {
    let alive = true;
    const beep = () => playAlert();
    const loadFeed = async () => {
      try {
        const res = await rideAPI.driverHomeFeed();
        if (!alive) return;
        const feed = res.data;
        setHomeFeed(feed);
        const ids = (feed.scheduled_pending || []).map((r) => r.id);
        if (seenScheduledRef.current === null) {
          seenScheduledRef.current = new Set(ids); // prime without alerting
        } else {
          const fresh = ids.filter((id) => !seenScheduledRef.current.has(id));
          if (fresh.length) {
            fresh.forEach((id) => seenScheduledRef.current.add(id));
            beep();
            toast.success(`Nouvelle réservation planifiée (${fresh.length})`, { description: 'En attente de votre acceptation.' });
          }
        }
        (feed.upcoming || []).forEach((r) => {
          if (!r.scheduled_at || alerted40Ref.current.has(r.id)) return;
          const mins = (new Date(r.scheduled_at).getTime() - Date.now()) / 60000;
          if (mins > 0 && mins <= 40) {
            alerted40Ref.current.add(r.id);
            beep();
            toast.warning(`Course à venir dans ${Math.round(mins)} min`, { description: r.pickup_address });
          }
        });
      } catch { /* ignore */ }
    };
    loadFeed();
    const id = setInterval(loadFeed, 12000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return { homeFeed, setHomeFeed };
}

// Active zone bonuses (driver-shortage incentives), polled every 30s. The setter
// is also used by the `zone_bonus_active` WebSocket handler in DriverHome.
export function useZoneBonuses() {
  const [zoneBonuses, setZoneBonuses] = useState([]);
  useEffect(() => {
    let active = true;
    const fetchBonuses = async () => {
      try {
        const res = await fetch(`${API}/api/rides/active-zone-bonuses`, { credentials: 'include' });
        if (active && res.ok) { const d = await res.json(); setZoneBonuses(d.bonuses || []); }
      } catch { /* non-blocking */ }
    };
    fetchBonuses();
    const id = setInterval(fetchBonuses, 30000);
    return () => { active = false; clearInterval(id); };
  }, []);
  return { zoneBonuses, setZoneBonuses };
}
