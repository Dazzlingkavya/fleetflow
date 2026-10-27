# Validation report - dataset (seed 20261022)

## Record counts

| Table | Rows |
|---|---:|
| customer_site | 500 |
| vehicle | 100 |
| driver | 100 |
| customer_order | 2000 |
| vehicle_capacity | 110 |
| vehicle_site_restriction | 1020 |
| shift | 2364 |
| travel_time_matrix | 12150 |
| route | 412 |
| delivery | 2000 |
| time_window | 2000 |
| route_stop | 1958 |
| delivery_outcome | 1955 |
| state_event | 17059 |

## Summary

- Errors: **34**
- Warnings: **150**
- Checks passed / failed / warning: 26 / 9 / 2 (of 37)

## Checks

| Code | Severity | Status | Violations | What it checks |
|---|---|---|---:|---|
| PK_DUPLICATE | ERROR | PASS | 0 | Primary keys are unique in every table |
| ID_FORMAT_INVALID | ERROR | PASS | 0 | IDs follow the required zero-padded formats |
| FK_MISSING | ERROR | PASS | 0 | Every foreign key points to an existing parent row (all joins valid) |
| ENUM_INVALID | ERROR | PASS | 0 | Status/type fields only use allowed values |
| DATE_ORDER_INVALID | ERROR | PASS | 0 | Dates and times are in a valid order (start before end) |
| ARITH_ORDER_TOTAL | ERROR | PASS | 0 | Order totals = items x unit values |
| ARITH_DELIVERY_ORDER | ERROR | PASS | 0 | Delivery weight/volume/site/date match the order |
| ARITH_SERVICE_MINUTES | ERROR | PASS | 0 | Service minutes follow the documented formula |
| ARITH_SHIFT_MINUTES | ERROR | PASS | 0 | Shift minutes = end - start |
| ARITH_OUTCOME | ERROR | PASS | 0 | Outcome delay/on-time values match arrival and window |
| ROUTE_TOTAL_MISMATCH | ERROR | FAIL | 6 | Route stop count/weight/volume equal the sum of its stops |
| STOP_TIME_ARITH_MISMATCH | ERROR | FAIL | 3 | Stop arrival = previous departure + travel; departure = start + service |
| LIFECYCLE_INVALID_TRANSITION | ERROR | PASS | 0 | Every state change is an allowed transition |
| LIFECYCLE_FINAL_STATE_MISMATCH | ERROR | PASS | 0 | Last event state equals the entity's current status |
| EVENT_ORDER_INVALID | ERROR | PASS | 0 | Events are append-only, numbered 1..n and not going back in time |
| ROUTE_CAPACITY_EXCEEDED | ERROR | FAIL | 5 | Route weight, volume and stop count fit the vehicle capacity |
| VEHICLE_NOT_AVAILABLE | ERROR | PASS | 0 | Vehicle is active and has a capacity row on the route date |
| VEHICLE_RESTRICTION_VIOLATED | ERROR | PASS | 0 | Vehicle is not restricted from any stop's site |
| LICENSE_MISMATCH | ERROR | PASS | 0 | Driver licence allows the vehicle |
| SHIFT_EXCEEDED | ERROR | FAIL | 3 | Route fits inside the driver's shift (including return to depot) |
| SHIFT_DRIVER_MISMATCH | ERROR | PASS | 0 | Route shift belongs to the route driver and date |
| TIME_WINDOW_VIOLATED | ERROR | PASS | 0 | Service starts inside the delivery time window |
| ARRIVAL_BEFORE_PREV_DEPARTURE | ERROR | FAIL | 3 | A stop never arrives before the previous stop departs |
| STOP_DUPLICATE_DELIVERY | ERROR | FAIL | 3 | A delivery appears at most once in a route |
| STOP_MISSING | ERROR | FAIL | 3 | Every delivery assigned to a route has a stop in that route |
| STOP_SEQUENCE_GAP | ERROR | PASS | 0 | Stop sequence numbers are exactly 1..n |
| STOP_ROUTE_MISMATCH | ERROR | PASS | 0 | A stop's delivery is assigned to the stop's route |
| VEHICLE_DOUBLE_BOOKED | ERROR | PASS | 0 | A vehicle has at most one route per day |
| DRIVER_DOUBLE_BOOKED | ERROR | PASS | 0 | A driver has at most one route per day |
| DELIVERY_COVERAGE_MISSING | ERROR | PASS | 0 | Every delivery is assigned to a route OR explicitly unserved with a reason |
| REASON_CODE_INVALID | ERROR | PASS | 0 | Unserved/failure reason codes are in the allowed list |
| FAILED_WITHOUT_REASON | ERROR | PASS | 0 | Failed outcomes have a reason; delivered outcomes have none |
| OUTCOME_MISSING | ERROR | FAIL | 3 | Delivered/failed deliveries have an outcome row |
| OUTCOME_ORPHAN | ERROR | PASS | 0 | Outcomes match their delivery and stop (none for unserved deliveries) |
| COORD_OUT_OF_REGION | ERROR | FAIL | 5 | Customer site coordinates are inside the defined region |
| UNSERVED_DELIVERY | WARNING | WARN | 42 | Delivery was explicitly left unserved (reason code given) |
| ACTUAL_SHIFT_OVERRUN | WARNING | WARN | 108 | Simulated route returned to depot after the shift end |

## Comparison with ground truth (scoring only - the planner never sees ground truth)

- Injected anomalies: 20, detected by validator: 20
- Error findings NOT explained by any injected anomaly: 0
- Expected planner decisions (unserved + reason): 42 of 42 matched
