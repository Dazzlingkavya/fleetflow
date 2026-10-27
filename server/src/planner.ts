// Delivery planner (greedy insertion heuristic). It only receives PlannerInput - never ground truth.
// Rules: see docs/PLANNING_RULES section in README/DATA_DICTIONARY.
import { DEPOT, timeBand } from "./config.js";
import { DEPOT_ZONE, inRegion, roadKm, travelMinutes } from "./geo.js";
import type {
  CustomerSite, DeliveryInput, Driver, PlannerInput, Route, RouteStop, Shift, TimeWindow, Vehicle, VehicleCapacity,
} from "./types.js";
import { groupBy, pad, round } from "./util.js";

export interface PlanResult { routes: Route[]; stops: RouteStop[]; unserved: { delivery_id: string; reason_code: string }[]; }

interface Item { d: DeliveryInput; site: CustomerSite; win: TimeWindow; priority: number; }
interface Row { arrival: number; ss: number; dep: number; travel: number; km: number; wait: number; }
interface Sched { rows: Row[]; backMin: number; backKm: number; end: number; }
interface Draft { date: string; vehicle: Vehicle; cap: VehicleCapacity; shift: Shift; driver: Driver; items: Item[]; sched: Sched; weight: number; volume: number; }

export function plan(input: PlannerInput): PlanResult {
  const siteBy = new Map(input.sites.map((x) => [x.site_id, x]));
  const orderBy = new Map(input.orders.map((x) => [x.order_id, x]));
  const winBy = new Map(input.time_windows.map((x) => [x.delivery_id, x]));
  const driverBy = new Map(input.drivers.map((x) => [x.driver_id, x]));
  const capsBy = groupBy(input.vehicle_capacities, (x) => x.vehicle_id);
  const restricted = new Set(input.vehicle_site_restrictions.map((x) => `${x.vehicle_id}|${x.site_id}`));
  const mult = new Map(input.travel_matrix.map((x) => [`${x.scenario_date}|${x.time_band}|${x.from_zone}|${x.to_zone}`, x.traffic_multiplier]));
  const shiftsByDate = groupBy(input.shifts.filter((x) => x.status !== "CANCELLED"), (x) => x.shift_date);
  const delsByDate = groupBy(input.deliveries, (x) => x.delivery_date);
  const dates = [...delsByDate.keys()].sort();

  const capOn = (vid: string, date: string) => (capsBy.get(vid) ?? []).find((c) => c.effective_from <= date && (c.effective_to === null || date <= c.effective_to));
  const activeOn = (v: Vehicle, date: string) => v.effective_from <= date && (v.effective_to === null || date <= v.effective_to);
  const licenseOk = (driver: Driver, v: Vehicle) => driver.license_class === "C" || v.required_license === "B";
  const leg = (aLat: number, aLon: number, aZone: string, b: CustomerSite | "DEPOT", date: string, departMin: number) => {
    const bLat = b === "DEPOT" ? DEPOT.lat : b.latitude, bLon = b === "DEPOT" ? DEPOT.lon : b.longitude, bZone = b === "DEPOT" ? DEPOT_ZONE : b.zone_id;
    const km = roadKm(aLat, aLon, bLat, bLon);
    const m = mult.get(`${date}|${timeBand(departMin)}|${aZone}|${bZone}`) ?? 1;
    return { km, minutes: travelMinutes(km, m) };
  };

  // Try to build a schedule for an ordered list of stops. Returns null if any rule is broken.
  function evaluate(shift: Shift, date: string, items: Item[]): Sched | null {
    let t = shift.start_min, lat = DEPOT.lat, lon = DEPOT.lon, zone = DEPOT_ZONE;
    const rows: Row[] = [];
    for (const it of items) {
      const l = leg(lat, lon, zone, it.site, date, t);
      const arrival = t + l.minutes;
      const ss = Math.max(arrival, it.win.window_start_min);
      if (ss > it.win.window_end_min) return null; // hard time window
      const dep = ss + it.d.service_minutes;
      rows.push({ arrival, ss, dep, travel: l.minutes, km: l.km, wait: ss - arrival });
      t = dep; lat = it.site.latitude; lon = it.site.longitude; zone = it.site.zone_id;
    }
    const back = leg(lat, lon, zone, "DEPOT", date, t);
    const end = t + back.minutes;
    if (end > shift.end_min) return null; // driver shift
    return { rows, backMin: back.minutes, backKm: back.km, end };
  }

  const drafts: Draft[] = [];
  const unserved: PlanResult["unserved"] = [];

  for (const date of dates) {
    const dayShifts = (shiftsByDate.get(date) ?? []).slice().sort((a, b) => a.start_min - b.start_min || a.shift_id.localeCompare(b.shift_id));
    const dayVehicles = input.vehicles.filter((v) => activeOn(v, date) && capOn(v.vehicle_id, date));
    const usedShift = new Set<string>(), usedVeh = new Set<string>();
    const dayDrafts: Draft[] = [];
    const todo: Item[] = (delsByDate.get(date) ?? []).map((d) => ({ d, site: siteBy.get(d.site_id)!, win: winBy.get(d.delivery_id)!, priority: orderBy.get(d.order_id)!.priority }));
    // Priority 1 (urgent) first, then earliest window end, then id => fully deterministic.
    todo.sort((a, b) => a.priority - b.priority || a.win.window_end_min - b.win.window_end_min || a.d.delivery_id.localeCompare(b.d.delivery_id));

    for (const it of todo) {
      if (!inRegion(it.site.latitude, it.site.longitude)) { unserved.push({ delivery_id: it.d.delivery_id, reason_code: "INVALID_SITE_COORDINATE" }); continue; }
      // (a) insert into an existing route where the route gets finished earliest
      let best: { r: Draft; pos: number; s: Sched; delta: number } | null = null;
      for (const r of dayDrafts) {
        if (r.items.length + 1 > r.cap.max_stops || r.weight + it.d.weight_kg > r.cap.max_weight_kg || r.volume + it.d.volume_m3 > r.cap.max_volume_m3) continue;
        if (restricted.has(`${r.vehicle.vehicle_id}|${it.site.site_id}`)) continue;
        for (let pos = 0; pos <= r.items.length; pos++) {
          const s = evaluate(r.shift, date, [...r.items.slice(0, pos), it, ...r.items.slice(pos)]);
          if (!s) continue;
          const delta = s.end - r.sched.end;
          if (!best || delta < best.delta) best = { r, pos, s, delta };
        }
      }
      if (best) { best.r.items.splice(best.pos, 0, it); best.r.sched = best.s; best.r.weight += it.d.weight_kg; best.r.volume += it.d.volume_m3; continue; }

      // (b) open a new route: smallest vehicle that fits (prefer one with 2x headroom), earliest feasible driver shift
      const fits = dayVehicles.filter((v) => { const c = capOn(v.vehicle_id, date)!; return !usedVeh.has(v.vehicle_id) && c.max_weight_kg >= it.d.weight_kg && c.max_volume_m3 >= it.d.volume_m3 && !restricted.has(`${v.vehicle_id}|${it.site.site_id}`); });
      const byCap = (a: Vehicle, b: Vehicle) => capOn(a.vehicle_id, date)!.max_weight_kg - capOn(b.vehicle_id, date)!.max_weight_kg || a.vehicle_id.localeCompare(b.vehicle_id);
      const roomy = fits.filter((v) => capOn(v.vehicle_id, date)!.max_weight_kg >= Math.max(2 * it.d.weight_kg, 300)).sort(byCap);
      const ordered = [...roomy, ...fits.filter((v) => !roomy.includes(v)).sort(byCap)];
      let made = false;
      for (const v of ordered) {
        for (const sh of dayShifts) {
          if (usedShift.has(sh.shift_id)) continue;
          const driver = driverBy.get(sh.driver_id)!;
          if (driver.status !== "ACTIVE" || !licenseOk(driver, v)) continue;
          const s = evaluate(sh, date, [it]);
          if (!s) continue;
          const draft: Draft = { date, vehicle: v, cap: capOn(v.vehicle_id, date)!, shift: sh, driver, items: [it], sched: s, weight: it.d.weight_kg, volume: it.d.volume_m3 };
          dayDrafts.push(draft); usedShift.add(sh.shift_id); usedVeh.add(v.vehicle_id); made = true; break;
        }
        if (made) break;
      }
      if (made) continue;

      // (c) cannot be served: find the first rule that explains why
      let reason = "NO_CAPACITY_AVAILABLE";
      if (!dayShifts.length) reason = "NO_DRIVER_AVAILABLE";
      else if (!dayVehicles.length) reason = "NO_VEHICLE_AVAILABLE";
      else if (!dayVehicles.some((v) => { const c = capOn(v.vehicle_id, date)!; return c.max_weight_kg >= it.d.weight_kg && c.max_volume_m3 >= it.d.volume_m3; })) reason = "EXCEEDS_MAX_VEHICLE_CAPACITY";
      else {
        const compat = dayVehicles.filter((v) => { const c = capOn(v.vehicle_id, date)!; return c.max_weight_kg >= it.d.weight_kg && c.max_volume_m3 >= it.d.volume_m3 && !restricted.has(`${v.vehicle_id}|${it.site.site_id}`); });
        if (!compat.length) reason = "NO_COMPATIBLE_VEHICLE";
        else if (!dayShifts.some((sh) => compat.some((v) => licenseOk(driverBy.get(sh.driver_id)!, v)) && evaluate(sh, date, [it]))) reason = "NO_FEASIBLE_TIME_WINDOW";
      }
      unserved.push({ delivery_id: it.d.delivery_id, reason_code: reason });
    }
    drafts.push(...dayDrafts);
  }

  // Convert drafts to Route / RouteStop rows with deterministic IDs.
  const routes: Route[] = [], stops: RouteStop[] = [];
  drafts.forEach((r, i) => {
    const route_id = `RTE-2026-${pad(i + 1, 6)}`;
    const kmSum = r.sched.rows.reduce((a, x) => a + x.km, 0) + r.sched.backKm;
    routes.push({
      route_id, route_date: r.date, vehicle_id: r.vehicle.vehicle_id, driver_id: r.driver.driver_id, shift_id: r.shift.shift_id, status: "PLANNED",
      planned_start_min: r.shift.start_min, planned_return_minutes: r.sched.backMin, planned_end_min: r.sched.end, planned_stop_count: r.items.length,
      planned_total_weight_kg: round(r.items.reduce((a, x) => a + x.d.weight_kg, 0), 2), planned_total_volume_m3: round(r.items.reduce((a, x) => a + x.d.volume_m3, 0), 3),
      planned_distance_km: round(kmSum, 2), planned_travel_minutes: r.sched.rows.reduce((a, x) => a + x.travel, 0) + r.sched.backMin,
      planned_service_minutes: r.items.reduce((a, x) => a + x.d.service_minutes, 0), actual_start_min: null, actual_end_min: null,
    });
    r.items.forEach((it, k) => {
      const row = r.sched.rows[k];
      stops.push({
        route_stop_id: `STOP-${route_id}-${pad(k + 1, 3)}`, route_id, delivery_id: it.d.delivery_id, sequence: k + 1, planned_arrival_min: row.arrival,
        planned_service_start_min: row.ss, planned_departure_min: row.dep, travel_minutes_from_prev: row.travel, distance_km_from_prev: row.km, wait_minutes: row.wait,
        service_minutes: it.d.service_minutes, load_weight_kg: it.d.weight_kg, load_volume_m3: it.d.volume_m3,
      });
    });
  });
  unserved.sort((a, b) => a.delivery_id.localeCompare(b.delivery_id));
  return { routes, stops, unserved };
}
