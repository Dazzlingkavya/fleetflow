import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fullConfig } from "../src/config.js";
import { evaluateAgainstGroundTruth } from "../src/evaluation.js";
import { generateInputs } from "../src/generator.js";
import { TABLE_COLUMNS } from "../src/types.js";
import { findingsOf, full } from "./helpers.js";

const src = (f: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", f), "utf8");

describe("edge cases (labelled anomalies)", () => {
  const ds = full(true), gt = ds.ground_truth, f = findingsOf(ds);
  const count = (k: string) => gt.filter((g) => g.issue_type === k).length;
  it("injects each of the 5 required edge cases", () => {
    expect(count("ROUTE_EXCEEDS_CAPACITY")).toBe(3); expect(count("STOP_OMITTED")).toBe(3); expect(count("STOP_DUPLICATED")).toBe(3);
    expect(count("ARRIVAL_BEFORE_PREV_DEPARTURE")).toBe(3); expect(count("DRIVER_SHIFT_EXCEEDED")).toBe(3); expect(count("COORDINATE_OUT_OF_REGION")).toBe(5);
  });
  it("the validator detects every injected anomaly with the right reason code", () => {
    const ev = evaluateAgainstGroundTruth(ds, f);
    expect(ev.injected_anomalies).toBe(20); expect(ev.detected).toBe(20); expect(ev.missed).toEqual([]);
  });
  it("anomalies never corrupt unrelated rows: no error finding is outside an anomaly's own route/site", () => {
    expect(evaluateAgainstGroundTruth(ds, f).unexplained_error_findings).toBe(0);
  });
  it("each route anomaly uses its own route (no overlap)", () => {
    const routes = gt.filter((g) => g.category === "INJECTED_ANOMALY" && g.route_id).map((g) => g.route_id);
    expect(new Set(routes).size).toBe(routes.length);
  });
  it("planner handles out-of-region sites: their deliveries are unserved with INVALID_SITE_COORDINATE", () => {
    for (const g of gt.filter((x) => x.issue_type === "COORDINATE_OUT_OF_REGION")) for (const id of g.affected_entity_ids.split("|").filter(Boolean)) { const d = ds.tables.delivery.find((x) => x.delivery_id === id)!; expect(d.status).toBe("UNSERVED"); expect(d.unserved_reason_code).toBe("INVALID_SITE_COORDINATE"); }
  });
  it("hard-by-design deliveries are unserved with the expected reason", () => {
    const ev = evaluateAgainstGroundTruth(ds, f);
    expect(ev.expected_decisions_total).toBeGreaterThanOrEqual(20); expect(ev.expected_decision_failures).toEqual([]);
  });
  it("the clean baseline contains no injected anomalies", () => {
    expect(full(false).ground_truth.every((g) => g.category === "EXPECTED_DECISION")).toBe(true);
  });
});

describe("ground truth is separate from planner input", () => {
  it("planner input has no ground-truth data or label columns", () => {
    const { input } = generateInputs(fullConfig(true));
    const text = JSON.stringify(input);
    for (const bad of ["issue_type", "ground_truth", "INFEASIBLE_BY_DESIGN", "INJECTED_ANOMALY", "expected_decision", "expected_reason_code"]) expect(text.includes(bad), bad).toBe(false);
    expect(Object.keys(input)).not.toContain("ground_truth"); expect(Object.keys(input)).not.toContain("labels");
  });
  it("no data table has a label column", () => {
    for (const cols of Object.values(TABLE_COLUMNS)) for (const c of cols) expect(/issue_type|ground_truth|is_anomaly|expected_/.test(c), c).toBe(false);
  });
  it("planner takes exactly one argument (PlannerInput) so labels cannot be passed in", async () => {
    const { plan } = await import("../src/planner.js");
    expect(plan.length).toBe(1);
  });
  it("planner, simulator and validator source code never reference ground truth", () => {
    for (const file of ["planner.ts", "simulator.ts", "validator.ts"]) { const s = src(file); expect(/ground_truth|GroundTruth|GtDraft|labels|evaluation/.test(s), file).toBe(false); }
  });
});
