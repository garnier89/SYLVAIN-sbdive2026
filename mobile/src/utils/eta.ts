// ETA helpers — client-side estimation (no API cost).
import { metersBetween } from './geo';

// Average urban driving speed (km/h) per vehicle type
const AVG_SPEED_KMH: Record<string, number> = {
  economic: 30,
  comfort: 32,
  premium: 34,
  default: 30,
  moto: 38,
  bike: 38,
  scooter: 35,
};

export function estimateEtaMinutes(
  fromLat: number | null | undefined,
  fromLng: number | null | undefined,
  toLat: number | null | undefined,
  toLng: number | null | undefined,
  vehicleType?: string
): number | null {
  if (
    fromLat == null ||
    fromLng == null ||
    toLat == null ||
    toLng == null
  )
    return null;
  const meters = metersBetween(
    { lat: fromLat, lng: fromLng },
    { lat: toLat, lng: toLng }
  );
  if (!isFinite(meters) || meters <= 0) return 0;
  const speed = AVG_SPEED_KMH[(vehicleType || '').toLowerCase()] ?? AVG_SPEED_KMH.default;
  // Driving distance is ~1.3x crow-flies in urban contexts
  const drivingKm = (meters / 1000) * 1.3;
  const hours = drivingKm / speed;
  return Math.max(1, Math.round(hours * 60));
}

export function formatEta(min: number | null): string {
  if (min == null) return '—';
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}
