// Shapes of what the backend API returns.
export interface Summary {
  variant: string;
  deliveries: { total: number; assigned: number; unserved: number; delivered: number; failed: number; success_rate_pct: number };
  routes: { total: number; avg_stops_per_route: number; total_planned_distance_km: number; avg_vehicles_used_per_day: number; avg_weight_utilization_pct: number; avg_volume_utilization_pct: number };
  performance: { attempted: number; on_time: number; on_time_pct: number; avg_delay_minutes_when_late: number };
  violations: { capacity: number; shift: number; time_window: number; total_errors: number; total_warnings: number };
  unserved_by_reason: Record<string, number>;
  failed_by_reason: Record<string, number>;
}
export interface RouteRow { route_id: string; route_date: string; vehicle_id: string; vehicle_type: string; driver_id: string; driver_name: string; stops: number; distance_km: number; weight_kg: number; capacity_kg: number | null; utilization_pct: number | null; start_min: number; end_min: number; status: string; delivered: number; failed: number; error_count: number; }
export interface StopRow { route_stop_id: string; sequence: number; delivery_id: string; site_name?: string; window_start_min?: number; window_end_min?: number; planned_arrival_min: number; planned_service_start_min: number; planned_departure_min: number; service_minutes: number; load_weight_kg: number; outcome: string | null; failure_reason_code: string | null; actual_arrival_min: number | null; }
export interface DeliveryRow { delivery_id: string; order_id: string; site_id: string; delivery_date: string; priority: number; weight_kg: number; status: string; route_id: string | null; reason: string | null; }
export interface Finding { code: string; severity: "ERROR" | "WARNING"; entity_type: string; entity_id: string; route_id: string | null; message: string; }
export interface Validation {
  variant: string; record_counts: Record<string, number>;
  summary: { errors: number; warnings: number; checks_passed: number; checks_failed: number; checks_warn: number; checks_total: number };
  checks: { code: string; severity: string; description: string; violations: number; status: "PASS" | "FAIL" | "WARN" }[];
  ground_truth_evaluation: { injected_anomalies: number; detected: number; unexplained_error_findings: number; expected_decisions_total: number; expected_decisions_matched: number };
}
