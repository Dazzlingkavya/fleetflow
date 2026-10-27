// Deterministic delivery simulation. Every random number comes from a seeded stream keyed by an ID,
// so results never change between runs. Outcomes follow the written rules below.
//
// RULES (per stop, in route order):
//  1. Driver leaves the depot 0-10 min after shift start.
//  2. Actual travel = planned travel x (0.85 .. 1.35).
//  3. If actual arrival is after the shift end -> FAILED / DRIVER_SHIFT_ENDED (this and all later stops are not attempted).
//  4. If arrival is more than 15 min after the window end and the site does not accept late deliveries -> FAILED / CUSTOMER_REFUSED_LATE.
//  5. Otherwise a seeded roll decides: 2.5% CUSTOMER_ABSENT, 1.5% SITE_CLOSED, 1% ACCESS_RESTRICTED, 0.7% ADDRESS_NOT_FOUND, 0.8% DAMAGED_GOODS, else DELIVERED.
//  6. Delivered service time = planned x (0.8 .. 1.4); a failed attempt takes at most 4 min.
//  7. on_time = actual arrival <= window end.
import { Rng } from "./rng.js";
import { LATE_TOLERANCE_MIN } from "./config.js";
import type { CustomerSite, DeliveryInput, DeliveryOutcome, PlannerInput, Route, Shift, StateEvent, TimeWindow } from "./types.js";
import type { PlanResult } from "./planner.js";
import { addDays, groupBy, isoAt, pad } from "./util.js";

export interface SimResult {
  routes: Route[]; outcomes: DeliveryOutcome[]; events: StateEvent[];
  deliveryStatus: Map<string, string>; orderStatus: Map<string, string>;
}
interface Raw { entity_type: string; entity_id: string; to_state: string; time: string; reason: string | null; actor: string; }

export function simulate(input: PlannerInput, plan: PlanResult, seed: number): SimResult {
  const siteBy = new Map(input.sites.map((x) => [x.site_id, x]));
  const delBy = new Map<string, DeliveryInput>(input.deliveries.map((x) => [x.delivery_id, x]));
  const winBy = new Map<string, TimeWindow>(input.time_windows.map((x) => [x.delivery_id, x]));
  const shiftBy = new Map<string, Shift>(input.shifts.map((x) => [x.shift_id, x]));
  const stopsBy = groupBy(plan.stops, (x) => x.route_id);
  const raws: Raw[] = [];
  const push = (e: Raw) => raws.push(e);
  const outcomes: DeliveryOutcome[] = [];
  const deliveryStatus = new Map<string, string>(), orderStatus = new Map<string, string>();
  const routes: Route[] = plan.routes.map((r) => ({ ...r }));
  const planTime = (date: string) => isoAt(addDays(date, -1), 1020); // plans are frozen the evening before (17:00)
  const siteOf = (id: string): CustomerSite => siteBy.get(id)!;

  // order + delivery start states for everything
  for (const d of input.deliveries) {
    const o = input.orders.find((x) => x.order_id === d.order_id)!;
    const created = isoAt(o.order_date, 480 + new Rng(seed, "created:" + d.delivery_id).int(0, 480)); // 08:00-16:00
    push({ entity_type: "ORDER", entity_id: d.order_id, to_state: "NEW", time: created, reason: null, actor: "SYSTEM" });
    push({ entity_type: "DELIVERY", entity_id: d.delivery_id, to_state: "CREATED", time: created, reason: null, actor: "SYSTEM" });
  }
  for (const u of plan.unserved) {
    const d = delBy.get(u.delivery_id)!;
    const t = planTime(d.delivery_date);
    push({ entity_type: "DELIVERY", entity_id: d.delivery_id, to_state: "UNSERVED", time: t, reason: u.reason_code, actor: "PLANNER" });
    push({ entity_type: "ORDER", entity_id: d.order_id, to_state: "UNSERVED", time: t, reason: u.reason_code, actor: "PLANNER" });
    deliveryStatus.set(d.delivery_id, "UNSERVED"); orderStatus.set(d.order_id, "UNSERVED");
  }

  let outN = 0;
  for (const r of routes) {
    const shift = shiftBy.get(r.shift_id)!;
    const rr = new Rng(seed, "route:" + r.route_id);
    const start = shift.start_min + rr.int(0, 10);
    const stops = (stopsBy.get(r.route_id) ?? []).slice().sort((a, b) => a.sequence - b.sequence);
    const pt = planTime(r.route_date);
    push({ entity_type: "ROUTE", entity_id: r.route_id, to_state: "PLANNED", time: pt, reason: null, actor: "PLANNER" });
    push({ entity_type: "ROUTE", entity_id: r.route_id, to_state: "IN_PROGRESS", time: isoAt(r.route_date, start), reason: null, actor: "DRIVER" });
    let t = start, ended = false;
    for (const s of stops) {
      const d = delBy.get(s.delivery_id)!, site = siteOf(d.site_id), w = winBy.get(d.delivery_id)!;
      const sr = new Rng(seed, "sim:" + d.delivery_id);
      const fTravel = 0.85 + 0.5 * sr.float(), fService = 0.8 + 0.6 * sr.float(), roll = sr.float();
      push({ entity_type: "DELIVERY", entity_id: d.delivery_id, to_state: "PLANNED", time: pt, reason: null, actor: "PLANNER" });
      push({ entity_type: "ORDER", entity_id: d.order_id, to_state: "SCHEDULED", time: pt, reason: null, actor: "PLANNER" });
      push({ entity_type: "DELIVERY", entity_id: d.delivery_id, to_state: "DISPATCHED", time: isoAt(r.route_date, start), reason: null, actor: "DRIVER" });
      const base = { outcome_id: `OUT-2026-${pad(++outN, 6)}`, delivery_id: d.delivery_id, route_stop_id: s.route_stop_id };
      const finish = (status: string, reason: string | null, t0: number | null) => {
        deliveryStatus.set(d.delivery_id, status); orderStatus.set(d.order_id, status === "DELIVERED" ? "FULFILLED" : "FAILED");
        const when = isoAt(r.route_date, t0 ?? shift.end_min);
        push({ entity_type: "DELIVERY", entity_id: d.delivery_id, to_state: status, time: when, reason, actor: "DRIVER" });
        push({ entity_type: "ORDER", entity_id: d.order_id, to_state: orderStatus.get(d.order_id)!, time: when, reason, actor: "SYSTEM" });
      };
      if (ended) {
        outcomes.push({ ...base, outcome_status: "FAILED", failure_reason_code: "DRIVER_SHIFT_ENDED", actual_arrival_min: null, actual_service_start_min: null, actual_departure_min: null, delay_minutes: null, on_time: null });
        finish("FAILED", "DRIVER_SHIFT_ENDED", null); continue;
      }
      const arrival = t + Math.ceil(s.travel_minutes_from_prev * fTravel);
      if (arrival > shift.end_min) {
        ended = true;
        outcomes.push({ ...base, outcome_status: "FAILED", failure_reason_code: "DRIVER_SHIFT_ENDED", actual_arrival_min: null, actual_service_start_min: null, actual_departure_min: null, delay_minutes: null, on_time: null });
        finish("FAILED", "DRIVER_SHIFT_ENDED", null); continue;
      }
      const ss = Math.max(arrival, w.window_start_min);
      const late = arrival - w.window_end_min;
      let reason: string | null = null;
      if (late > LATE_TOLERANCE_MIN && !site.accepts_late) reason = "CUSTOMER_REFUSED_LATE";
      else if (roll < 0.025) reason = "CUSTOMER_ABSENT";
      else if (roll < 0.04) reason = "SITE_CLOSED";
      else if (roll < 0.05) reason = "ACCESS_RESTRICTED";
      else if (roll < 0.057) reason = "ADDRESS_NOT_FOUND";
      else if (roll < 0.065) reason = "DAMAGED_GOODS";
      const service = reason ? Math.min(4, s.service_minutes) : Math.ceil(s.service_minutes * fService);
      const dep = ss + service;
      push({ entity_type: "DELIVERY", entity_id: d.delivery_id, to_state: "ARRIVED", time: isoAt(r.route_date, arrival), reason: null, actor: "DRIVER" });
      outcomes.push({ ...base, outcome_status: reason ? "FAILED" : "DELIVERED", failure_reason_code: reason, actual_arrival_min: arrival, actual_service_start_min: ss, actual_departure_min: dep, delay_minutes: Math.max(0, late), on_time: late <= 0 });
      finish(reason ? "FAILED" : "DELIVERED", reason, dep);
      t = dep;
    }
    const back = Math.ceil(r.planned_return_minutes * (0.85 + 0.5 * rr.float()));
    const end = Math.max(t + (ended ? 0 : back), start + 1);
    r.status = "COMPLETED"; r.actual_start_min = start; r.actual_end_min = end;
    push({ entity_type: "ROUTE", entity_id: r.route_id, to_state: "COMPLETED", time: isoAt(r.route_date, end), reason: null, actor: "DRIVER" });
  }

  // Sort raw events by time, then assign append-only IDs and per-entity sequence numbers.
  const rank: Record<string, number> = { ORDER: 0, DELIVERY: 1, ROUTE: 2 };
  const stateRank = ["NEW", "CREATED", "PLANNED", "SCHEDULED", "UNSERVED", "IN_PROGRESS", "DISPATCHED", "ARRIVED", "DELIVERED", "FAILED", "FULFILLED", "COMPLETED"];
  raws.forEach((e, i) => ((e as any).i = i));
  raws.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0) || rank[a.entity_type] - rank[b.entity_type] || a.entity_id.localeCompare(b.entity_id) || (a as any).i - (b as any).i);
  const last = new Map<string, { n: number; state: string }>();
  const events: StateEvent[] = raws.map((e, i) => {
    const key = e.entity_type + "|" + e.entity_id;
    const prev = last.get(key);
    const n = (prev?.n ?? 0) + 1;
    last.set(key, { n, state: e.to_state });
    return { event_id: `EVT-${pad(i + 1, 7)}`, entity_type: e.entity_type, entity_id: e.entity_id, sequence_no: n, from_state: prev?.state ?? null, to_state: e.to_state, event_time: e.time, reason_code: e.reason, actor: e.actor };
  });
  void stateRank;
  return { routes, outcomes, events, deliveryStatus, orderStatus };
}
