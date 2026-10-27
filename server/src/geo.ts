import { BASE_SPEED_KMH, DEPOT, REGION, ROAD_FACTOR } from "./config.js";
import { round } from "./util.js";

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Road distance = straight line x 1.3, rounded to 2 decimals (keeps results identical on every computer).
export const roadKm = (aLat: number, aLon: number, bLat: number, bLon: number) => round(haversineKm(aLat, aLon, bLat, bLon) * ROAD_FACTOR, 2);
export const travelMinutes = (km: number, multiplier: number) => Math.max(1, Math.ceil((km / BASE_SPEED_KMH) * 60 * multiplier - 1e-9));
export const inRegion = (lat: number, lon: number) => lat >= REGION.latMin && lat <= REGION.latMax && lon >= REGION.lonMin && lon <= REGION.lonMax;
export function zoneOf(lat: number, lon: number): string {
  if (!inRegion(lat, lon)) return "OUT";
  const col = Math.min(2, Math.floor(((lon - REGION.lonMin) / (REGION.lonMax - REGION.lonMin)) * 3));
  const row = Math.min(2, Math.floor(((lat - REGION.latMin) / (REGION.latMax - REGION.latMin)) * 3));
  return `Z${row * 3 + col + 1}`;
}
export const DEPOT_ZONE = zoneOf(DEPOT.lat, DEPOT.lon);
export const ZONES = Array.from({ length: 9 }, (_, i) => `Z${i + 1}`);
