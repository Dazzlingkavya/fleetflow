// Real dashboard numbers, calculated from the generated tables (nothing is hard-coded).
import type { Dataset } from "./pipeline.js";
import type { Finding } from "./validator.js";
import { groupBy, round } from "./util.js";

export function computeMetrics(ds: Dataset, findings: Finding[]) {
  const t = ds.tables;
  const cap = (vid: string, date: string) => t.vehicle_capacity.find((c) => c.vehicle_id === vid && c.effective_from <= date && (c.effective_to === null || date <= c.effective_to));
  const count = (rows: { [k: string]: any }[], key: string) => rows.reduce<Record<string, number>>((a, r) => { if (r[key]) a[r[key]] = (a[r[key]] ?? 0) + 1; return a; }, {});
  const delivered = t.delivery.filter((d) => d.status === "DELIVERED").length;
  const failed = t.delivery.filter((d) => d.status === "FAILED").length;
  const unserved = t.delivery.filter((d) => d.status === "UNSERVED").length;
  const assigned = t.delivery.filter((d) => d.assigned_route_id).length;
  const attempted = t.delivery_outcome.filter((o) => o.actual_arrival_min !== null);
  const onTime = attempted.filter((o) => o.on_time).length;
  const util = t.route.map((r) => { const c = cap(r.vehicle_id, r.route_date); return c ? { w: (r.planned_total_weight_kg / c.max_weight_kg) * 100, v: (r.planned_total_volume_m3 / c.max_volume_m3) * 100 } : null; }).filter((x): x is { w: number; v: number } => !!x);
  const avg = (a: number[]) => (a.length ? round(a.reduce((x, y) => x + y, 0) / a.length, 1) : 0);
  const days = groupBy(t.route, (r) => r.route_date);
  const errs = findings.filter((f) => f.severity === "ERROR");
  return {
    variant: ds.variant,
    deliveries: { total: t.delivery.length, assigned, unserved, delivered, failed, success_rate_pct: assigned ? round((delivered / assigned) * 100, 1) : 0 },
    routes: { total: t.route.length, avg_stops_per_route: avg(t.route.map((r) => r.planned_stop_count)), total_planned_distance_km: round(t.route.reduce((a, r) => a + r.planned_distance_km, 0), 1), avg_vehicles_used_per_day: avg([...days.values()].map((x) => x.length)), avg_weight_utilization_pct: avg(util.map((u) => u.w)), avg_volume_utilization_pct: avg(util.map((u) => u.v)) },
    performance: { attempted: attempted.length, on_time: onTime, on_time_pct: attempted.length ? round((onTime / attempted.length) * 100, 1) : 0, avg_delay_minutes_when_late: avg(attempted.filter((o) => (o.delay_minutes ?? 0) > 0).map((o) => o.delay_minutes!)) },
    violations: { capacity: errs.filter((f) => f.code === "ROUTE_CAPACITY_EXCEEDED").length, shift: errs.filter((f) => f.code === "SHIFT_EXCEEDED").length, time_window: errs.filter((f) => f.code === "TIME_WINDOW_VIOLATED").length, total_errors: errs.length, total_warnings: findings.length - errs.length },
    unserved_by_reason: count(t.delivery, "unserved_reason_code"),
    failed_by_reason: count(t.delivery_outcome, "failure_reason_code"),
  };
}
