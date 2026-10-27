// All business constants live here. See docs/DATA_DICTIONARY.md for the explanation.
export const SEED = 20261022;

export interface Scale { sites: number; deliveries: number; vehicles: number; drivers: number; days: number; }
export const FULL_SCALE: Scale = { sites: 500, deliveries: 2000, vehicles: 100, drivers: 100, days: 30 };
export const SMALL_SCALE: Scale = { sites: 30, deliveries: 80, vehicles: 8, drivers: 8, days: 3 };

export type AnomalyType =
  | "ROUTE_EXCEEDS_CAPACITY" | "STOP_OMITTED" | "STOP_DUPLICATED"
  | "ARRIVAL_BEFORE_PREV_DEPARTURE" | "DRIVER_SHIFT_EXCEEDED" | "COORDINATE_OUT_OF_REGION";
export type AnomalyCounts = Record<AnomalyType, number>;

export interface RunConfig {
  seed: number;
  scale: Scale;
  includeAnomalies: boolean;       // false = clean baseline, true = baseline + labelled anomalies
  anomalyCounts: AnomalyCounts;
  infeasible: { oversize: number; earlyWindow: number }; // hard-but-valid deliveries that MUST end up unserved
}
const FULL_ANOMALIES: AnomalyCounts = {
  ROUTE_EXCEEDS_CAPACITY: 3, STOP_OMITTED: 3, STOP_DUPLICATED: 3,
  ARRIVAL_BEFORE_PREV_DEPARTURE: 3, DRIVER_SHIFT_EXCEEDED: 3, COORDINATE_OUT_OF_REGION: 5,
};
const SMALL_ANOMALIES: AnomalyCounts = {
  ROUTE_EXCEEDS_CAPACITY: 1, STOP_OMITTED: 1, STOP_DUPLICATED: 1,
  ARRIVAL_BEFORE_PREV_DEPARTURE: 1, DRIVER_SHIFT_EXCEEDED: 1, COORDINATE_OUT_OF_REGION: 2,
};
export const fullConfig = (includeAnomalies: boolean, seed = SEED): RunConfig => ({
  seed, scale: FULL_SCALE, includeAnomalies, anomalyCounts: FULL_ANOMALIES, infeasible: { oversize: 10, earlyWindow: 10 },
});
export const smallConfig = (includeAnomalies: boolean, seed = SEED): RunConfig => ({
  seed, scale: SMALL_SCALE, includeAnomalies, anomalyCounts: SMALL_ANOMALIES, infeasible: { oversize: 2, earlyWindow: 2 },
});

export const START_DATE = "2026-09-21"; // 30 days: 2026-09-21 .. 2026-10-20
export const REGION = { latMin: 8.6, latMax: 8.9, lonMin: 77.55, lonMax: 77.85 }; // synthetic region
export const DEPOT = { lat: 8.75, lon: 77.7 };
export const ROAD_FACTOR = 1.3;
export const BASE_SPEED_KMH = 40;
export const TIME_BANDS = ["EARLY", "AM_PEAK", "MIDDAY", "PM_PEAK", "EVENING"] as const;
export type TimeBand = (typeof TIME_BANDS)[number];
export const BAND_BASE: Record<TimeBand, number> = { EARLY: 1.0, AM_PEAK: 1.5, MIDDAY: 1.1, PM_PEAK: 1.6, EVENING: 1.0 };
export function timeBand(min: number): TimeBand {
  if (min < 420) return "EARLY";
  if (min < 600) return "AM_PEAK";
  if (min < 960) return "MIDDAY";
  if (min < 1140) return "PM_PEAK";
  return "EVENING";
}
export const SCENARIOS = ["NORMAL", "RAIN", "FESTIVAL", "ROADWORK"] as const;
export const SCENARIO_MULT: Record<(typeof SCENARIOS)[number], number> = { NORMAL: 1.0, RAIN: 1.25, FESTIVAL: 1.4, ROADWORK: 1.3 };

export const VEHICLE_TYPES = ["VAN_SMALL", "VAN_LARGE", "TRUCK"] as const;
export const VEHICLE_CAP = {
  VAN_SMALL: { w: 600, v: 4, s: 12 },
  VAN_LARGE: { w: 1200, v: 8, s: 15 },
  TRUCK: { w: 3000, v: 18, s: 20 },
} as const;
export const SHIFT_TYPES = { EARLY: [360, 840], DAY: [540, 1020], LATE: [720, 1200] } as const;
export const LATE_TOLERANCE_MIN = 15;

export const ENUMS = {
  priority: [1, 2, 3, 4],
  access_class: ["STANDARD", "NARROW_STREET"],
  site_status: ["ACTIVE", "INACTIVE"],
  vehicle_type: [...VEHICLE_TYPES],
  vehicle_status: ["ACTIVE", "IN_MAINTENANCE"],
  license: ["B", "C"],
  driver_status: ["ACTIVE", "INACTIVE"],
  shift_type: ["EARLY", "DAY", "LATE"],
  shift_status: ["SCHEDULED", "COMPLETED", "CANCELLED"],
  window_type: ["HARD"],
  scenario: [...SCENARIOS],
  time_band: [...TIME_BANDS],
  order_status: ["NEW", "SCHEDULED", "FULFILLED", "FAILED", "UNSERVED"],
  delivery_status: ["CREATED", "PLANNED", "DISPATCHED", "ARRIVED", "DELIVERED", "FAILED", "UNSERVED"],
  route_status: ["PLANNED", "IN_PROGRESS", "COMPLETED"],
  outcome_status: ["DELIVERED", "FAILED"],
  entity_type: ["ORDER", "DELIVERY", "ROUTE"],
} as const;

export const UNSERVED_REASONS = [
  "INVALID_SITE_COORDINATE", "EXCEEDS_MAX_VEHICLE_CAPACITY", "NO_DRIVER_AVAILABLE", "NO_VEHICLE_AVAILABLE",
  "NO_COMPATIBLE_VEHICLE", "NO_FEASIBLE_TIME_WINDOW", "NO_CAPACITY_AVAILABLE",
] as const;
export const FAILURE_REASONS = [
  "CUSTOMER_ABSENT", "SITE_CLOSED", "ACCESS_RESTRICTED", "ADDRESS_NOT_FOUND",
  "DAMAGED_GOODS", "CUSTOMER_REFUSED_LATE", "DRIVER_SHIFT_ENDED",
] as const;

// Allowed state changes (lifecycle rules). "null" = first event.
export const TRANSITIONS: Record<string, Record<string, string[]>> = {
  ORDER: { "": ["NEW"], NEW: ["SCHEDULED", "UNSERVED"], SCHEDULED: ["FULFILLED", "FAILED"] },
  DELIVERY: {
    "": ["CREATED"], CREATED: ["PLANNED", "UNSERVED"], PLANNED: ["DISPATCHED"],
    DISPATCHED: ["ARRIVED", "FAILED"], ARRIVED: ["DELIVERED", "FAILED"],
  },
  ROUTE: { "": ["PLANNED"], PLANNED: ["IN_PROGRESS"], IN_PROGRESS: ["COMPLETED"] },
};
