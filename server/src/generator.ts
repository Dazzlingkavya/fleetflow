// Deterministic synthetic data generator. Same config (seed + scale) => identical data.
// Master data is created first (sites, vehicles, drivers...), then dependent data (orders, deliveries...).
import {
  BAND_BASE, ENUMS, REGION, SCENARIOS, SCENARIO_MULT, SHIFT_TYPES, START_DATE, TIME_BANDS, VEHICLE_CAP, type RunConfig,
} from "./config.js";
import { zoneOf, ZONES } from "./geo.js";
import { Rng } from "./rng.js";
import type {
  CustomerSite, Driver, DeliveryInput, GtDraft, OrderInput, PlannerInput, Shift, TimeWindow, TravelTimeMatrix,
  Vehicle, VehicleCapacity, VehicleSiteRestriction,
} from "./types.js";
import { addDays, pad, round } from "./util.js";

const NAME_A = ["Green", "Royal", "Metro", "Sunrise", "Blue", "Star", "Prime", "Coastal", "Urban", "Harvest", "Silver", "Lotus"];
const NAME_B = ["Mart", "Pharmacy", "Traders", "Cafe", "Stores", "Clinic", "Bakery", "Hardware", "Books", "Foods", "Textiles", "Supplies"];
const FIRST = ["Asha", "Karthik", "Meena", "Ravi", "Divya", "Arun", "Priya", "Suresh", "Lakshmi", "Vijay", "Anitha", "Manoj"];
const LAST = ["Raman", "Selvam", "Pillai", "Kumar", "Nair", "Iyer", "Das", "Murugan", "Rao", "Menon", "Pandian", "Joseph"];

export function generateInputs(cfg: RunConfig): { input: PlannerInput; labels: GtDraft[] } {
  const s = cfg.scale;
  const days = Array.from({ length: s.days }, (_, i) => addDays(START_DATE, i));
  const labels: GtDraft[] = [];

  // 1. Customer sites
  const rs = new Rng(cfg.seed, "sites");
  const sites: CustomerSite[] = [];
  for (let i = 1; i <= s.sites; i++) {
    const lat = round(REGION.latMin + rs.float() * (REGION.latMax - REGION.latMin), 6);
    const lon = round(REGION.lonMin + rs.float() * (REGION.lonMax - REGION.lonMin), 6);
    sites.push({
      site_id: `SITE-${pad(i, 6)}`, site_name: `${rs.pick(NAME_A)} ${rs.pick(NAME_B)} ${i}`, latitude: lat, longitude: lon,
      zone_id: zoneOf(lat, lon), access_class: rs.chance(0.08) ? "NARROW_STREET" : "STANDARD", accepts_late: rs.chance(0.5),
      status: "ACTIVE", effective_from: "2026-01-01", effective_to: null,
    });
  }

  // 2. Vehicles and capacities (capacity rows have effective dates; 1 vehicle : N capacity rows)
  const vehicles: Vehicle[] = [];
  const caps: VehicleCapacity[] = [];
  let capN = 0;
  for (let i = 1; i <= s.vehicles; i++) {
    const r = (i - 1) % 10;
    const type = r < 4 ? "VAN_SMALL" : r < 7 ? "VAN_LARGE" : "TRUCK";
    const maint = i % 20 === 0;
    vehicles.push({
      vehicle_id: `VEH-${pad(i, 6)}`, registration_no: `TN72AB${1000 + i}`, vehicle_type: type,
      required_license: type === "TRUCK" ? "C" : "B", status: maint ? "IN_MAINTENANCE" : "ACTIVE",
      effective_from: "2026-01-01", effective_to: maint ? addDays(START_DATE, 9 + (i % 7)) : null,
    });
    const c = VEHICLE_CAP[type as keyof typeof VEHICLE_CAP];
    const vid = `VEH-${pad(i, 6)}`;
    if (i % 10 === 3 && s.days > 15) {
      const cut = addDays(START_DATE, 14);
      caps.push({ capacity_id: `VCAP-${pad(++capN, 6)}`, vehicle_id: vid, max_weight_kg: c.w, max_volume_m3: c.v, max_stops: c.s, effective_from: "2026-01-01", effective_to: cut });
      caps.push({ capacity_id: `VCAP-${pad(++capN, 6)}`, vehicle_id: vid, max_weight_kg: Math.round(c.w * 0.9), max_volume_m3: round(c.v * 0.9, 1), max_stops: c.s, effective_from: addDays(cut, 1), effective_to: null });
    } else {
      caps.push({ capacity_id: `VCAP-${pad(++capN, 6)}`, vehicle_id: vid, max_weight_kg: c.w, max_volume_m3: c.v, max_stops: c.s, effective_from: "2026-01-01", effective_to: null });
    }
  }

  // 3. Drivers and shifts
  const rd = new Rng(cfg.seed, "drivers");
  const drivers: Driver[] = [];
  for (let i = 1; i <= s.drivers; i++) {
    drivers.push({ driver_id: `DRV-${pad(i, 6)}`, driver_name: `${rd.pick(FIRST)} ${rd.pick(LAST)}`, license_class: (i - 1) % 20 < 7 ? "C" : "B", status: "ACTIVE" });
  }
  const rsh = new Rng(cfg.seed, "shifts");
  const shifts: Shift[] = [];
  for (const date of days) {
    for (const d of drivers) {
      if (!rsh.chance(0.78)) continue;
      const type = rsh.weighted(ENUMS.shift_type, [30, 50, 20]);
      const [a, b] = SHIFT_TYPES[type as keyof typeof SHIFT_TYPES];
      shifts.push({ shift_id: `SHF-${pad(shifts.length + 1, 6)}`, driver_id: d.driver_id, shift_date: date, shift_type: type, start_min: a, end_min: b, shift_minutes: b - a, status: "COMPLETED" });
    }
  }

  // 4. Travel-time matrices: one traffic scenario per day, per time band, per zone pair
  const rm = new Rng(cfg.seed, "matrix");
  const matrix: TravelTimeMatrix[] = [];
  for (const date of days) {
    const scenario = rm.weighted(SCENARIOS, [70, 15, 10, 5]);
    for (const band of TIME_BANDS) {
      for (const fz of ZONES) {
        for (const tz of ZONES) {
          const mult = round(BAND_BASE[band] * SCENARIO_MULT[scenario] * (0.92 + 0.16 * rm.float()), 3);
          matrix.push({ matrix_id: `TTM-${pad(matrix.length + 1, 6)}`, scenario_date: date, scenario_type: scenario, time_band: band, from_zone: fz, to_zone: tz, traffic_multiplier: mult });
        }
      }
    }
  }

  // 5. Restrictions (many-to-many bridge): trucks may not enter narrow-street sites
  const restrictions: VehicleSiteRestriction[] = [];
  for (const site of sites.filter((x) => x.access_class === "NARROW_STREET")) {
    for (const v of vehicles.filter((x) => x.vehicle_type === "TRUCK")) {
      restrictions.push({ restriction_id: `RSTR-${pad(restrictions.length + 1, 6)}`, vehicle_id: v.vehicle_id, site_id: site.site_id, reason: "NARROW_STREET", effective_from: "2026-01-01" });
    }
  }

  // 6. Orders, deliveries (1 order : 1 delivery here) and time windows
  const ro = new Rng(cfg.seed, "orders");
  const ri = new Rng(cfg.seed, "infeasible");
  const oversizeIdx = new Set(ri.distinct(s.deliveries, cfg.infeasible.oversize));
  const earlyIdx = new Set(ri.distinct(s.deliveries, cfg.infeasible.earlyWindow, oversizeIdx));
  const orders: OrderInput[] = [];
  const deliveries: DeliveryInput[] = [];
  const windows: TimeWindow[] = [];
  const siteById = new Map(sites.map((x) => [x.site_id, x]));
  for (let i = 0; i < s.deliveries; i++) {
    const site = sites[ro.int(0, s.sites - 1)];
    const date = days[ro.int(0, s.days - 1)];
    const priority = ro.weighted(ENUMS.priority, [5, 15, 60, 20]);
    let items = 1 + Math.floor(Math.pow(ro.float(), 1.6) * 40);
    let unitW = round(1.5 + ro.float() * 18.5, 2);
    let unitV = round(0.005 + ro.float() * 0.075, 3);
    const wStart = 420 + 30 * ro.int(0, 16);
    const wWidth = 120 + 30 * ro.int(0, 4);
    let ws = wStart, we = wStart + wWidth;
    const orderOffset = ro.int(1, 4);
    const n = pad(i + 1, 6);
    if (oversizeIdx.has(i)) { items = 180; unitW = round(20 + ri.float() * 5, 2); unitV = 0.04; }
    if (earlyIdx.has(i)) { ws = 240; we = 300; }
    const orderId = `ORD-2026-${n}`, delId = `DEL-2026-${n}`;
    orders.push({
      order_id: orderId, site_id: site.site_id, order_date: addDays(date, -orderOffset), requested_date: date, priority,
      item_count: items, unit_weight_kg: unitW, unit_volume_m3: unitV, total_weight_kg: round(items * unitW, 2), total_volume_m3: round(items * unitV, 3),
    });
    const o = orders[orders.length - 1];
    deliveries.push({
      delivery_id: delId, order_id: orderId, site_id: site.site_id, delivery_date: date, weight_kg: o.total_weight_kg, volume_m3: o.total_volume_m3,
      service_minutes: 5 + Math.ceil(items * 0.6) + (site.access_class === "NARROW_STREET" ? 4 : 0),
    });
    windows.push({ window_id: `TW-${n}`, delivery_id: delId, window_start_min: ws, window_end_min: we, window_type: "HARD" });
    if (oversizeIdx.has(i)) labels.push({ issue_type: "INFEASIBLE_BY_DESIGN", category: "EXPECTED_DECISION", entity_type: "Delivery", entity_id: delId, route_id: null, injection_stage: "GENERATION", description: "Delivery weight is larger than every vehicle capacity.", primary_validation_code: null, expected_validation_codes: "", expected_decision: "UNSERVED", expected_reason_code: "EXCEEDS_MAX_VEHICLE_CAPACITY", affected_entity_ids: delId });
    if (earlyIdx.has(i)) labels.push({ issue_type: "INFEASIBLE_BY_DESIGN", category: "EXPECTED_DECISION", entity_type: "Delivery", entity_id: delId, route_id: null, injection_stage: "GENERATION", description: "Time window (04:00-05:00) ends before any driver shift can reach the site.", primary_validation_code: null, expected_validation_codes: "", expected_decision: "UNSERVED", expected_reason_code: "NO_FEASIBLE_TIME_WINDOW", affected_entity_ids: delId });
  }

  // 7. INPUT anomaly: customer site coordinates outside the region (labelled, only when requested)
  if (cfg.includeAnomalies && cfg.anomalyCounts.COORDINATE_OUT_OF_REGION > 0) {
    const used = new Set<number>();
    for (const d of deliveries.filter((x) => oversizeIdx.has(+x.delivery_id.slice(-6) - 1) || earlyIdx.has(+x.delivery_id.slice(-6) - 1))) used.add(sites.findIndex((x) => x.site_id === d.site_id));
    const rc = new Rng(cfg.seed, "anomaly-coord");
    const pick = rc.distinct(s.sites, cfg.anomalyCounts.COORDINATE_OUT_OF_REGION, used);
    pick.forEach((idx, k) => {
      const site = sites[idx];
      const off = 0.05 + rc.float() * 0.3;
      if (k % 4 === 0) site.latitude = round(REGION.latMax + off, 6);
      else if (k % 4 === 1) site.latitude = round(REGION.latMin - off, 6);
      else if (k % 4 === 2) site.longitude = round(REGION.lonMax + off, 6);
      else site.longitude = round(REGION.lonMin - off, 6);
      site.zone_id = zoneOf(site.latitude, site.longitude);
      const affected = deliveries.filter((d) => d.site_id === site.site_id).map((d) => d.delivery_id);
      labels.push({ issue_type: "COORDINATE_OUT_OF_REGION", category: "INJECTED_ANOMALY", entity_type: "CustomerSite", entity_id: site.site_id, route_id: null, injection_stage: "INPUT", description: `Site coordinate moved outside the allowed region (${site.latitude}, ${site.longitude}).`, primary_validation_code: "COORD_OUT_OF_REGION", expected_validation_codes: "COORD_OUT_OF_REGION", expected_decision: "UNSERVED", expected_reason_code: "INVALID_SITE_COORDINATE", affected_entity_ids: affected.join("|") });
    });
  }
  void siteById;
  return { input: { sites, orders, deliveries, time_windows: windows, vehicles, vehicle_capacities: caps, vehicle_site_restrictions: restrictions, drivers, shifts, travel_matrix: matrix }, labels };
}
