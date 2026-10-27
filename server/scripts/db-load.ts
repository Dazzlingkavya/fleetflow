// Usage: DATABASE_URL=postgres://user:pass@localhost:5432/fleetflow npm run db:load [-- --variant dataset|baseline]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { fullConfig } from "../src/config.js";
import { seedSql } from "../src/exporter.js";
import { buildDataset } from "../src/pipeline.js";

const url = process.env.DATABASE_URL;
if (!url) { console.error("Set DATABASE_URL first (see server/.env.example)."); process.exit(1); }
const i = process.argv.indexOf("--variant");
const variant = i >= 0 ? process.argv[i + 1] : "dataset";
const schema = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "db", "schema.sql"), "utf8");
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(schema);
  await client.query(seedSql(buildDataset(fullConfig(variant === "dataset"))));
  const r = await client.query("SELECT (SELECT count(*) FROM customer_site) sites, (SELECT count(*) FROM delivery) deliveries, (SELECT count(*) FROM vehicle) vehicles, (SELECT count(*) FROM route_stop) stops");
  console.log("Loaded into PostgreSQL:", r.rows[0]);
} finally { await client.end(); }
