import { useEffect, useRef, useState, useCallback } from 'react';
import { playAlert } from '../lib/driverAlert';

const API = process.env.REACT_APP_BACKEND_URL;

// Event types that should trigger an in-app notification sound when received
// while the app is in the foreground (background delivery uses the OS sound).
const SOUND_EVENT_TYPES = new Set([
  'ride_status_update',
  'ride_cancelled',
  'new_message',
  'notification',
  'scheduled_reservation',
  'driver_nearby',
  'payment_switched_to_cash',
]);

function maybePlayNotificationSound(data) {
  try {
    if (!data || !SOUND_EVENT_TYPES.has(data.type)) return;
    // For ride status, only chime on meaningful passenger-facing transitions.
    if (data.type === 'ride_status_update' &&
        !['arriving', 'in_progress', 'completed'].includes(data.status)) return;
    playAlert();
  } catch { /* ignore */ }
}

export function useWebSocket(userId) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const reconnectTimer = useRef(null);
  const retryRef = useRef(0);
  const listeners = useRef(new Map());

  const connect = useCallback(() => {
    if (!userId) return;
    const wsUrl = API.replace('https://', 'wss://').replace('http://', 'ws://');
    const ws = new WebSocket(`${wsUrl}/api/ws/${userId}`);

    ws.onopen = () => {
      setConnected(true);
      retryRef.current = 0;  // reset backoff once a connection succeeds
      // Keep-alive ping every 25s
      wsRef.current._pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
        maybePlayNotificationSound(data);
        // Notify type-specific listeners
        const typeListeners = listeners.current.get(data.type);
        if (typeListeners) {
          typeListeners.forEach(cb => cb(data));
        }
        // Notify wildcard listeners
        const allListeners = listeners.current.get('*');
        if (allListeners) {
          allListeners.forEach(cb => cb(data));
        }
      } catch (e) {
        // ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      clearInterval(wsRef.current?._pingInterval);
      // Auto-reconnect with exponential backoff (3s → 6s → 12s … capped 30s) to
      // avoid a handshake storm when the proxy rate-limits (HTTP 429) under rapid
      // navigation. The delay resets to 3s as soon as a connection succeeds.
      const delay = Math.min(30000, 3000 * 2 ** retryRef.current);
      retryRef.current += 1;
      reconnectTimer.current = setTimeout(() => connect(), delay);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [userId]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      clearInterval(wsRef.current?._pingInterval);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const on = useCallback((type, callback) => {
    if (!listeners.current.has(type)) {
      listeners.current.set(type, new Set());
    }
    listeners.current.get(type).add(callback);
    return () => listeners.current.get(type)?.delete(callback);
  }, []);

  const joinRide = useCallback((rideId) => {
    send({ type: 'join_ride', ride_id: rideId });
  }, [send]);

  const sendLocation = useCallback((lat, lng) => {
    send({ type: 'location_update', lat, lng });
  }, [send]);

  return { connected, lastMessage, send, on, joinRide, sendLocation };
}
