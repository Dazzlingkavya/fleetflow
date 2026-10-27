import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fullConfig } from "../src/config.js";
import { exportDataset } from "../src/exporter.js";
import { buildDataset } from "../src/pipeline.js";

const run = (seed?: number, anomalies = true) => { const d = mkdtempSync(join(tmpdir(), "ffr-")); const r = exportDataset(buildDataset(fullConfig(anomalies, seed)), d); rmSync(d, { recursive: true, force: true }); return r.manifest; };
describe("reproducibility (seed 20261022)", () => {
  it("two runs give identical row counts and identical checksums for every file", () => {
    for (const anomalies of [false, true]) {
      const a = run(undefined, anomalies), b = run(undefined, anomalies);
      expect(Object.values(a.tables).map((t) => t.rows)).toEqual(Object.values(b.tables).map((t) => t.rows));
      expect(a.files).toEqual(b.files); expect(a.dataset_checksum).toBe(b.dataset_checksum);
    }
  });
  it("a different seed gives a different checksum", () => { expect(run(7).dataset_checksum).not.toBe(run().dataset_checksum); });
  it("distance and time metrics are reproducible (same routes, distances and times)", () => {
    const a = buildDataset(fullConfig(false)).tables.route, b = buildDataset(fullConfig(false)).tables.route;
    expect(a.map((r) => [r.planned_distance_km, r.planned_end_min])).toEqual(b.map((r) => [r.planned_distance_km, r.planned_end_min]));
  });
});
