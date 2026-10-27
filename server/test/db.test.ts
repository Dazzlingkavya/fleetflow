// Runs only when DATABASE_URL is set (needs a real PostgreSQL). Otherwise it is skipped - NOT counted as passed.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { seedSql } from "../src/exporter.js";
import { full } from "./helpers.js";

const url = process.env.DATABASE_URL;
describe.skipIf(!url)("PostgreSQL integration (real database)", () => {
  it("loads schema + seed for both variants and keeps counts, FKs and constraints", async () => {
    const schema = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "db", "schema.sql"), "utf8");
    const c = new pg.Client({ connectionString: url }); await c.connect();
    try {
      for (const anomalies of [false, true]) {
        const ds = full(anomalies);
        await c.query(schema); await c.query(seedSql(ds));
        const n = async (sql: string) => Number((await c.query(sql)).rows[0].n);
        expect(await n("select count(*) n from customer_site")).toBe(500); expect(await n("select count(*) n from delivery")).toBe(2000); expect(await n("select count(*) n from vehicle")).toBe(100);
        expect(await n("select count(*) n from route_stop")).toBe(ds.tables.route_stop.length);
        expect(await n("select count(*) n from state_event")).toBe(ds.tables.state_event.length);
      }
      await expect(c.query("insert into route_stop (route_stop_id,route_id,delivery_id,sequence,planned_arrival_min,planned_service_start_min,planned_departure_min,travel_minutes_from_prev,distance_km_from_prev,wait_minutes,service_minutes,load_weight_kg,load_volume_m3) values ('STOP-X-001','RTE-2026-999999','DEL-2026-000001',1,1,1,1,1,1,0,1,1,1)")).rejects.toThrow(); // FK is enforced
    } finally { await c.end(); }
  });
});
