import { describe, expect, it } from "vitest";
import { FAILURE_REASONS, LATE_TOLERANCE_MIN, TRANSITIONS } from "../src/config.js";
import { by, full } from "./helpers.js";

describe("simulation lifecycle and outcomes", () => {
  const t = full(false).tables;
  it("every state change is an allowed transition and history is append-only (numbered, time-ordered)", () => {
    const g = new Map<string, typeof t.state_event>(); t.state_event.forEach((e) => g.set(e.entity_type + "|" + e.entity_id, [...(g.get(e.entity_type + "|" + e.entity_id) ?? []), e]));
    for (const [, evs] of g) {
      let prev: string | null = null, time = "";
      evs.forEach((e, i) => { expect(e.sequence_no).toBe(i + 1); expect(e.from_state).toBe(prev); expect(e.event_time >= time).toBe(true); expect(TRANSITIONS[e.entity_type][prev ?? ""]).toContain(e.to_state); prev = e.to_state; time = e.event_time; });
    }
    const ids = t.state_event.map((e) => e.event_id); expect(ids).toEqual([...ids].sort()); // event IDs only ever grow
  });
  it("the last event of every delivery equals its current status", () => {
    const last = new Map<string, string>(); t.state_event.filter((e) => e.entity_type === "DELIVERY").forEach((e) => last.set(e.entity_id, e.to_state));
    for (const d of t.delivery) expect(last.get(d.delivery_id)).toBe(d.status);
  });
  it("creates one outcome per planned stop and none for unserved deliveries", () => {
    expect(t.delivery_outcome).toHaveLength(t.route_stop.length);
    const out = new Set(t.delivery_outcome.map((o) => o.delivery_id));
    for (const d of t.delivery) expect(out.has(d.delivery_id)).toBe(d.status !== "UNSERVED");
  });
  it("failed deliveries always have a meaningful reason code; delivered ones have none", () => {
    for (const o of t.delivery_outcome) { if (o.outcome_status === "FAILED") expect(FAILURE_REASONS as readonly string[]).toContain(o.failure_reason_code); else expect(o.failure_reason_code).toBeNull(); }
    expect(new Set(t.delivery_outcome.map((o) => o.failure_reason_code).filter(Boolean)).size).toBeGreaterThanOrEqual(5);
  });
  it("follows the documented rules: late refusals and shift-ended failures", () => {
    const site = by(t.customer_site, (s) => s.site_id), del = by(t.delivery, (d) => d.delivery_id), win = by(t.time_window, (w) => w.delivery_id);
    for (const o of t.delivery_outcome.filter((x) => x.failure_reason_code === "CUSTOMER_REFUSED_LATE")) {
      const d = del.get(o.delivery_id)!; expect(site.get(d.site_id)!.accepts_late).toBe(false); expect(o.actual_arrival_min! - win.get(o.delivery_id)!.window_end_min).toBeGreaterThan(LATE_TOLERANCE_MIN);
    }
    for (const o of t.delivery_outcome.filter((x) => x.failure_reason_code === "DRIVER_SHIFT_ENDED")) expect(o.actual_arrival_min).toBeNull();
    for (const o of t.delivery_outcome.filter((x) => x.actual_arrival_min !== null)) { const w = win.get(o.delivery_id)!; expect(o.on_time).toBe(o.actual_arrival_min! <= w.window_end_min); }
  });
  it("completed routes have actual start/end; actual times are not copied from the plan", () => {
    expect(t.route.every((r) => r.status === "COMPLETED" && r.actual_start_min !== null && r.actual_end_min! > r.actual_start_min!)).toBe(true);
    expect(t.delivery_outcome.some((o) => o.actual_arrival_min !== null && o.delay_minutes! > 0)).toBe(true);
  });
});
