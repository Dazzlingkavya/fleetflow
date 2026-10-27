// Runs the whole chain: generate -> plan -> simulate -> (inject anomalies) -> assemble tables.
import type { RunConfig } from "./config.js";
import { injectOutputAnomalies } from "./anomalies.js";
import { generateInputs } from "./generator.js";
import { plan } from "./planner.js";
import { simulate } from "./simulator.js";
import type { Delivery, GroundTruthRow, GtDraft, PlannerInput, Tables } from "./types.js";
import { pad } from "./util.js";

export interface Dataset {
  variant: "baseline" | "dataset";
  config: RunConfig;
  tables: Tables;
  ground_truth: GroundTruthRow[]; // kept OUT of `tables` and never passed to the planner
}

const ISSUE_ORDER = ["INFEASIBLE_BY_DESIGN", "COORDINATE_OUT_OF_REGION", "ROUTE_EXCEEDS_CAPACITY", "DRIVER_SHIFT_EXCEEDED", "ARRIVAL_BEFORE_PREV_DEPARTURE", "STOP_OMITTED", "STOP_DUPLICATED"];

export function buildDataset(config: RunConfig): Dataset {
  const { input, labels } = generateInputs(config);
  const planInput: PlannerInput = structuredClone(input); // planner gets its own copy
  const pl = plan(planInput);
  const sim = simulate(planInput, pl, config.seed);
  const assigned = new Map(pl.stops.map((s) => [s.delivery_id, s.route_id]));
  const reason = new Map(pl.unserved.map((u) => [u.delivery_id, u.reason_code]));
  const tables: Tables = {
    customer_site: structuredClone(input.sites),
    customer_order: input.orders.map((o) => ({ ...o, status: sim.orderStatus.get(o.order_id)! })),
    delivery: input.deliveries.map((d): Delivery => ({ ...d, status: sim.deliveryStatus.get(d.delivery_id)!, assigned_route_id: assigned.get(d.delivery_id) ?? null, unserved_reason_code: reason.get(d.delivery_id) ?? null })),
    time_window: structuredClone(input.time_windows),
    vehicle: structuredClone(input.vehicles), vehicle_capacity: structuredClone(input.vehicle_capacities),
    vehicle_site_restriction: structuredClone(input.vehicle_site_restrictions),
    driver: structuredClone(input.drivers), shift: structuredClone(input.shifts), travel_time_matrix: structuredClone(input.travel_matrix),
    route: sim.routes, route_stop: structuredClone(pl.stops), delivery_outcome: sim.outcomes, state_event: sim.events,
  };
  const all: GtDraft[] = [...labels];
  if (config.includeAnomalies) all.push(...injectOutputAnomalies(tables, input, config));
  all.sort((a, b) => ISSUE_ORDER.indexOf(a.issue_type) - ISSUE_ORDER.indexOf(b.issue_type) || a.entity_id.localeCompare(b.entity_id));
  const ground_truth = all.map((g, i) => ({ gt_id: `GT-${pad(i + 1, 5)}`, ...g }));
  return { variant: config.includeAnomalies ? "dataset" : "baseline", config, tables, ground_truth };
}
