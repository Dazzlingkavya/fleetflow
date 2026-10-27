import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { exportDataset, sha256 } from "../src/exporter.js";
import { TABLE_COLUMNS, TABLE_ORDER } from "../src/types.js";
import { full, small } from "./helpers.js";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));
describe("exports (CSV, JSON, SQL, manifests)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ffx-")); dirs.push(dir);
  const ds = full(true);
  const { manifest, report } = exportDataset(ds, dir);
  it("writes CSV, JSON and SQL for every table with matching row counts", () => {
    for (const n of TABLE_ORDER) {
      const csv = readFileSync(join(dir, "csv", n + ".csv"), "utf8").trimEnd().split("\n");
      expect(csv[0]).toBe(TABLE_COLUMNS[n].join(","));
      const json = JSON.parse(readFileSync(join(dir, "json", n + ".json"), "utf8"));
      expect(json).toHaveLength(ds.tables[n].length);
      expect(manifest.tables[n].rows).toBe(ds.tables[n].length);
    }
    expect(readFileSync(join(dir, "csv", "delivery.csv"), "utf8").trimEnd().split("\n")).toHaveLength(2001);
    const sql = readFileSync(join(dir, "sql", "seed.sql"), "utf8");
    expect(sql).toContain("BEGIN;"); expect(sql).toContain("COMMIT;"); expect(sql).toContain("INSERT INTO route_stop");
    expect(existsSync(join(dir, "sql", "schema.sql"))).toBe(true);
  });
  it("writes ground truth to its own folder, never inside the data tables", () => {
    expect(existsSync(join(dir, "ground_truth", "ground_truth.csv"))).toBe(true); expect(existsSync(join(dir, "ground_truth", "ground_truth.json"))).toBe(true);
    for (const n of TABLE_ORDER) expect(/issue_type|INJECTED_ANOMALY/.test(readFileSync(join(dir, "csv", n + ".csv"), "utf8")), n).toBe(false);
    expect(readFileSync(join(dir, "ground_truth", "ground_truth.csv"), "utf8").split("\n")[0]).toContain("issue_type");
  });
  it("manifest checksums match the files on disk and the source manifest says synthetic/no personal data", () => {
    for (const [name, h] of Object.entries(manifest.files)) expect(sha256(readFileSync(join(dir, name), "utf8"))).toBe(h.sha256);
    const src = JSON.parse(readFileSync(join(dir, "source_manifest.json"), "utf8"));
    expect(src.data_origin).toMatch(/synthetic/i); expect(src.personal_data).toMatch(/NONE/);
  });
  it("validation report lists record counts, checks, warnings and failures", () => {
    expect(report.record_counts.delivery).toBe(2000); expect(report.checks.length).toBeGreaterThan(30);
    expect(report.summary.errors).toBeGreaterThan(0); expect(report.summary.warnings).toBeGreaterThan(0);
    expect(readFileSync(join(dir, "validation_report.md"), "utf8")).toContain("Comparison with ground truth");
  });
  it("small-scale export works with the same code", () => {
    const d2 = mkdtempSync(join(tmpdir(), "ffs-")); dirs.push(d2);
    expect(exportDataset(small(true), d2).manifest.tables.delivery.rows).toBe(80);
  });
});
