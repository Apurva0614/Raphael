// Great-circle geospatial helpers.
// Frontend mirrors of Antigravity's server-side calcs so demo values stay
// consistent before /api/v1/analytics/* is wired up.

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Initial bearing from (lat1,lon1) to (lat2,lon2) in degrees [0,360). */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Haversine great-circle distance in kilometres. */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** "042°" formatter rounded to nearest degree, zero-padded to 3 digits. */
export function formatBearing(deg: number): string {
  return `${Math.round(deg).toString().padStart(3, "0")}°`;
}

/** "4.8 KM" / "770 M" formatter. */
export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} M`;
  return `${km.toFixed(1)} KM`;
}

/** Canonical Pune zone centroids (lat, lon). Replace with /api/v1/zones. */
export const PUNE_COORDS = {
  hadapsar: { lat: 18.4983, lon: 73.9258 },
  puneNE: { lat: 18.5629, lon: 73.912 },
  katraj: { lat: 18.4529, lon: 73.8567 },
  shivaji: { lat: 18.531, lon: 73.8446 },
  kothrud: { lat: 18.5074, lon: 73.8077 },
  aundh: { lat: 18.559, lon: 73.807 },
} as const;
export type ZoneCoordKey = keyof typeof PUNE_COORDS;

export function zoneBearing(a: ZoneCoordKey, b: ZoneCoordKey): number {
  const A = PUNE_COORDS[a];
  const B = PUNE_COORDS[b];
  return calculateBearing(A.lat, A.lon, B.lat, B.lon);
}
export function zoneDistance(a: ZoneCoordKey, b: ZoneCoordKey): number {
  const A = PUNE_COORDS[a];
  const B = PUNE_COORDS[b];
  return calculateDistance(A.lat, A.lon, B.lat, B.lon);
}
