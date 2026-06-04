import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { parcelAPI, medicalAPI } from '@/api/endpoints';
import useRideSocket from '@/hooks/useRideSocket';

type MissionEvent = { text: string; tone: 'success' | 'urgent'; ts: number };

type Ctx = {
  availParcels: any[];
  availTransports: any[];
  activeParcels: any[];
  activeTransports: any[];
  loading: boolean;
  availableCount: number;
  activeCount: number;
  latestEvent: MissionEvent | null;
  refresh: () => Promise<void>;
};

const DriverMissionsContext = createContext<Ctx | null>(null);

const fEuro = (v: any) => (typeof v === 'number' ? v.toFixed(2) : v ?? '--');

export function DriverMissionsProvider({ children }: { children: React.ReactNode }) {
  const [availParcels, setAvailParcels] = useState<any[]>([]);
  const [availTransports, setAvailTransports] = useState<any[]>([]);
  const [activeParcels, setActiveParcels] = useState<any[]>([]);
  const [activeTransports, setActiveTransports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [latestEvent, setLatestEvent] = useState<MissionEvent | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [ap, at, mp, mt] = await Promise.all([
        parcelAPI.driverAvailable(),
        medicalAPI.transportDriverAvailable(),
        parcelAPI.driverActive(),
        medicalAPI.transportDriverActive(),
      ]);
      setAvailParcels(ap.data || []);
      setAvailTransports(at.data || []);
      setActiveParcels(mp.data || []);
      setActiveTransports(mt.data || []);
    } catch {
      // keep previous data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 25000); // fallback poll
    return () => clearInterval(id);
  }, [refresh]);

  // Single WS connection for the whole driver session (avoids client_id conflict)
  const onSocket = useCallback((msg: any) => {
    if (msg?.type === 'new_parcel') {
      setLatestEvent({ text: `📦 Nouvelle livraison · ${fEuro(msg.fare)} €`, tone: 'success', ts: Date.now() });
      refresh();
    } else if (msg?.type === 'new_transport') {
      const urgent = msg.urgency && msg.urgency !== 'normal';
      setLatestEvent({ text: `🚑 Nouveau transport médical${urgent ? ' (URGENT)' : ''} · ${fEuro(msg.fare)} €`, tone: urgent ? 'urgent' : 'success', ts: Date.now() });
      refresh();
    }
  }, [refresh]);

  useRideSocket({ enabled: true, onMessage: onSocket });

  const availableCount = availParcels.length + availTransports.length;
  const activeCount = activeParcels.length + activeTransports.length;

  return (
    <DriverMissionsContext.Provider
      value={{ availParcels, availTransports, activeParcels, activeTransports, loading, availableCount, activeCount, latestEvent, refresh }}
    >
      {children}
    </DriverMissionsContext.Provider>
  );
}

export function useDriverMissions() {
  const ctx = useContext(DriverMissionsContext);
  if (!ctx) throw new Error('useDriverMissions must be used within DriverMissionsProvider');
  return ctx;
}
