import { describe, expect, it } from "vitest";
import { by, findingsOf, full } from "./helpers.js";

describe("baseline data integrity (clean data has zero validation errors)", () => {
  const ds = full(false), t = ds.tables;
  it("validator reports 0 errors on the baseline", () => expect(findingsOf(ds).filter((f) => f.severity === "ERROR")).toEqual([]));
  it("every foreign key resolves (independent join check)", () => {
    const site = by(t.customer_site, (x) => x.site_id), order = by(t.customer_order, (x) => x.order_id), del = by(t.delivery, (x) => x.delivery_id);
    const veh = by(t.vehicle, (x) => x.vehicle_id), drv = by(t.driver, (x) => x.driver_id), shift = by(t.shift, (x) => x.shift_id);
    const route = by(t.route, (x) => x.route_id), stop = by(t.route_stop, (x) => x.route_stop_id);
    expect(t.customer_order.every((o) => site.has(o.site_id))).toBe(true);
    expect(t.delivery.every((d) => order.has(d.order_id) && site.has(d.site_id) && (!d.assigned_route_id || route.has(d.assigned_route_id)))).toBe(true);
    expect(t.time_window.every((w) => del.has(w.delivery_id))).toBe(true);
    expect(t.vehicle_capacity.every((c) => veh.has(c.vehicle_id))).toBe(true);
    expect(t.vehicle_site_restriction.every((r) => veh.has(r.vehicle_id) && site.has(r.site_id))).toBe(true);
    expect(t.shift.every((s) => drv.has(s.driver_id))).toBe(true);
    expect(t.route.every((r) => veh.has(r.vehicle_id) && drv.has(r.driver_id) && shift.has(r.shift_id))).toBe(true);
    expect(t.route_stop.every((s) => route.has(s.route_id) && del.has(s.delivery_id))).toBe(true);
    expect(t.delivery_outcome.every((o) => del.has(o.delivery_id) && stop.has(o.route_stop_id))).toBe(true);
  });
  it("every delivery is assigned to exactly one route stop OR explicitly unserved with a reason", () => {
    const stops = new Map<string, number>(); t.route_stop.forEach((s) => stops.set(s.delivery_id, (stops.get(s.delivery_id) ?? 0) + 1));
    for (const d of t.delivery) {
      if (d.assigned_route_id) { expect(stops.get(d.delivery_id)).toBe(1); expect(d.unserved_reason_code).toBeNull(); }
      else { expect(d.status).toBe("UNSERVED"); expect(d.unserved_reason_code).toBeTruthy(); expect(stops.has(d.delivery_id)).toBe(false); }
    }
  });
  it("stops are numbered 1..n with no gaps or duplicates in every route", () => {
    const g = new Map<string, number[]>(); t.route_stop.forEach((s) => g.set(s.route_id, [...(g.get(s.route_id) ?? []), s.sequence]));
    for (const [, seq] of g) expect(seq.sort((a, b) => a - b)).toEqual(seq.map((_, i) => i + 1));
  });
  it("route totals reconcile with their stops", () => {
    for (const r of t.route) { const ss = t.route_stop.filter((s) => s.route_id === r.route_id); expect(ss.length).toBe(r.planned_stop_count); expect(ss.reduce((a, s) => a + s.load_weight_kg, 0)).toBeCloseTo(r.planned_total_weight_kg, 1); }
  });
});
