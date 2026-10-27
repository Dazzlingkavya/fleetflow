// Row shapes for every table. Times are "minutes after midnight" (integers) on the row's date.
export interface CustomerSite { site_id: string; site_name: string; latitude: number; longitude: number; zone_id: string; access_class: string; accepts_late: boolean; status: string; effective_from: string; effective_to: string | null; }
export interface OrderInput { order_id: string; site_id: string; order_date: string; requested_date: string; priority: number; item_count: number; unit_weight_kg: number; unit_volume_m3: number; total_weight_kg: number; total_volume_m3: number; }
export interface CustomerOrder extends OrderInput { status: string; }
export interface DeliveryInput { delivery_id: string; order_id: string; site_id: string; delivery_date: string; weight_kg: number; volume_m3: number; service_minutes: number; }
export interface Delivery extends DeliveryInput { status: string; assigned_route_id: string | null; unserved_reason_code: string | null; }
export interface TimeWindow { window_id: string; delivery_id: string; window_start_min: number; window_end_min: number; window_type: string; }
export interface Vehicle { vehicle_id: string; registration_no: string; vehicle_type: string; required_license: string; status: string; effective_from: string; effective_to: string | null; }
export interface VehicleCapacity { capacity_id: string; vehicle_id: string; max_weight_kg: number; max_volume_m3: number; max_stops: number; effective_from: string; effective_to: string | null; }
export interface VehicleSiteRestriction { restriction_id: string; vehicle_id: string; site_id: string; reason: string; effective_from: string; }
export interface Driver { driver_id: string; driver_name: string; license_class: string; status: string; }
export interface Shift { shift_id: string; driver_id: string; shift_date: string; shift_type: string; start_min: number; end_min: number; shift_minutes: number; status: string; }
export interface TravelTimeMatrix { matrix_id: string; scenario_date: string; scenario_type: string; time_band: string; from_zone: string; to_zone: string; traffic_multiplier: number; }
export interface Route { route_id: string; route_date: string; vehicle_id: string; driver_id: string; shift_id: string; status: string; planned_start_min: number; planned_return_minutes: number; planned_end_min: number; planned_stop_count: number; planned_total_weight_kg: number; planned_total_volume_m3: number; planned_distance_km: number; planned_travel_minutes: number; planned_service_minutes: number; actual_start_min: number | null; actual_end_min: number | null; }
export interface RouteStop { route_stop_id: string; route_id: string; delivery_id: string; sequence: number; planned_arrival_min: number; planned_service_start_min: number; planned_departure_min: number; travel_minutes_from_prev: number; distance_km_from_prev: number; wait_minutes: number; service_minutes: number; load_weight_kg: number; load_volume_m3: number; }
export interface DeliveryOutcome { outcome_id: string; delivery_id: string; route_stop_id: string; outcome_status: string; failure_reason_code: string | null; actual_arrival_min: number | null; actual_service_start_min: number | null; actual_departure_min: number | null; delay_minutes: number | null; on_time: boolean | null; }
export interface StateEvent { event_id: string; entity_type: string; entity_id: string; sequence_no: number; from_state: string | null; to_state: string; event_time: string; reason_code: string | null; actor: string; }
export interface GroundTruthRow { gt_id: string; issue_type: string; category: string; entity_type: string; entity_id: string; route_id: string | null; injection_stage: string; description: string; primary_validation_code: string | null; expected_validation_codes: string; expected_decision: string | null; expected_reason_code: string | null; affected_entity_ids: string; }
export type GtDraft = Omit<GroundTruthRow, "gt_id">;

// What the planner is allowed to see. There is NO ground truth and NO outcome data in here.
export interface PlannerInput {
  sites: CustomerSite[]; orders: OrderInput[]; deliveries: DeliveryInput[]; time_windows: TimeWindow[];
  vehicles: Vehicle[]; vehicle_capacities: VehicleCapacity[]; vehicle_site_restrictions: VehicleSiteRestriction[];
  drivers: Driver[]; shifts: Shift[]; travel_matrix: TravelTimeMatrix[];
}

export interface Tables {
  customer_site: CustomerSite[]; customer_order: CustomerOrder[]; delivery: Delivery[]; time_window: TimeWindow[];
  vehicle: Vehicle[]; vehicle_capacity: VehicleCapacity[]; vehicle_site_restriction: VehicleSiteRestriction[];
  driver: Driver[]; shift: Shift[]; travel_time_matrix: TravelTimeMatrix[];
  route: Route[]; route_stop: RouteStop[]; delivery_outcome: DeliveryOutcome[]; state_event: StateEvent[];
}
export type TableName = keyof Tables;

// Column order for CSV and SQL (must match db/schema.sql). Load order = parents first.
export const TABLE_COLUMNS: Record<TableName, string[]> = {
  customer_site: ["site_id", "site_name", "latitude", "longitude", "zone_id", "access_class", "accepts_late", "status", "effective_from", "effective_to"],
  vehicle: ["vehicle_id", "registration_no", "vehicle_type", "required_license", "status", "effective_from", "effective_to"],
  driver: ["driver_id", "driver_name", "license_class", "status"],
  customer_order: ["order_id", "site_id", "order_date", "requested_date", "priority", "item_count", "unit_weight_kg", "unit_volume_m3", "total_weight_kg", "total_volume_m3", "status"],
  vehicle_capacity: ["capacity_id", "vehicle_id", "max_weight_kg", "max_volume_m3", "max_stops", "effective_from", "effective_to"],
  vehicle_site_restriction: ["restriction_id", "vehicle_id", "site_id", "reason", "effective_from"],
  shift: ["shift_id", "driver_id", "shift_date", "shift_type", "start_min", "end_min", "shift_minutes", "status"],
  travel_time_matrix: ["matrix_id", "scenario_date", "scenario_type", "time_band", "from_zone", "to_zone", "traffic_multiplier"],
  route: ["route_id", "route_date", "vehicle_id", "driver_id", "shift_id", "status", "planned_start_min", "planned_return_minutes", "planned_end_min", "planned_stop_count", "planned_total_weight_kg", "planned_total_volume_m3", "planned_distance_km", "planned_travel_minutes", "planned_service_minutes", "actual_start_min", "actual_end_min"],
  delivery: ["delivery_id", "order_id", "site_id", "delivery_date", "weight_kg", "volume_m3", "service_minutes", "status", "assigned_route_id", "unserved_reason_code"],
  time_window: ["window_id", "delivery_id", "window_start_min", "window_end_min", "window_type"],
  route_stop: ["route_stop_id", "route_id", "delivery_id", "sequence", "planned_arrival_min", "planned_service_start_min", "planned_departure_min", "travel_minutes_from_prev", "distance_km_from_prev", "wait_minutes", "service_minutes", "load_weight_kg", "load_volume_m3"],
  delivery_outcome: ["outcome_id", "delivery_id", "route_stop_id", "outcome_status", "failure_reason_code", "actual_arrival_min", "actual_service_start_min", "actual_departure_min", "delay_minutes", "on_time"],
  state_event: ["event_id", "entity_type", "entity_id", "sequence_no", "from_state", "to_state", "event_time", "reason_code", "actor"],
};
export const TABLE_ORDER = Object.keys(TABLE_COLUMNS) as TableName[];
export const TABLE_PK: Record<TableName, string> = {
  customer_site: "site_id", vehicle: "vehicle_id", driver: "driver_id", customer_order: "order_id", vehicle_capacity: "capacity_id",
  vehicle_site_restriction: "restriction_id", shift: "shift_id", travel_time_matrix: "matrix_id", route: "route_id", delivery: "delivery_id",
  time_window: "window_id", route_stop: "route_stop_id", delivery_outcome: "outcome_id", state_event: "event_id",
};
