// Injects deliberate, LABELLED anomalies into PROCESSED data (routes/stops/shifts) after a clean baseline exists.
// Each anomaly touches only its own route (routes are never reused), so unrelated rows stay valid.
// (The coordinate anomaly is injected earlier, in generator.ts, because it is an INPUT anomaly.)
import type { RunConfig } from "./config.js";
import { Rng } from "./rng.js";
import type { GtDraft, PlannerInput, Route, RouteStop, Tables, Vehicle } from "./types.js";
import { groupBy, pad } from "./util.js";

export function injectOutputAnomalies(t: Tables, input: PlannerInput, cfg: RunConfig): GtDraft[] {
  const labels: GtDraft[] = [];
  const rng = new Rng(cfg.seed, "anomaly-out");
  const used = new Set<string>();
  const stopsBy = groupBy(t.route_stop, (s) => s.route_id);
  const stopsOf = (rid: string) => (stopsBy.get(rid) ?? []).slice().sort((a, b) => a.sequence - b.sequence);
  const shiftBy = new Map(t.shift.map((s) => [s.shift_id, s]));
  const pick = (pred: (r: Route) => boolean): Route | undefined => {
    const c = t.route.filter((r) => !used.has(r.route_id) && pred(r));
    return c.length ? c[rng.int(0, c.length - 1)] : undefined;
  };
  const add = (issue: string, entityType: string, entityId: string, r: Route, desc: string, primary: string, expected: string, affected: string) => {
    used.add(r.route_id);
    labels.push({ issue_type: issue, category: "INJECTED_ANOMALY", entity_type: entityType, entity_id: entityId, route_id: r.route_id, injection_stage: "OUTPUT", description: desc, primary_validation_code: primary, expected_validation_codes: expected, expected_decision: null, expected_reason_code: null, affected_entity_ids: affected });
  };

  // 1. Route exceeds vehicle capacity: give the route a smaller vehicle that is idle that day.
  const vehUsed = groupBy(t.route, (r) => r.route_date);
  const capOn = (v: string, d: string) => t.vehicle_capacity.find((c) => c.vehicle_id === v && c.effective_from <= d && (c.effective_to === null || d <= c.effective_to));
  const restricted = new Set(input.vehicle_site_restrictions.map((x) => `${x.vehicle_id}|${x.site_id}`));
  const driverBy = new Map(t.driver.map((d) => [d.driver_id, d]));
  const delSite = new Map(t.delivery.map((d) => [d.delivery_id, d.site_id]));
  const idleFor = (r: Route): Vehicle[] => {
    const busy = new Set((vehUsed.get(r.route_date) ?? []).map((x) => x.vehicle_id));
    const sites = stopsOf(r.route_id).map((s) => delSite.get(s.delivery_id)!);
    const drv = driverBy.get(r.driver_id)!;
    return t.vehicle.filter((v) => !busy.has(v.vehicle_id) && v.effective_from <= r.route_date && (v.effective_to === null || r.route_date <= v.effective_to)
      && (drv.license_class === "C" || v.required_license === "B") && !sites.some((s) => restricted.has(`${v.vehicle_id}|${s}`))
      && (capOn(v.vehicle_id, r.route_date)?.max_weight_kg ?? 1e9) < r.planned_total_weight_kg);
  };
  for (let i = 0; i < cfg.anomalyCounts.ROUTE_EXCEEDS_CAPACITY; i++) {
    const r = pick((x) => idleFor(x).length > 0);
    if (!r) break;
    const v = idleFor(r).sort((a, b) => capOn(b.vehicle_id, r.route_date)!.max_weight_kg - capOn(a.vehicle_id, r.route_date)!.max_weight_kg || a.vehicle_id.localeCompare(b.vehicle_id))[0];
    const old = r.vehicle_id;
    r.vehicle_id = v.vehicle_id;
    add("ROUTE_EXCEEDS_CAPACITY", "Route", r.route_id, r, `Route load ${r.planned_total_weight_kg} kg assigned to ${v.vehicle_id} (capacity ${capOn(v.vehicle_id, r.route_date)!.max_weight_kg} kg); was ${old}.`, "ROUTE_CAPACITY_EXCEEDED", "ROUTE_CAPACITY_EXCEEDED", r.route_id);
  }

  // 2. Driver shift exceeded: the driver's shift now ends 20 min before the route really ends.
  for (let i = 0; i < cfg.anomalyCounts.DRIVER_SHIFT_EXCEEDED; i++) {
    const r = pick((x) => x.planned_end_min - 20 - shiftBy.get(x.shift_id)!.start_min >= 240);
    if (!r) break;
    const sh = shiftBy.get(r.shift_id)!;
    sh.end_min = r.planned_end_min - 20; sh.shift_minutes = sh.end_min - sh.start_min;
    add("DRIVER_SHIFT_EXCEEDED", "Shift", sh.shift_id, r, `Route ends at minute ${r.planned_end_min}, but the shift now ends at ${sh.end_min}.`, "SHIFT_EXCEEDED", "SHIFT_EXCEEDED", r.route_id);
  }

  // 3. Arrival before previous stop's departure (2nd stop arrives 10 min too early).
  for (let i = 0; i < cfg.anomalyCounts.ARRIVAL_BEFORE_PREV_DEPARTURE; i++) {
    const r = pick((x) => x.planned_stop_count >= 2);
    if (!r) break;
    const [a, b] = stopsOf(r.route_id);
    b.planned_arrival_min = a.planned_departure_min - 10;
    add("ARRIVAL_BEFORE_PREV_DEPARTURE", "RouteStop", b.route_stop_id, r, `Stop 2 arrival (${b.planned_arrival_min}) is before stop 1 departure (${a.planned_departure_min}).`, "ARRIVAL_BEFORE_PREV_DEPARTURE", "ARRIVAL_BEFORE_PREV_DEPARTURE|STOP_TIME_ARITH_MISMATCH", b.delivery_id);
  }

  // 4. Stop omitted: the last stop and its outcome row are removed; the route still claims the original totals.
  for (let i = 0; i < cfg.anomalyCounts.STOP_OMITTED; i++) {
    const r = pick((x) => x.planned_stop_count >= 3);
    if (!r) break;
    const last = stopsOf(r.route_id).pop()!;
    t.route_stop = t.route_stop.filter((s) => s.route_stop_id !== last.route_stop_id);
    t.delivery_outcome = t.delivery_outcome.filter((o) => o.route_stop_id !== last.route_stop_id);
    add("STOP_OMITTED", "RouteStop", last.route_stop_id, r, `Last stop of the route was removed (delivery ${last.delivery_id} is still assigned to this route).`, "STOP_MISSING", "STOP_MISSING|OUTCOME_MISSING|ROUTE_TOTAL_MISMATCH", last.delivery_id);
  }

  // 5. Stop duplicated: the last stop appears twice (new stop id, same delivery).
  for (let i = 0; i < cfg.anomalyCounts.STOP_DUPLICATED; i++) {
    const r = pick((x) => x.planned_stop_count >= 2);
    if (!r) break;
    const ss = stopsOf(r.route_id), last = ss[ss.length - 1];
    const dup: RouteStop = { ...last, route_stop_id: `STOP-${r.route_id}-${pad(last.sequence + 1, 3)}`, sequence: last.sequence + 1, travel_minutes_from_prev: 0, distance_km_from_prev: 0, wait_minutes: 0, planned_arrival_min: last.planned_departure_min, planned_service_start_min: last.planned_departure_min, planned_departure_min: last.planned_departure_min + last.service_minutes };
    t.route_stop.push(dup);
    add("STOP_DUPLICATED", "RouteStop", dup.route_stop_id, r, `Delivery ${last.delivery_id} appears twice in the route.`, "STOP_DUPLICATE_DELIVERY", "STOP_DUPLICATE_DELIVERY|ROUTE_TOTAL_MISMATCH|ROUTE_CAPACITY_EXCEEDED|TIME_WINDOW_VIOLATED|SHIFT_EXCEEDED", last.delivery_id);
  }
  t.route_stop.sort((a, b) => a.route_stop_id.localeCompare(b.route_stop_id));
  return labels;
}
