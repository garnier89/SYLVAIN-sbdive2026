import { useEffect, useRef, useState } from 'react';
import { API_URL } from '@/api/client';
import { authAPI } from '@/api/endpoints';

type Options = {
  enabled?: boolean;
  rideId?: string | null;
  onMessage?: (msg: any) => void;
};

// Lightweight WS hook against /api/ws/{client_id}.
// Auto-joins a ride room if rideId is provided.
export default function useRideSocket({ enabled = true, rideId, onMessage }: Options) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      let clientId = `guest-${Math.random().toString(36).slice(2)}`;
      try {
        const me = await authAPI.me();
        if (me.data?.id) clientId = me.data.id;
      } catch {}
      if (cancelled) return;
      const url = API_URL.replace(/^http/, 'ws') + `/api/ws/${encodeURIComponent(clientId)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        if (rideId) ws.send(JSON.stringify({ type: 'join_ride', ride_id: rideId }));
      };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          onMessageRef.current?.(msg);
        } catch {}
      };
      ws.onclose = () => setConnected(false);
      ws.onerror = () => setConnected(false);
    })();

    return () => {
      cancelled = true;
      try {
        wsRef.current?.close();
      } catch {}
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, rideId]);

  const send = (data: any) => {
    try {
      wsRef.current?.send(JSON.stringify(data));
    } catch {}
  };

  return { connected, send };
}
