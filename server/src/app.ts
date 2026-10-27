// Express API. Everything is calculated from the generated dataset (no hard-coded numbers).
import cors from "cors";
import express from "express";
import { fullConfig, type RunConfig } from "./config.js";
import { evaluateAgainstGroundTruth } from "./evaluation.js";
import { computeMetrics } from "./metrics.js";
import { buildDataset, type Dataset } from "./pipeline.js";
import { buildReport, validate, type Finding } from "./validator.js";
import { groupBy, round } from "./util.js";

interface Bundle { ds: Dataset; findings: Finding[]; metrics: ReturnType<typeof computeMetrics>; report: ReturnType<typeof buildReport>; evaluation: ReturnType<typeof evaluateAgainstGroundTruth>; }

export function createApp(cfg: (anomalies: boolean) => RunConfig = fullConfig) {
  const cache = new Map<string, Bundle>();
  const bundle = (variant: string): Bundle => {
    const v = variant === "baseline" ? "baseline" : "dataset";
    let b = cache.get(v);
    if (!b) {
      const ds = buildDataset(cfg(v === "dataset"));
      const findings = validate(ds.tables);
      b = { ds, findings, metrics: computeMetrics(ds, findings), report: buildReport(ds.tables, findings), evaluation: evaluateAgainstGroundTruth(ds, findings) };
      cache.set(v, b);
    }
    return b;
  };
  const app = express();
  app.use(cors());
  const q = (req: express.Request) => bundle(String(req.query.variant ?? "dataset"));

  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "fleetflow-server" }));
  app.get("/api/meta", (req, res) => { const b = q(req); res.json({ variant: b.ds.variant, seed: b.ds.config.seed, scale: b.ds.config.scale, record_counts: b.report.record_counts, data_origin: "synthetic (generated, no real personal data)" }); });
  app.get("/api/summary", (req, res) => res.json(q(req).metrics));

  app.get("/api/routes", (req, res) => {
    const b = q(req), t = b.ds.tables;
    const veh = new Map(t.vehicle.map((v) => [v.vehicle_id, v])), drv = new Map(t.driver.map((d) => [d.driver_id, d]));
    const del = new Map(t.delivery.map((d) => [d.delivery_id, d]));
    const stops = groupBy(t.route_stop, (s) => s.route_id), errs = groupBy(b.findings.filter((f) => f.severity === "ERROR" && f.route_id), (f) => f.route_id!);
    let rows = t.route.map((r) => {
      const cap = t.vehicle_capacity.find((c) => c.vehicle_id === r.vehicle_id && c.effective_from <= r.route_date && (c.effective_to === null || r.route_date <= c.effective_to));
      const ss = stops.get(r.route_id) ?? [];
      const st = ss.map((s) => del.get(s.delivery_id)?.status);
      return { route_id: r.route_id, route_date: r.route_date, vehicle_id: r.vehicle_id, vehicle_type: veh.get(r.vehicle_id)?.vehicle_type, driver_id: r.driver_id, driver_name: drv.get(r.driver_id)?.driver_name, stops: r.planned_stop_count, distance_km: r.planned_distance_km, weight_kg: r.planned_total_weight_kg, capacity_kg: cap?.max_weight_kg ?? null, utilization_pct: cap ? round((r.planned_total_weight_kg / cap.max_weight_kg) * 100, 1) : null, start_min: r.planned_start_min, end_min: r.planned_end_min, status: r.status, delivered: st.filter((x) => x === "DELIVERED").length, failed: st.filter((x) => x === "FAILED").length, error_count: errs.get(r.route_id)?.length ?? 0 };
    });
    if (req.query.date) rows = rows.filter((r) => r.route_date === req.query.date);
    if (req.query.issues === "1") rows = rows.filter((r) => r.error_count > 0);
    res.json(rows);
  });
  app.get("/api/routes/:id/stops", (req, res) => {
    const t = q(req).ds.tables;
    const route = t.route.find((r) => r.route_id === req.params.id);
    if (!route) return res.status(404).json({ error: "ROUTE_NOT_FOUND" });
    const del = new Map(t.delivery.map((d) => [d.delivery_id, d])), site = new Map(t.customer_site.map((s) => [s.site_id, s])), win = new Map(t.time_window.map((w) => [w.delivery_id, w]));
    const out = new Map(t.delivery_outcome.map((o) => [o.route_stop_id, o]));
    res.json({ route, stops: t.route_stop.filter((s) => s.route_id === route.route_id).sort((a, b) => a.sequence - b.sequence).map((s) => ({ ...s, site_name: site.get(del.get(s.delivery_id)?.site_id ?? "")?.site_name, window_start_min: win.get(s.delivery_id)?.window_start_min, window_end_min: win.get(s.delivery_id)?.window_end_min, outcome: out.get(s.route_stop_id)?.outcome_status ?? null, failure_reason_code: out.get(s.route_stop_id)?.failure_reason_code ?? null, actual_arrival_min: out.get(s.route_stop_id)?.actual_arrival_min ?? null })) });
  });
  app.get("/api/deliveries", (req, res) => {
    const t = q(req).ds.tables;
    const ord = new Map(t.customer_order.map((o) => [o.order_id, o])), out = new Map(t.delivery_outcome.map((o) => [o.delivery_id, o]));
    let rows = t.delivery.map((d) => ({ delivery_id: d.delivery_id, order_id: d.order_id, site_id: d.site_id, delivery_date: d.delivery_date, priority: ord.get(d.order_id)?.priority, weight_kg: d.weight_kg, status: d.status, route_id: d.assigned_route_id, reason: d.unserved_reason_code ?? out.get(d.delivery_id)?.failure_reason_code ?? null }));
    if (req.query.status) rows = rows.filter((r) => r.status === req.query.status);
    res.json(rows);
  });
  app.get("/api/exceptions", (req, res) => {
    const b = q(req), order = { ERROR: 0, WARNING: 1 } as const;
    const rows = b.findings.filter((f) => f.code !== "ACTUAL_SHIFT_OVERRUN").sort((a, c) => order[a.severity] - order[c.severity] || a.code.localeCompare(c.code) || a.entity_id.localeCompare(c.entity_id));
    res.json(rows);
  });
  app.get("/api/validation", (req, res) => { const b = q(req); res.json({ variant: b.ds.variant, ...b.report, ground_truth_evaluation: b.evaluation, errors: b.findings.filter((f) => f.severity === "ERROR") }); });
  return app;
}
