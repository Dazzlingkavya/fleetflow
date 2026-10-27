import { describe, expect, it } from "vitest";
import { smallConfig } from "../src/config.js";
import { generateInputs } from "../src/generator.js";
import { plan } from "../src/planner.js";
import { by, full } from "./helpers.js";

describe("planning constraints (recomputed independently of the validator)", () => {
  const t = full(false).tables;
  const veh = by(t.vehicle, (v) => v.vehicle_id), drv = by(t.driver, (d) => d.driver_id), shift = by(t.shift, (s) => s.shift_id), del = by(t.delivery, (d) => d.delivery_id), win = by(t.time_window, (w) => w.delivery_id);
  const restricted = new Set(t.vehicle_site_restriction.map((r) => `${r.vehicle_id}|${r.site_id}`));
  it("respects vehicle capacity (weight, volume, stops) using the capacity valid on the route date", () => {
    for (const r of t.route) {
      const c = t.vehicle_capacity.find((x) => x.vehicle_id === r.vehicle_id && x.effective_from <= r.route_date && (x.effective_to === null || r.route_date <= x.effective_to))!;
      expect(c, r.route_id).toBeTruthy();
      expect(r.planned_total_weight_kg).toBeLessThanOrEqual(c.max_weight_kg); expect(r.planned_total_volume_m3).toBeLessThanOrEqual(c.max_volume_m3); expect(r.planned_stop_count).toBeLessThanOrEqual(c.max_stops);
    }
  });
  it("respects vehicle restrictions, licences and one route per vehicle/driver per day", () => {
    const seenV = new Set<string>(), seenD = new Set<string>();
    for (const r of t.route) {
      expect(seenV.has(r.route_date + r.vehicle_id)).toBe(false); expect(seenD.has(r.route_date + r.driver_id)).toBe(false); seenV.add(r.route_date + r.vehicle_id); seenD.add(r.route_date + r.driver_id);
      if (veh.get(r.vehicle_id)!.required_license === "C") expect(drv.get(r.driver_id)!.license_class).toBe("C");
      for (const s of t.route_stop.filter((x) => x.route_id === r.route_id)) expect(restricted.has(`${r.vehicle_id}|${del.get(s.delivery_id)!.site_id}`)).toBe(false);
    }
  });
  it("respects driver shifts (including the return trip to the depot)", () => {
    for (const r of t.route) { const sh = shift.get(r.shift_id)!; expect(sh.driver_id).toBe(r.driver_id); expect(r.planned_start_min).toBeGreaterThanOrEqual(sh.start_min); expect(r.planned_end_min).toBeLessThanOrEqual(sh.end_min); }
  });
  it("respects time windows, service durations and stop ordering", () => {
    for (const r of t.route) {
      let prev = r.planned_start_min;
      for (const s of t.route_stop.filter((x) => x.route_id === r.route_id).sort((a, b) => a.sequence - b.sequence)) {
        const w = win.get(s.delivery_id)!;
        expect(s.planned_arrival_min).toBe(prev + s.travel_minutes_from_prev);
        expect(s.planned_service_start_min).toBeGreaterThanOrEqual(w.window_start_min); expect(s.planned_service_start_min).toBeLessThanOrEqual(w.window_end_min);
        expect(s.planned_departure_min - s.planned_service_start_min).toBe(del.get(s.delivery_id)!.service_minutes);
        prev = s.planned_departure_min;
      }
    }
  });
  it("marks deliveries unserved with documented reason codes", () => {
    const allowed = ["INVALID_SITE_COORDINATE", "EXCEEDS_MAX_VEHICLE_CAPACITY", "NO_DRIVER_AVAILABLE", "NO_VEHICLE_AVAILABLE", "NO_COMPATIBLE_VEHICLE", "NO_FEASIBLE_TIME_WINDOW", "NO_CAPACITY_AVAILABLE"];
    const un = t.delivery.filter((d) => d.status === "UNSERVED");
    expect(un.length).toBeGreaterThan(0);
    expect(un.every((d) => allowed.includes(d.unserved_reason_code!))).toBe(true);
  });
  it("serves almost every feasible delivery (>= 99%)", () => {
    const feasible = t.delivery.filter((d) => !["EXCEEDS_MAX_VEHICLE_CAPACITY", "NO_FEASIBLE_TIME_WINDOW"].includes(d.unserved_reason_code ?? ""));
    expect(feasible.filter((d) => d.assigned_route_id).length / feasible.length).toBeGreaterThanOrEqual(0.99);
  });
});

describe("priority handling (tiny controlled scenario)", () => {
  it("serves the URGENT delivery and leaves the NORMAL one unserved when only one fits", () => {
    const { input } = generateInputs(smallConfig(false));
    const shift = input.shifts[0], driver = input.drivers.find((d) => d.driver_id === shift.driver_id)!;
    const veh = input.vehicles.find((v) => v.vehicle_type === "VAN_SMALL")!;
    const [s0, s1] = input.sites.filter((s) => s.access_class === "STANDARD");
    const mk = (n: number, site: string, prio: number) => ({
      d: { delivery_id: `DEL-2026-90000${n}`, order_id: `ORD-2026-90000${n}`, site_id: site, delivery_date: shift.shift_date, weight_kg: 400, volume_m3: 1, service_minutes: 10 },
      o: { order_id: `ORD-2026-90000${n}`, site_id: site, order_date: "2026-01-01", requested_date: shift.shift_date, priority: prio, item_count: 1, unit_weight_kg: 400, unit_volume_m3: 1, total_weight_kg: 400, total_volume_m3: 1 },
      w: { window_id: `TW-90000${n}`, delivery_id: `DEL-2026-90000${n}`, window_start_min: shift.start_min, window_end_min: shift.end_min, window_type: "HARD" },
    });
    const a = mk(1, s0.site_id, 3), b = mk(2, s1.site_id, 1); // 800 kg wanted, van holds 600
    const res = plan({ ...input, sites: [s0, s1], orders: [a.o, b.o], deliveries: [a.d, b.d], time_windows: [a.w, b.w], vehicles: [veh], vehicle_capacities: input.vehicle_capacities.filter((c) => c.vehicle_id === veh.vehicle_id), vehicle_site_restrictions: [], drivers: [driver], shifts: [shift] });
    expect(res.stops.map((s) => s.delivery_id)).toEqual(["DEL-2026-900002"]);
    expect(res.unserved).toEqual([{ delivery_id: "DEL-2026-900001", reason_code: "NO_CAPACITY_AVAILABLE" }]);
  });
});
