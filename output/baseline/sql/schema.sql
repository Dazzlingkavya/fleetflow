-- FleetFlow PostgreSQL schema. Load order = parents first. Business-rule checks (capacity, shifts, time windows,
-- region bounds, duplicate stops) are done by the validator, so deliberately labelled anomalies can still be stored.
DROP TABLE IF EXISTS state_event, delivery_outcome, route_stop, time_window, delivery, route, travel_time_matrix, shift,
  vehicle_site_restriction, vehicle_capacity, customer_order, driver, vehicle, customer_site CASCADE;

CREATE TABLE customer_site (
  site_id VARCHAR(11) PRIMARY KEY, site_name TEXT NOT NULL,
  latitude NUMERIC(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  zone_id VARCHAR(5) NOT NULL, access_class TEXT NOT NULL CHECK (access_class IN ('STANDARD','NARROW_STREET')),
  accepts_late BOOLEAN NOT NULL, status TEXT NOT NULL CHECK (status IN ('ACTIVE','INACTIVE')),
  effective_from DATE NOT NULL, effective_to DATE, CHECK (effective_to IS NULL OR effective_to >= effective_from));

CREATE TABLE vehicle (
  vehicle_id VARCHAR(10) PRIMARY KEY, registration_no TEXT NOT NULL UNIQUE,
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('VAN_SMALL','VAN_LARGE','TRUCK')),
  required_license CHAR(1) NOT NULL CHECK (required_license IN ('B','C')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','IN_MAINTENANCE')),
  effective_from DATE NOT NULL, effective_to DATE, CHECK (effective_to IS NULL OR effective_to >= effective_from));

CREATE TABLE driver (
  driver_id VARCHAR(10) PRIMARY KEY, driver_name TEXT NOT NULL,
  license_class CHAR(1) NOT NULL CHECK (license_class IN ('B','C')), status TEXT NOT NULL CHECK (status IN ('ACTIVE','INACTIVE')));

CREATE TABLE customer_order (
  order_id VARCHAR(15) PRIMARY KEY, site_id VARCHAR(11) NOT NULL REFERENCES customer_site(site_id),
  order_date DATE NOT NULL, requested_date DATE NOT NULL CHECK (requested_date > order_date),
  priority SMALLINT NOT NULL CHECK (priority BETWEEN 1 AND 4), item_count INTEGER NOT NULL CHECK (item_count > 0),
  unit_weight_kg NUMERIC(8,2) NOT NULL CHECK (unit_weight_kg > 0), unit_volume_m3 NUMERIC(8,3) NOT NULL CHECK (unit_volume_m3 > 0),
  total_weight_kg NUMERIC(10,2) NOT NULL CHECK (total_weight_kg > 0), total_volume_m3 NUMERIC(10,3) NOT NULL CHECK (total_volume_m3 > 0),
  status TEXT NOT NULL CHECK (status IN ('NEW','SCHEDULED','FULFILLED','FAILED','UNSERVED')));

CREATE TABLE vehicle_capacity (
  capacity_id VARCHAR(11) PRIMARY KEY, vehicle_id VARCHAR(10) NOT NULL REFERENCES vehicle(vehicle_id),
  max_weight_kg NUMERIC(10,2) NOT NULL CHECK (max_weight_kg > 0), max_volume_m3 NUMERIC(10,3) NOT NULL CHECK (max_volume_m3 > 0),
  max_stops INTEGER NOT NULL CHECK (max_stops > 0), effective_from DATE NOT NULL, effective_to DATE,
  CHECK (effective_to IS NULL OR effective_to >= effective_from), UNIQUE (vehicle_id, effective_from));

CREATE TABLE vehicle_site_restriction ( -- bridge table: many vehicles <-> many sites
  restriction_id VARCHAR(12) PRIMARY KEY, vehicle_id VARCHAR(10) NOT NULL REFERENCES vehicle(vehicle_id),
  site_id VARCHAR(11) NOT NULL REFERENCES customer_site(site_id), reason TEXT NOT NULL, effective_from DATE NOT NULL,
  UNIQUE (vehicle_id, site_id));

CREATE TABLE shift (
  shift_id VARCHAR(10) PRIMARY KEY, driver_id VARCHAR(10) NOT NULL REFERENCES driver(driver_id), shift_date DATE NOT NULL,
  shift_type TEXT NOT NULL CHECK (shift_type IN ('EARLY','DAY','LATE')), start_min INTEGER NOT NULL, end_min INTEGER NOT NULL CHECK (end_min > start_min),
  shift_minutes INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('SCHEDULED','COMPLETED','CANCELLED')), UNIQUE (driver_id, shift_date));

CREATE TABLE travel_time_matrix (
  matrix_id VARCHAR(10) PRIMARY KEY, scenario_date DATE NOT NULL, scenario_type TEXT NOT NULL CHECK (scenario_type IN ('NORMAL','RAIN','FESTIVAL','ROADWORK')),
  time_band TEXT NOT NULL CHECK (time_band IN ('EARLY','AM_PEAK','MIDDAY','PM_PEAK','EVENING')),
  from_zone VARCHAR(5) NOT NULL, to_zone VARCHAR(5) NOT NULL, traffic_multiplier NUMERIC(6,3) NOT NULL CHECK (traffic_multiplier > 0),
  UNIQUE (scenario_date, time_band, from_zone, to_zone));

CREATE TABLE route (
  route_id VARCHAR(15) PRIMARY KEY, route_date DATE NOT NULL, vehicle_id VARCHAR(10) NOT NULL REFERENCES vehicle(vehicle_id),
  driver_id VARCHAR(10) NOT NULL REFERENCES driver(driver_id), shift_id VARCHAR(10) NOT NULL REFERENCES shift(shift_id),
  status TEXT NOT NULL CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED')),
  planned_start_min INTEGER NOT NULL, planned_return_minutes INTEGER NOT NULL, planned_end_min INTEGER NOT NULL,
  planned_stop_count INTEGER NOT NULL CHECK (planned_stop_count >= 0), planned_total_weight_kg NUMERIC(10,2) NOT NULL, planned_total_volume_m3 NUMERIC(10,3) NOT NULL,
  planned_distance_km NUMERIC(10,2) NOT NULL, planned_travel_minutes INTEGER NOT NULL, planned_service_minutes INTEGER NOT NULL,
  actual_start_min INTEGER, actual_end_min INTEGER);

CREATE TABLE delivery (
  delivery_id VARCHAR(15) PRIMARY KEY, order_id VARCHAR(15) NOT NULL REFERENCES customer_order(order_id), site_id VARCHAR(11) NOT NULL REFERENCES customer_site(site_id),
  delivery_date DATE NOT NULL, weight_kg NUMERIC(10,2) NOT NULL, volume_m3 NUMERIC(10,3) NOT NULL, service_minutes INTEGER NOT NULL CHECK (service_minutes > 0),
  status TEXT NOT NULL CHECK (status IN ('CREATED','PLANNED','DISPATCHED','ARRIVED','DELIVERED','FAILED','UNSERVED')),
  assigned_route_id VARCHAR(15) REFERENCES route(route_id) DEFERRABLE INITIALLY DEFERRED, unserved_reason_code TEXT,
  CHECK ((status = 'UNSERVED') = (assigned_route_id IS NULL)), CHECK (status <> 'UNSERVED' OR unserved_reason_code IS NOT NULL));

CREATE TABLE time_window (
  window_id VARCHAR(10) PRIMARY KEY, delivery_id VARCHAR(15) NOT NULL UNIQUE REFERENCES delivery(delivery_id),
  window_start_min INTEGER NOT NULL, window_end_min INTEGER NOT NULL CHECK (window_end_min > window_start_min), window_type TEXT NOT NULL CHECK (window_type IN ('HARD')));

CREATE TABLE route_stop (
  route_stop_id VARCHAR(30) PRIMARY KEY, route_id VARCHAR(15) NOT NULL REFERENCES route(route_id), delivery_id VARCHAR(15) NOT NULL REFERENCES delivery(delivery_id),
  sequence INTEGER NOT NULL CHECK (sequence > 0), planned_arrival_min INTEGER NOT NULL, planned_service_start_min INTEGER NOT NULL, planned_departure_min INTEGER NOT NULL,
  travel_minutes_from_prev INTEGER NOT NULL, distance_km_from_prev NUMERIC(8,2) NOT NULL, wait_minutes INTEGER NOT NULL, service_minutes INTEGER NOT NULL,
  load_weight_kg NUMERIC(10,2) NOT NULL, load_volume_m3 NUMERIC(10,3) NOT NULL, UNIQUE (route_id, sequence),
  CHECK (planned_arrival_min <= planned_service_start_min AND planned_service_start_min <= planned_departure_min));

CREATE TABLE delivery_outcome (
  outcome_id VARCHAR(15) PRIMARY KEY, delivery_id VARCHAR(15) NOT NULL UNIQUE REFERENCES delivery(delivery_id), route_stop_id VARCHAR(30) NOT NULL REFERENCES route_stop(route_stop_id),
  outcome_status TEXT NOT NULL CHECK (outcome_status IN ('DELIVERED','FAILED')), failure_reason_code TEXT,
  actual_arrival_min INTEGER, actual_service_start_min INTEGER, actual_departure_min INTEGER, delay_minutes INTEGER, on_time BOOLEAN,
  CHECK ((outcome_status = 'FAILED') = (failure_reason_code IS NOT NULL)));

CREATE TABLE state_event ( -- append-only history; entity_id points to an order, delivery or route (polymorphic, checked by the validator)
  event_id VARCHAR(11) PRIMARY KEY, entity_type TEXT NOT NULL CHECK (entity_type IN ('ORDER','DELIVERY','ROUTE')), entity_id VARCHAR(15) NOT NULL,
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0), from_state TEXT, to_state TEXT NOT NULL, event_time TIMESTAMP NOT NULL, reason_code TEXT, actor TEXT NOT NULL,
  UNIQUE (entity_type, entity_id, sequence_no));
CREATE INDEX idx_route_date ON route(route_date);
CREATE INDEX idx_stop_route ON route_stop(route_id);
CREATE INDEX idx_event_entity ON state_event(entity_type, entity_id);
