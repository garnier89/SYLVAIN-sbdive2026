import { useEffect, useRef, useState, useCallback } from 'react';

const API = process.env.REACT_APP_BACKEND_URL;

export function useWebSocket(userId) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const reconnectTimer = useRef(null);
  const listeners = useRef(new Map());

  const connect = useCallback(() => {
    if (!userId) return;
    const wsUrl = API.replace('https://', 'wss://').replace('http://', 'ws://');
    const ws = new WebSocket(`${wsUrl}/ws/${userId}`);

    ws.onopen = () => {
      setConnected(true);
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
      // Auto-reconnect after 3s
      reconnectTimer.current = setTimeout(() => connect(), 3000);
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
