# FleetFlow Data Dictionary

All data is synthetic. Times are **minutes after midnight** (integers) on the row's date. Weights in **kg**, volumes in **m3**, distances in **km**.
Event timestamps are local time `YYYY-MM-DDTHH:MM:SS` (no time zone). Dates are `YYYY-MM-DD`. Planning window: 30 days, 2026-09-21 to 2026-10-20.
Region (synthetic): latitude 8.60-8.90, longitude 77.55-77.85. Depot: 8.75, 77.70 (zone Z5). Zones Z1-Z9 are a 3x3 grid of the region.

## Relationships and cardinality
| Parent | Child | Cardinality | Notes |
|---|---|---|---|
| CustomerSite | Order | 1:N | every order belongs to one site |
| Order | Delivery | 1:N (this dataset: 1:1) | schema allows several deliveries per order |
| Delivery | TimeWindow | 1:0..1 (this dataset: 1:1) | `time_window.delivery_id` is UNIQUE |
| Vehicle | VehicleCapacity | 1:N | effective-dated rows; 10% of vehicles have 2 rows |
| Vehicle <-> CustomerSite | VehicleSiteRestriction | **N:M bridge** | trucks may not enter NARROW_STREET sites |
| Driver | Shift | 1:N | one shift per driver per day (UNIQUE) |
| Shift | Route | 1:0..1 | a route uses exactly one shift (driver+date) |
| Vehicle / Driver | Route | 1:N each | at most one route per vehicle and per driver per day |
| Route | RouteStop | 1:N | stop IDs `STOP-<route-id>-NNN` |
| Delivery | RouteStop | 1:0..1 | unserved deliveries have no stop |
| RouteStop | DeliveryOutcome | 1:0..1 | one outcome per attempted/planned stop |
| Order / Delivery / Route | StateEvent | 1:N | append-only history (polymorphic `entity_type`+`entity_id`) |
| (date, band, zones) | TravelTimeMatrix | - | no FK: looked up by date + time band + from/to zone |

`delivery.assigned_route_id` (optional, FK to route) is NULL exactly when the delivery is UNSERVED.

## ID formats (immutable, zero-padded)
Order `ORD-2026-000001`, Delivery `DEL-2026-000001`, Vehicle `VEH-000001`, Driver `DRV-000001`, Route `RTE-2026-000001`,
Route stop `STOP-RTE-2026-000001-001`. Others: Site `SITE-000001`, Capacity `VCAP-000001`, Restriction `RSTR-000001`, Shift `SHF-000001`,
Time window `TW-000001`, Matrix `TTM-000001`, Outcome `OUT-2026-000001`, Event `EVT-0000001`, Ground truth `GT-00001`.

## Tables (R = required)
### CustomerSite (`customer_site`) - PK `site_id`
| Field | Type | R | Allowed / rule |
|---|---|---|---|
| site_id | text | R | unique `SITE-NNNNNN` |
| site_name | text | R | synthetic name |
| latitude, longitude | decimal(9,6) | R | degrees; must be inside the region (check `COORD_OUT_OF_REGION`) |
| zone_id | text | R | `Z1`-`Z9`, or `OUT` if outside the region |
| access_class | text | R | `STANDARD`, `NARROW_STREET` |
| accepts_late | boolean | R | whether late arrivals (>15 min) are accepted |
| status | text | R | `ACTIVE`, `INACTIVE` |
| effective_from / effective_to | date | R / optional | effective_to >= effective_from |

### Order (`customer_order`) - PK `order_id`; FK `site_id`
| Field | Type | R | Allowed / rule |
|---|---|---|---|
| order_date, requested_date | date | R | order_date < requested_date |
| priority | int | R | 1 URGENT, 2 HIGH, 3 NORMAL, 4 LOW |
| item_count | int | R | > 0 |
| unit_weight_kg, unit_volume_m3 | decimal | R | > 0 |
| total_weight_kg, total_volume_m3 | decimal | R | **derived**: item_count x unit value (check `ARITH_ORDER_TOTAL`) |
| status | text | R | `NEW`, `SCHEDULED`, `FULFILLED`, `FAILED`, `UNSERVED` (final value after simulation) |

### Delivery (`delivery`) - PK `delivery_id`; FK `order_id`, `site_id`, optional `assigned_route_id`
| Field | Type | R | Allowed / rule |
|---|---|---|---|
| delivery_date | date | R | equals order.requested_date |
| weight_kg, volume_m3 | decimal | R | equal the order totals (`ARITH_DELIVERY_ORDER`) |
| service_minutes | int | R | **derived**: 5 + ceil(items x 0.6) + 4 if NARROW_STREET |
| status | text | R | `CREATED`, `PLANNED`, `DISPATCHED`, `ARRIVED`, `DELIVERED`, `FAILED`, `UNSERVED` (final: DELIVERED / FAILED / UNSERVED) |
| assigned_route_id | text | optional | NULL iff UNSERVED |
| unserved_reason_code | text | optional | required when UNSERVED (see reason codes) |

### TimeWindow (`time_window`) - PK `window_id`; FK `delivery_id` (UNIQUE)
window_start_min, window_end_min (int, end > start), window_type (`HARD`: service must start inside the window; early arrival waits).

### Vehicle (`vehicle`) - PK `vehicle_id`
registration_no (unique, fake), vehicle_type (`VAN_SMALL`, `VAN_LARGE`, `TRUCK`), required_license (`B`, `C`; trucks need C),
status (`ACTIVE`, `IN_MAINTENANCE`), effective_from, effective_to (optional: vehicle usable only inside these dates; maintenance vehicles leave service).

### VehicleCapacity (`vehicle_capacity`) - PK `capacity_id`; FK `vehicle_id`; UNIQUE (vehicle_id, effective_from)
max_weight_kg (VAN_SMALL 600, VAN_LARGE 1200, TRUCK 3000; some vehicles derated to 90% from 2026-10-06), max_volume_m3 (4 / 8 / 18), max_stops (12 / 15 / 20), effective_from, effective_to (optional).

### VehicleSiteRestriction (`vehicle_site_restriction`) - bridge; PK `restriction_id`; FK `vehicle_id`, `site_id`; UNIQUE (vehicle_id, site_id)
reason (`NARROW_STREET`), effective_from.

### Driver (`driver`) - PK `driver_id`
driver_name (random synthetic), license_class (`B` may drive only B vehicles; `C` may drive all), status (`ACTIVE`, `INACTIVE`).

### Shift (`shift`) - PK `shift_id`; FK `driver_id`; UNIQUE (driver_id, shift_date)
shift_type `EARLY` 06:00-14:00, `DAY` 09:00-17:00, `LATE` 12:00-20:00; start_min, end_min (end > start), shift_minutes (**derived** end - start), status (`SCHEDULED`, `COMPLETED`, `CANCELLED`; historical data uses COMPLETED).

### TravelTimeMatrix (`travel_time_matrix`) - PK `matrix_id`; UNIQUE (scenario_date, time_band, from_zone, to_zone)
scenario_type (`NORMAL`, `RAIN`, `FESTIVAL`, `ROADWORK`; one per day), time_band (`EARLY` <07:00, `AM_PEAK` 07-10, `MIDDAY` 10-16, `PM_PEAK` 16-19, `EVENING` >=19:00),
from_zone, to_zone, traffic_multiplier (> 0). **Travel minutes** = ceil(road_km / 40 km/h x 60 x multiplier), where road_km = straight-line km x 1.3 rounded to 2 decimals.
The multiplier is looked up with the date, the band of the departure time and the zones of both ends.

### Route (`route`) - PK `route_id`; FK `vehicle_id`, `driver_id`, `shift_id`
route_date; status (`PLANNED`, `IN_PROGRESS`, `COMPLETED`); planned_start_min (= shift start); planned_return_minutes (last stop to depot);
planned_end_min; planned_stop_count, planned_total_weight_kg, planned_total_volume_m3 (**derived** from stops, check `ROUTE_TOTAL_MISMATCH`);
planned_distance_km (includes return leg); planned_travel_minutes; planned_service_minutes; actual_start_min, actual_end_min (simulation, optional).

### RouteStop (`route_stop`) - PK `route_stop_id`; FK `route_id`, `delivery_id`; UNIQUE (route_id, sequence)
sequence (1..n), planned_arrival_min = previous departure + travel_minutes_from_prev; planned_service_start_min = max(arrival, window start);
planned_departure_min = service start + service_minutes; wait_minutes = service start - arrival; distance_km_from_prev; load_weight_kg, load_volume_m3.
Row check: arrival <= service start <= departure.

### DeliveryOutcome (`delivery_outcome`) - PK `outcome_id`; FK `delivery_id` (UNIQUE), `route_stop_id`
outcome_status (`DELIVERED`, `FAILED`); failure_reason_code (required iff FAILED); actual_arrival_min, actual_service_start_min, actual_departure_min (NULL if not attempted);
delay_minutes = max(0, arrival - window end); on_time = arrival <= window end.

### StateEvent (`state_event`) - append-only; PK `event_id`; UNIQUE (entity_type, entity_id, sequence_no)
entity_type (`ORDER`, `DELIVERY`, `ROUTE`), entity_id, sequence_no (1..n per entity), from_state (NULL for first), to_state, event_time, reason_code (optional), actor (`SYSTEM`, `PLANNER`, `DRIVER`).
History is never updated or deleted; the entity's current status must equal its last event.

## Lifecycle states (allowed transitions)
- Order: NEW -> SCHEDULED | UNSERVED; SCHEDULED -> FULFILLED | FAILED
- Delivery: CREATED -> PLANNED | UNSERVED; PLANNED -> DISPATCHED; DISPATCHED -> ARRIVED | FAILED; ARRIVED -> DELIVERED | FAILED
- Route: PLANNED -> IN_PROGRESS -> COMPLETED

## Planning rules
1. Process each day separately. Sort deliveries by priority (1 first), then window end, then ID.
2. Insert into an existing route at the position that makes the route finish earliest, if capacity (weight, volume, stops), restrictions, hard windows and the driver shift (including return to depot) all hold.
3. Otherwise open a new route: smallest vehicle that fits (prefers 2x weight headroom), earliest driver shift where the stop is feasible, driver licence must allow the vehicle.
4. Otherwise mark UNSERVED with a reason code.

## Unserved reason codes (planner)
`INVALID_SITE_COORDINATE` (site outside region), `EXCEEDS_MAX_VEHICLE_CAPACITY`, `NO_DRIVER_AVAILABLE`, `NO_VEHICLE_AVAILABLE`, `NO_COMPATIBLE_VEHICLE` (restrictions), `NO_FEASIBLE_TIME_WINDOW`, `NO_CAPACITY_AVAILABLE`.

## Simulation rules and failure reason codes
Driver leaves 0-10 min after shift start; actual travel = planned x (0.85-1.35); service = planned x (0.8-1.4) (failed attempt max 4 min). All random numbers come from seeded streams keyed by ID.
1. Arrival after shift end -> `DRIVER_SHIFT_ENDED` (this and later stops are not attempted).
2. Arrival more than 15 min after window end and site does not accept late -> `CUSTOMER_REFUSED_LATE`.
3. Otherwise a seeded roll: 2.5% `CUSTOMER_ABSENT`, 1.5% `SITE_CLOSED`, 1.0% `ACCESS_RESTRICTED`, 0.7% `ADDRESS_NOT_FOUND`, 0.8% `DAMAGED_GOODS`, else `DELIVERED`.

## Anomaly injection and ground truth
Clean baseline first. In `output/dataset` only, labelled anomalies are added, each on its own route/site so other rows are untouched:
| issue_type | How it is injected | Count | Primary validation code |
|---|---|---:|---|
| COORDINATE_OUT_OF_REGION | site coordinate moved outside the region before planning (planner then marks its deliveries unserved) | 5 | COORD_OUT_OF_REGION |
| ROUTE_EXCEEDS_CAPACITY | route reassigned to a smaller idle vehicle | 3 | ROUTE_CAPACITY_EXCEEDED |
| DRIVER_SHIFT_EXCEEDED | driver's shift end moved 20 min before the route ends | 3 | SHIFT_EXCEEDED |
| ARRIVAL_BEFORE_PREV_DEPARTURE | stop 2 arrival set 10 min before stop 1 departure | 3 | ARRIVAL_BEFORE_PREV_DEPARTURE |
| STOP_OMITTED | last stop and its outcome removed; delivery still assigned | 3 | STOP_MISSING |
| STOP_DUPLICATED | last stop copied with a new stop ID | 3 | STOP_DUPLICATE_DELIVERY |

Also labelled (in both variants): 20 `INFEASIBLE_BY_DESIGN` deliveries (10 oversize -> `EXCEEDS_MAX_VEHICLE_CAPACITY`, 10 with a 04:00-05:00 window -> `NO_FEASIBLE_TIME_WINDOW`), with `expected_decision`.
`ground_truth.csv/json` columns: gt_id, issue_type, category, entity_type, entity_id, route_id, injection_stage, description, primary_validation_code,
expected_validation_codes (| separated, includes harmless knock-on codes), expected_decision, expected_reason_code, affected_entity_ids.

## Validation codes
See `output/*/validation_report.md` for all 37 checks. ERRORS: PK_DUPLICATE, ID_FORMAT_INVALID, FK_MISSING, ENUM_INVALID, DATE_ORDER_INVALID, ARITH_* (order total, delivery-order,
service minutes, shift minutes, outcome), ROUTE_TOTAL_MISMATCH, STOP_TIME_ARITH_MISMATCH, LIFECYCLE_*, EVENT_ORDER_INVALID, ROUTE_CAPACITY_EXCEEDED, VEHICLE_NOT_AVAILABLE,
VEHICLE_RESTRICTION_VIOLATED, LICENSE_MISMATCH, SHIFT_EXCEEDED, SHIFT_DRIVER_MISMATCH, TIME_WINDOW_VIOLATED, ARRIVAL_BEFORE_PREV_DEPARTURE, STOP_DUPLICATE_DELIVERY, STOP_MISSING,
STOP_SEQUENCE_GAP, STOP_ROUTE_MISMATCH, VEHICLE/DRIVER_DOUBLE_BOOKED, DELIVERY_COVERAGE_MISSING, REASON_CODE_INVALID, FAILED_WITHOUT_REASON, OUTCOME_MISSING, OUTCOME_ORPHAN, COORD_OUT_OF_REGION.
WARNINGS: UNSERVED_DELIVERY (a delivery was explicitly left unserved), ACTUAL_SHIFT_OVERRUN (simulated return after shift end).
