import { describe, expect, it } from "vitest";
import { FULL_SCALE, SEED, SMALL_SCALE, fullConfig } from "../src/config.js";
import { buildDataset } from "../src/pipeline.js";
import { TABLE_ORDER, TABLE_PK } from "../src/types.js";
import { full, small } from "./helpers.js";

describe("generator: required counts, IDs, keys", () => {
  const t = full(true).tables;
  it("uses the required seed", () => expect(SEED).toBe(20261022));
  it("creates the exact required record counts", () => {
    expect(t.customer_site).toHaveLength(500);
    expect(t.delivery).toHaveLength(2000);
    expect(t.customer_order).toHaveLength(2000);
    expect(t.time_window).toHaveLength(2000);
    expect(t.vehicle).toHaveLength(100);
    expect(t.driver).toHaveLength(100);
    expect(new Set(t.travel_time_matrix.map((m) => m.scenario_date)).size).toBe(30); // 30 days of matrices
    expect(t.travel_time_matrix).toHaveLength(30 * 5 * 81);
  });
  it("covers every required entity (12) with data", () => {
    for (const n of ["customer_site", "customer_order", "delivery", "vehicle", "vehicle_capacity", "driver", "shift", "travel_time_matrix", "time_window", "route", "route_stop", "delivery_outcome"] as const) expect(t[n].length, n).toBeGreaterThan(0);
  });
  it("uses the required ID formats", () => {
    expect(t.customer_order.every((o) => /^ORD-2026-\d{6}$/.test(o.order_id))).toBe(true);
    expect(t.delivery.every((d) => /^DEL-2026-\d{6}$/.test(d.delivery_id))).toBe(true);
    expect(t.vehicle.every((v) => /^VEH-\d{6}$/.test(v.vehicle_id))).toBe(true);
    expect(t.driver.every((d) => /^DRV-\d{6}$/.test(d.driver_id))).toBe(true);
    expect(t.route.every((r) => /^RTE-2026-\d{6}$/.test(r.route_id))).toBe(true);
    expect(t.route_stop.every((s) => new RegExp(`^STOP-${s.route_id}-\\d{3}$`).test(s.route_stop_id))).toBe(true);
    expect(t.delivery[0].delivery_id).toBe("DEL-2026-000001");
    expect(t.vehicle[99].vehicle_id).toBe("VEH-000100");
  });
  it("has unique primary keys in every table", () => {
    for (const n of TABLE_ORDER) { const ids = (t[n] as any[]).map((r) => r[TABLE_PK[n]]); expect(new Set(ids).size, n).toBe(ids.length); }
  });
  it("is the same generator for small and full scale (parameterised)", () => {
    const s = small(false).tables;
    expect(s.customer_site).toHaveLength(SMALL_SCALE.sites);
    expect(s.delivery).toHaveLength(SMALL_SCALE.deliveries);
    expect(s.vehicle).toHaveLength(SMALL_SCALE.vehicles);
    expect(FULL_SCALE.deliveries).toBe(2000);
  });
  it("derives totals from source data (not random)", () => {
    for (const o of t.customer_order) { expect(o.total_weight_kg).toBeCloseTo(o.item_count * o.unit_weight_kg, 1); }
    const ord = new Map(t.customer_order.map((o) => [o.order_id, o]));
    for (const d of t.delivery) expect(d.weight_kg).toBe(ord.get(d.order_id)!.total_weight_kg);
  });
  it("has realistic variation (restrictions, maintenance, varied traffic, failed deliveries)", () => {
    expect(t.vehicle_site_restriction.length).toBeGreaterThan(0);
    expect(new Set(t.travel_time_matrix.map((m) => m.scenario_type)).size).toBeGreaterThan(1);
    expect(t.vehicle.some((v) => v.status === "IN_MAINTENANCE")).toBe(true);
    expect(t.delivery.some((d) => d.status === "FAILED")).toBe(true);
    expect(new Set(t.delivery.map((d) => d.service_minutes)).size).toBeGreaterThan(10);
  });
});

describe("generator: determinism", () => {
  it("same seed => identical data; different seed => different data", () => {
    const a = JSON.stringify(buildDataset(fullConfig(true)).tables), b = JSON.stringify(full(true).tables);
    expect(a).toBe(b);
    expect(JSON.stringify(buildDataset(fullConfig(true, 1)).tables)).not.toBe(a);
  });
});
