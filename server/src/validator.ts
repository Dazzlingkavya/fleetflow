// Data validation. It reads ONLY the processed tables - never the ground truth.
import { ENUMS, FAILURE_REASONS, TRANSITIONS, UNSERVED_REASONS } from "./config.js";
import { inRegion } from "./geo.js";
import { TABLE_ORDER, TABLE_PK, type TableName, type Tables } from "./types.js";
import { groupBy } from "./util.js";

export interface Finding { code: string; severity: "ERROR" | "WARNING"; entity_type: string; entity_id: string; route_id: string | null; message: string; }
export interface CheckResult { code: string; severity: "ERROR" | "WARNING"; description: string; violations: number; status: "PASS" | "FAIL" | "WARN"; }

export const CHECK_CATALOGUE: { code: string; severity: "ERROR" | "WARNING"; description: string }[] = [
  { code: "PK_DUPLICATE", severity: "ERROR", description: "Primary keys are unique in every table" },
  { code: "ID_FORMAT_INVALID", severity: "ERROR", description: "IDs follow the required zero-padded formats" },
  { code: "FK_MISSING", severity: "ERROR", description: "Every foreign key points to an existing parent row (all joins valid)" },
  { code: "ENUM_INVALID", severity: "ERROR", description: "Status/type fields only use allowed values" },
  { code: "DATE_ORDER_INVALID", severity: "ERROR", description: "Dates and times are in a valid order (start before end)" },
  { code: "ARITH_ORDER_TOTAL", severity: "ERROR", description: "Order totals = items x unit values" },
  { code: "ARITH_DELIVERY_ORDER", severity: "ERROR", description: "Delivery weight/volume/site/date match the order" },
  { code: "ARITH_SERVICE_MINUTES", severity: "ERROR", description: "Service minutes follow the documented formula" },
  { code: "ARITH_SHIFT_MINUTES", severity: "ERROR", description: "Shift minutes = end - start" },
  { code: "ARITH_OUTCOME", severity: "ERROR", description: "Outcome delay/on-time values match arrival and window" },
  { code: "ROUTE_TOTAL_MISMATCH", severity: "ERROR", description: "Route stop count/weight/volume equal the sum of its stops" },
  { code: "STOP_TIME_ARITH_MISMATCH", severity: "ERROR", description: "Stop arrival = previous departure + travel; departure = start + service" },
  { code: "LIFECYCLE_INVALID_TRANSITION", severity: "ERROR", description: "Every state change is an allowed transition" },
  { code: "LIFECYCLE_FINAL_STATE_MISMATCH", severity: "ERROR", description: "Last event state equals the entity's current status" },
  { code: "EVENT_ORDER_INVALID", severity: "ERROR", description: "Events are append-only, numbered 1..n and not going back in time" },
  { code: "ROUTE_CAPACITY_EXCEEDED", severity: "ERROR", description: "Route weight, volume and stop count fit the vehicle capacity" },
  { code: "VEHICLE_NOT_AVAILABLE", severity: "ERROR", description: "Vehicle is active and has a capacity row on the route date" },
  { code: "VEHICLE_RESTRICTION_VIOLATED", severity: "ERROR", description: "Vehicle is not restricted from any stop's site" },
  { code: "LICENSE_MISMATCH", severity: "ERROR", description: "Driver licence allows the vehicle" },
  { code: "SHIFT_EXCEEDED", severity: "ERROR", description: "Route fits inside the driver's shift (including return to depot)" },
  { code: "SHIFT_DRIVER_MISMATCH", severity: "ERROR", description: "Route shift belongs to the route driver and date" },
  { code: "TIME_WINDOW_VIOLATED", severity: "ERROR", description: "Service starts inside the delivery time window" },
  { code: "ARRIVAL_BEFORE_PREV_DEPARTURE", severity: "ERROR", description: "A stop never arrives before the previous stop departs" },
  { code: "STOP_DUPLICATE_DELIVERY", severity: "ERROR", description: "A delivery appears at most once in a route" },
  { code: "STOP_MISSING", severity: "ERROR", description: "Every delivery assigned to a route has a stop in that route" },
  { code: "STOP_SEQUENCE_GAP", severity: "ERROR", description: "Stop sequence numbers are exactly 1..n" },
  { code: "STOP_ROUTE_MISMATCH", severity: "ERROR", description: "A stop's delivery is assigned to the stop's route" },
  { code: "VEHICLE_DOUBLE_BOOKED", severity: "ERROR", description: "A vehicle has at most one route per day" },
  { code: "DRIVER_DOUBLE_BOOKED", severity: "ERROR", description: "A driver has at most one route per day" },
  { code: "DELIVERY_COVERAGE_MISSING", severity: "ERROR", description: "Every delivery is assigned to a route OR explicitly unserved with a reason" },
  { code: "REASON_CODE_INVALID", severity: "ERROR", description: "Unserved/failure reason codes are in the allowed list" },
  { code: "FAILED_WITHOUT_REASON", severity: "ERROR", description: "Failed outcomes have a reason; delivered outcomes have none" },
  { code: "OUTCOME_MISSING", severity: "ERROR", description: "Delivered/failed deliveries have an outcome row" },
  { code: "OUTCOME_ORPHAN", severity: "ERROR", description: "Outcomes match their delivery and stop (none for unserved deliveries)" },
  { code: "COORD_OUT_OF_REGION", severity: "ERROR", description: "Customer site coordinates are inside the defined region" },
  { code: "UNSERVED_DELIVERY", severity: "WARNING", description: "Delivery was explicitly left unserved (reason code given)" },
  { code: "ACTUAL_SHIFT_OVERRUN", severity: "WARNING", description: "Simulated route returned to depot after the shift end" },
];
const SEV = new Map(CHECK_CATALOGUE.map((c) => [c.code, c.severity]));

const ID_RE: Partial<Record<TableName, RegExp>> = {
  customer_order: /^ORD-2026-\d{6}$/, delivery: /^DEL-2026-\d{6}$/, vehicle: /^VEH-\d{6}$/, driver: /^DRV-\d{6}$/,
  route: /^RTE-2026-\d{6}$/, route_stop: /^STOP-RTE-2026-\d{6}-\d{3}$/,
};

export function validate(t: Tables): Finding[] {
  const F: Finding[] = [];
  const add = (code: string, et: string, id: string, message: string, route: string | null = null) => F.push({ code, severity: SEV.get(code)!, entity_type: et, entity_id: id, route_id: route, message });

  // --- primary keys + id formats
  for (const name of TABLE_ORDER) {
    const pk = TABLE_PK[name]; const seen = new Set<string>();
    for (const r of t[name] as any[]) {
      const id = r[pk] as string;
      if (seen.has(id)) add("PK_DUPLICATE", name, id, `Duplicate primary key in ${name}`); seen.add(id);
      const re = ID_RE[name]; if (re && !re.test(id)) add("ID_FORMAT_INVALID", name, id, `ID does not match ${re}`);
    }
  }
  for (const s of t.route_stop) if (!s.route_stop_id.startsWith(`STOP-${s.route_id}-`)) add("ID_FORMAT_INVALID", "route_stop", s.route_stop_id, "Stop ID must be STOP-<route-id>-NNN", s.route_id);

  // --- lookups
  const site = new Map(t.customer_site.map((x) => [x.site_id, x])), order = new Map(t.customer_order.map((x) => [x.order_id, x]));
  const del = new Map(t.delivery.map((x) => [x.delivery_id, x])), veh = new Map(t.vehicle.map((x) => [x.vehicle_id, x]));
  const drv = new Map(t.driver.map((x) => [x.driver_id, x])), shift = new Map(t.shift.map((x) => [x.shift_id, x]));
  const route = new Map(t.route.map((x) => [x.route_id, x])), stop = new Map(t.route_stop.map((x) => [x.route_stop_id, x]));
  const win = new Map(t.time_window.map((x) => [x.delivery_id, x]));
  const stopsBy = groupBy(t.route_stop, (s) => s.route_id);
  const stopsOf = (rid: string) => (stopsBy.get(rid) ?? []).slice().sort((a, b) => a.sequence - b.sequence);
  const outByDel = groupBy(t.delivery_outcome, (o) => o.delivery_id);
  const capsBy = groupBy(t.vehicle_capacity, (c) => c.vehicle_id);
  const restr = new Map(t.vehicle_site_restriction.map((r) => [`${r.vehicle_id}|${r.site_id}`, r]));
  const fk = (ok: boolean, et: string, id: string, what: string, r: string | null = null) => { if (!ok) add("FK_MISSING", et, id, `Missing parent: ${what}`, r); };

  // --- foreign keys
  for (const o of t.customer_order) fk(site.has(o.site_id), "customer_order", o.order_id, `site ${o.site_id}`);
  for (const d of t.delivery) { fk(order.has(d.order_id), "delivery", d.delivery_id, `order ${d.order_id}`); fk(site.has(d.site_id), "delivery", d.delivery_id, `site ${d.site_id}`); if (d.assigned_route_id) fk(route.has(d.assigned_route_id), "delivery", d.delivery_id, `route ${d.assigned_route_id}`, d.assigned_route_id); }
  for (const w of t.time_window) fk(del.has(w.delivery_id), "time_window", w.window_id, `delivery ${w.delivery_id}`);
  for (const c of t.vehicle_capacity) fk(veh.has(c.vehicle_id), "vehicle_capacity", c.capacity_id, `vehicle ${c.vehicle_id}`);
  for (const r of t.vehicle_site_restriction) { fk(veh.has(r.vehicle_id), "vehicle_site_restriction", r.restriction_id, `vehicle ${r.vehicle_id}`); fk(site.has(r.site_id), "vehicle_site_restriction", r.restriction_id, `site ${r.site_id}`); }
  for (const s of t.shift) fk(drv.has(s.driver_id), "shift", s.shift_id, `driver ${s.driver_id}`);
  for (const r of t.route) { fk(veh.has(r.vehicle_id), "route", r.route_id, `vehicle ${r.vehicle_id}`, r.route_id); fk(drv.has(r.driver_id), "route", r.route_id, `driver ${r.driver_id}`, r.route_id); fk(shift.has(r.shift_id), "route", r.route_id, `shift ${r.shift_id}`, r.route_id); }
  for (const s of t.route_stop) { fk(route.has(s.route_id), "route_stop", s.route_stop_id, `route ${s.route_id}`, s.route_id); fk(del.has(s.delivery_id), "route_stop", s.route_stop_id, `delivery ${s.delivery_id}`, s.route_id); }
  for (const o of t.delivery_outcome) { fk(del.has(o.delivery_id), "delivery_outcome", o.outcome_id, `delivery ${o.delivery_id}`); fk(stop.has(o.route_stop_id), "delivery_outcome", o.outcome_id, `stop ${o.route_stop_id}`); }
  const evParents: Record<string, Map<string, unknown>> = { ORDER: order, DELIVERY: del, ROUTE: route };
  for (const e of t.state_event) fk(!!evParents[e.entity_type]?.has(e.entity_id), "state_event", e.event_id, `${e.entity_type} ${e.entity_id}`);

  // --- enums
  const en = (et: string, id: string, field: string, v: unknown, allowed: readonly unknown[], r: string | null = null) => { if (!allowed.includes(v)) add("ENUM_INVALID", et, id, `${field}=${String(v)} not allowed`, r); };
  for (const x of t.customer_site) { en("customer_site", x.site_id, "access_class", x.access_class, ENUMS.access_class); en("customer_site", x.site_id, "status", x.status, ENUMS.site_status); }
  for (const x of t.customer_order) { en("customer_order", x.order_id, "priority", x.priority, ENUMS.priority); en("customer_order", x.order_id, "status", x.status, ENUMS.order_status); }
  for (const x of t.delivery) en("delivery", x.delivery_id, "status", x.status, ENUMS.delivery_status);
  for (const x of t.vehicle) { en("vehicle", x.vehicle_id, "vehicle_type", x.vehicle_type, ENUMS.vehicle_type); en("vehicle", x.vehicle_id, "status", x.status, ENUMS.vehicle_status); en("vehicle", x.vehicle_id, "required_license", x.required_license, ENUMS.license); }
  for (const x of t.driver) { en("driver", x.driver_id, "license_class", x.license_class, ENUMS.license); en("driver", x.driver_id, "status", x.status, ENUMS.driver_status); }
  for (const x of t.shift) { en("shift", x.shift_id, "shift_type", x.shift_type, ENUMS.shift_type); en("shift", x.shift_id, "status", x.status, ENUMS.shift_status); }
  for (const x of t.time_window) en("time_window", x.window_id, "window_type", x.window_type, ENUMS.window_type);
  for (const x of t.travel_time_matrix) { en("travel_time_matrix", x.matrix_id, "scenario_type", x.scenario_type, ENUMS.scenario); en("travel_time_matrix", x.matrix_id, "time_band", x.time_band, ENUMS.time_band); }
  for (const x of t.route) en("route", x.route_id, "status", x.status, ENUMS.route_status, x.route_id);
  for (const x of t.delivery_outcome) en("delivery_outcome", x.outcome_id, "outcome_status", x.outcome_status, ENUMS.outcome_status);
  for (const x of t.state_event) en("state_event", x.event_id, "entity_type", x.entity_type, ENUMS.entity_type);

  // --- dates / ordering
  const dord = (bad: boolean, et: string, id: string, msg: string, r: string | null = null) => { if (bad) add("DATE_ORDER_INVALID", et, id, msg, r); };
  for (const o of t.customer_order) dord(o.order_date >= o.requested_date, "customer_order", o.order_id, "order_date must be before requested_date");
  for (const v of t.vehicle) dord(v.effective_to !== null && v.effective_to < v.effective_from, "vehicle", v.vehicle_id, "effective_to before effective_from");
  for (const c of t.vehicle_capacity) dord(c.effective_to !== null && c.effective_to < c.effective_from, "vehicle_capacity", c.capacity_id, "effective_to before effective_from");
  for (const s of t.shift) dord(s.end_min <= s.start_min, "shift", s.shift_id, "shift end must be after start");
  for (const w of t.time_window) dord(w.window_end_min <= w.window_start_min, "time_window", w.window_id, "window end must be after start");
  for (const s of t.route_stop) dord(!(s.planned_arrival_min <= s.planned_service_start_min && s.planned_service_start_min <= s.planned_departure_min), "route_stop", s.route_stop_id, "arrival <= service start <= departure must hold", s.route_id);
  for (const r of t.route) dord(r.actual_start_min !== null && r.actual_end_min !== null && r.actual_end_min < r.actual_start_min, "route", r.route_id, "actual_end before actual_start", r.route_id);

  // --- arithmetic reconciliation
  for (const o of t.customer_order) {
    if (Math.abs(o.item_count * o.unit_weight_kg - o.total_weight_kg) > 0.011 || Math.abs(o.item_count * o.unit_volume_m3 - o.total_volume_m3) > 0.0011) add("ARITH_ORDER_TOTAL", "customer_order", o.order_id, "total != items x unit value");
  }
  for (const d of t.delivery) {
    const o = order.get(d.order_id), s = site.get(d.site_id); if (!o) continue;
    if (d.weight_kg !== o.total_weight_kg || d.volume_m3 !== o.total_volume_m3 || d.site_id !== o.site_id || d.delivery_date !== o.requested_date) add("ARITH_DELIVERY_ORDER", "delivery", d.delivery_id, "delivery does not match its order");
    if (s && d.service_minutes !== 5 + Math.ceil(o.item_count * 0.6) + (s.access_class === "NARROW_STREET" ? 4 : 0)) add("ARITH_SERVICE_MINUTES", "delivery", d.delivery_id, "service_minutes does not follow 5 + ceil(items*0.6) + 4 if narrow street");
  }
  for (const s of t.shift) if (s.shift_minutes !== s.end_min - s.start_min) add("ARITH_SHIFT_MINUTES", "shift", s.shift_id, "shift_minutes != end - start");
  for (const o of t.delivery_outcome) {
    const w = win.get(o.delivery_id); if (!w || o.actual_arrival_min === null) continue;
    if (o.delay_minutes !== Math.max(0, o.actual_arrival_min - w.window_end_min) || o.on_time !== (o.actual_arrival_min <= w.window_end_min)) add("ARITH_OUTCOME", "delivery_outcome", o.outcome_id, "delay/on_time do not match arrival and window");
  }

  // --- route level checks
  const byDate = (key: "vehicle_id" | "driver_id", code: string) => {
    const seen = new Map<string, string>();
    for (const r of t.route) { const k = `${r.route_date}|${r[key]}`; if (seen.has(k)) add(code, "route", r.route_id, `${key} ${r[key]} already used by ${seen.get(k)} on ${r.route_date}`, r.route_id); else seen.set(k, r.route_id); }
  };
  byDate("vehicle_id", "VEHICLE_DOUBLE_BOOKED"); byDate("driver_id", "DRIVER_DOUBLE_BOOKED");
  for (const r of t.route) {
    const ss = stopsOf(r.route_id), rid = r.route_id;
    const v = veh.get(r.vehicle_id), d = drv.get(r.driver_id), sh = shift.get(r.shift_id);
    // totals
    const w = ss.reduce((a, x) => a + x.load_weight_kg, 0), vol = ss.reduce((a, x) => a + x.load_volume_m3, 0);
    if (ss.length !== r.planned_stop_count || Math.abs(w - r.planned_total_weight_kg) > 0.011 || Math.abs(vol - r.planned_total_volume_m3) > 0.0011) add("ROUTE_TOTAL_MISMATCH", "route", rid, `stored stops/weight/volume (${r.planned_stop_count}/${r.planned_total_weight_kg}/${r.planned_total_volume_m3}) != sum of stops (${ss.length}/${w.toFixed(2)}/${vol.toFixed(3)})`, rid);
    // sequence + duplicates
    if (ss.some((s, i) => s.sequence !== i + 1)) add("STOP_SEQUENCE_GAP", "route", rid, "stop sequence is not 1..n", rid);
    const cnt = new Map<string, number>(); for (const s of ss) cnt.set(s.delivery_id, (cnt.get(s.delivery_id) ?? 0) + 1);
    for (const s of ss) if ((cnt.get(s.delivery_id) ?? 0) > 1 && ss.find((x) => x.delivery_id === s.delivery_id) !== s) add("STOP_DUPLICATE_DELIVERY", "route_stop", s.route_stop_id, `delivery ${s.delivery_id} is already a stop in this route`, rid);
    // stop times
    let prevDep = r.planned_start_min;
    for (const s of ss) {
      if (s.planned_arrival_min < prevDep) add("ARRIVAL_BEFORE_PREV_DEPARTURE", "route_stop", s.route_stop_id, `arrival ${s.planned_arrival_min} < previous departure ${prevDep}`, rid);
      if (s.planned_arrival_min !== prevDep + s.travel_minutes_from_prev || s.wait_minutes !== s.planned_service_start_min - s.planned_arrival_min || s.planned_departure_min !== s.planned_service_start_min + s.service_minutes) add("STOP_TIME_ARITH_MISMATCH", "route_stop", s.route_stop_id, "arrival/wait/departure do not reconcile with travel and service minutes", rid);
      const tw = win.get(s.delivery_id);
      if (tw && (s.planned_service_start_min > tw.window_end_min || s.planned_service_start_min < tw.window_start_min)) add("TIME_WINDOW_VIOLATED", "route_stop", s.route_stop_id, `service start ${s.planned_service_start_min} outside window ${tw.window_start_min}-${tw.window_end_min}`, rid);
      const dl = del.get(s.delivery_id); if (dl && dl.assigned_route_id !== s.route_id) add("STOP_ROUTE_MISMATCH", "route_stop", s.route_stop_id, `delivery assigned to ${dl.assigned_route_id}`, rid);
      prevDep = s.planned_departure_min;
    }
    // vehicle, capacity, restrictions, license
    if (v && d) {
      const cap = (capsBy.get(v.vehicle_id) ?? []).find((c) => c.effective_from <= r.route_date && (c.effective_to === null || r.route_date <= c.effective_to));
      if (!(v.effective_from <= r.route_date && (v.effective_to === null || r.route_date <= v.effective_to)) || !cap) add("VEHICLE_NOT_AVAILABLE", "route", rid, `vehicle ${v.vehicle_id} not available on ${r.route_date}`, rid);
      if (cap && (w > cap.max_weight_kg + 1e-9 || vol > cap.max_volume_m3 + 1e-9 || ss.length > cap.max_stops)) add("ROUTE_CAPACITY_EXCEEDED", "route", rid, `load ${w.toFixed(2)} kg / ${vol.toFixed(3)} m3 / ${ss.length} stops vs capacity ${cap.max_weight_kg} kg / ${cap.max_volume_m3} m3 / ${cap.max_stops} stops`, rid);
      if (d.license_class === "B" && v.required_license === "C") add("LICENSE_MISMATCH", "route", rid, `driver ${d.driver_id} (B) cannot drive ${v.vehicle_id} (needs C)`, rid);
      for (const s of ss) { const dl = del.get(s.delivery_id); const rs = dl && restr.get(`${v.vehicle_id}|${dl.site_id}`); if (rs && rs.effective_from <= r.route_date) add("VEHICLE_RESTRICTION_VIOLATED", "route_stop", s.route_stop_id, `vehicle ${v.vehicle_id} is restricted from ${dl!.site_id}`, rid); }
    }
    // shift
    if (sh) {
      if (sh.driver_id !== r.driver_id || sh.shift_date !== r.route_date) add("SHIFT_DRIVER_MISMATCH", "route", rid, "shift driver/date differ from route", rid);
      const end = (ss.length ? ss[ss.length - 1].planned_departure_min : r.planned_start_min) + r.planned_return_minutes;
      if (r.planned_start_min < sh.start_min || end > sh.end_min) add("SHIFT_EXCEEDED", "route", rid, `route runs ${r.planned_start_min}-${end}, shift is ${sh.start_min}-${sh.end_min}`, rid);
      if (r.actual_end_min !== null && r.actual_end_min > sh.end_min) add("ACTUAL_SHIFT_OVERRUN", "route", rid, `simulated return at ${r.actual_end_min}, shift ends ${sh.end_min}`, rid);
    }
  }

  // --- delivery coverage, reason codes, outcomes
  for (const dl of t.delivery) {
    const outs = outByDel.get(dl.delivery_id) ?? [];
    if (dl.assigned_route_id) {
      if (dl.status === "UNSERVED" || dl.unserved_reason_code) add("DELIVERY_COVERAGE_MISSING", "delivery", dl.delivery_id, "assigned delivery is also marked unserved", dl.assigned_route_id);
      if (!(stopsBy.get(dl.assigned_route_id) ?? []).some((s) => s.delivery_id === dl.delivery_id)) add("STOP_MISSING", "delivery", dl.delivery_id, `no stop for this delivery in route ${dl.assigned_route_id}`, dl.assigned_route_id);
      if (!outs.length && (dl.status === "DELIVERED" || dl.status === "FAILED")) add("OUTCOME_MISSING", "delivery", dl.delivery_id, "no outcome row", dl.assigned_route_id);
    } else {
      if (dl.status !== "UNSERVED" || !dl.unserved_reason_code) add("DELIVERY_COVERAGE_MISSING", "delivery", dl.delivery_id, "not assigned and not explicitly unserved with a reason");
      else { add("UNSERVED_DELIVERY", "delivery", dl.delivery_id, `unserved: ${dl.unserved_reason_code}`); if (!UNSERVED_REASONS.includes(dl.unserved_reason_code as any)) add("REASON_CODE_INVALID", "delivery", dl.delivery_id, `unknown unserved reason ${dl.unserved_reason_code}`); }
      if (outs.length) add("OUTCOME_ORPHAN", "delivery", dl.delivery_id, "unserved delivery has an outcome");
    }
  }
  for (const o of t.delivery_outcome) {
    const dl = del.get(o.delivery_id), st = stop.get(o.route_stop_id);
    if (dl && st && st.delivery_id !== o.delivery_id) add("OUTCOME_ORPHAN", "delivery_outcome", o.outcome_id, "outcome stop belongs to another delivery", st.route_id);
    if (dl && dl.status !== o.outcome_status) add("OUTCOME_ORPHAN", "delivery_outcome", o.outcome_id, `outcome ${o.outcome_status} != delivery status ${dl.status}`);
    if (o.outcome_status === "FAILED" && !o.failure_reason_code) add("FAILED_WITHOUT_REASON", "delivery_outcome", o.outcome_id, "failed outcome has no reason code");
    if (o.outcome_status === "DELIVERED" && o.failure_reason_code) add("FAILED_WITHOUT_REASON", "delivery_outcome", o.outcome_id, "delivered outcome has a failure reason");
    if (o.failure_reason_code && !FAILURE_REASONS.includes(o.failure_reason_code as any)) add("REASON_CODE_INVALID", "delivery_outcome", o.outcome_id, `unknown failure reason ${o.failure_reason_code}`);
  }

  // --- lifecycle / event history
  const evBy = groupBy(t.state_event, (e) => `${e.entity_type}|${e.entity_id}`);
  const current: Record<string, Map<string, string>> = { ORDER: new Map(t.customer_order.map((x) => [x.order_id, x.status])), DELIVERY: new Map(t.delivery.map((x) => [x.delivery_id, x.status])), ROUTE: new Map(t.route.map((x) => [x.route_id, x.status])) };
  for (const [et, m] of Object.entries(current)) for (const [id, status] of m) {
    const evs = evBy.get(`${et}|${id}`);
    if (!evs) { add("LIFECYCLE_FINAL_STATE_MISMATCH", et, id, "entity has no state events", et === "ROUTE" ? id : null); continue; }
    evs.sort((a, b) => a.sequence_no - b.sequence_no);
    let prev: string | null = null, prevTime = "";
    evs.forEach((e, i) => {
      if (e.sequence_no !== i + 1 || e.event_time < prevTime || e.from_state !== prev) add("EVENT_ORDER_INVALID", et, e.event_id, "sequence/time/from_state chain is broken", et === "ROUTE" ? id : null);
      if (!(TRANSITIONS[et][prev ?? ""] ?? []).includes(e.to_state)) add("LIFECYCLE_INVALID_TRANSITION", et, e.event_id, `${prev ?? "(start)"} -> ${e.to_state} not allowed`, et === "ROUTE" ? id : null);
      prev = e.to_state; prevTime = e.event_time;
    });
    const finalOk = et === "ORDER" ? ["FULFILLED", "FAILED", "UNSERVED"].includes(String(prev)) : true;
    if (prev !== status || !finalOk) add("LIFECYCLE_FINAL_STATE_MISMATCH", et, id, `last event state ${prev} != status ${status}`, et === "ROUTE" ? id : null);
  }

  // --- coordinates
  for (const s of t.customer_site) if (!inRegion(s.latitude, s.longitude)) add("COORD_OUT_OF_REGION", "customer_site", s.site_id, `(${s.latitude}, ${s.longitude}) is outside the region`);
  return F;
}

export function buildReport(t: Tables, findings: Finding[]) {
  const checks: CheckResult[] = CHECK_CATALOGUE.map((c) => {
    const n = findings.filter((f) => f.code === c.code).length;
    return { ...c, violations: n, status: n === 0 ? "PASS" : c.severity === "ERROR" ? "FAIL" : "WARN" };
  });
  const counts = Object.fromEntries(TABLE_ORDER.map((n) => [n, t[n].length]));
  return {
    record_counts: counts,
    summary: { errors: findings.filter((f) => f.severity === "ERROR").length, warnings: findings.filter((f) => f.severity === "WARNING").length, checks_passed: checks.filter((c) => c.status === "PASS").length, checks_failed: checks.filter((c) => c.status === "FAIL").length, checks_warn: checks.filter((c) => c.status === "WARN").length, checks_total: checks.length },
    checks,
  };
}
