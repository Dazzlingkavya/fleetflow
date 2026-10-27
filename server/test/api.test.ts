import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { findingsOf, full } from "./helpers.js";

let server: ReturnType<ReturnType<typeof createApp>["listen"]>, base = "";
beforeAll(() => new Promise<void>((ok) => { server = createApp().listen(0, () => { base = `http://localhost:${(server.address() as AddressInfo).port}`; ok(); }); }));
afterAll(() => { server.close(); });
const get = async (p: string) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() as any }; };

describe("dashboard API returns real calculated results", () => {
  const t = full(true).tables;
  it("health", async () => expect((await get("/api/health")).body.ok).toBe(true));
  it("summary equals numbers recomputed from the generated tables", async () => {
    const { body: s } = await get("/api/summary");
    expect(s.deliveries.total).toBe(2000);
    expect(s.deliveries.assigned + s.deliveries.unserved).toBe(2000);
    expect(s.deliveries.delivered).toBe(t.delivery.filter((d) => d.status === "DELIVERED").length);
    expect(s.deliveries.failed).toBe(t.delivery.filter((d) => d.status === "FAILED").length);
    expect(s.routes.total).toBe(t.route.length);
    expect(s.violations.capacity).toBe(findingsOf(full(true)).filter((f) => f.code === "ROUTE_CAPACITY_EXCEEDED").length);
    const att = t.delivery_outcome.filter((o) => o.actual_arrival_min !== null);
    expect(s.performance.on_time_pct).toBeCloseTo((att.filter((o) => o.on_time).length / att.length) * 100, 0);
  });
  it("routes, stops, deliveries, exceptions and validation endpoints", async () => {
    const routes = (await get("/api/routes")).body; expect(routes).toHaveLength(t.route.length);
    const st = (await get(`/api/routes/${routes[0].route_id}/stops`)).body; expect(st.stops.length).toBe(routes[0].stops);
    expect((await get("/api/routes/RTE-2026-999999/stops")).status).toBe(404);
    expect((await get("/api/deliveries?status=UNSERVED")).body.every((d: any) => d.status === "UNSERVED")).toBe(true);
    expect((await get("/api/routes?issues=1")).body.length).toBeGreaterThan(0);
    const ex = (await get("/api/exceptions")).body; expect(ex[0].severity).toBe("ERROR");
    const v = (await get("/api/validation")).body; expect(v.ground_truth_evaluation.detected).toBe(20); expect(v.checks.length).toBeGreaterThan(30);
  });
  it("baseline variant has zero validation errors", async () => { const s = (await get("/api/summary?variant=baseline")).body; expect(s.variant).toBe("baseline"); expect(s.violations.total_errors).toBe(0); });
});
