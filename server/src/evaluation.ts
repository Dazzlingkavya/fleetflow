// Compares validator/planner results with the ground truth. Ground truth is used HERE (scoring) only.
import type { Dataset } from "./pipeline.js";
import type { Finding } from "./validator.js";

export function evaluateAgainstGroundTruth(ds: Dataset, findings: Finding[]) {
  const gt = ds.ground_truth;
  const anomalies = gt.filter((g) => g.category === "INJECTED_ANOMALY");
  const missed: string[] = [];
  let detected = 0;
  for (const g of anomalies) {
    const hit = findings.some((f) => f.code === g.primary_validation_code && (g.route_id ? f.route_id === g.route_id : f.entity_id === g.entity_id));
    if (hit) detected++; else missed.push(g.gt_id);
  }
  const explained = (f: Finding) => anomalies.some((g) => g.expected_validation_codes.split("|").includes(f.code) && (g.route_id ? f.route_id === g.route_id : f.entity_id === g.entity_id));
  const unexplained = findings.filter((f) => f.severity === "ERROR" && !explained(f));
  const del = new Map(ds.tables.delivery.map((d) => [d.delivery_id, d]));
  let decisionsOk = 0, decisionsTotal = 0;
  const decisionFailures: string[] = [];
  for (const g of gt.filter((x) => x.expected_decision === "UNSERVED")) {
    for (const id of g.affected_entity_ids.split("|").filter(Boolean)) {
      decisionsTotal++;
      const d = del.get(id);
      if (d && d.status === "UNSERVED" && d.unserved_reason_code === g.expected_reason_code) decisionsOk++; else decisionFailures.push(id);
    }
  }
  return {
    injected_anomalies: anomalies.length, detected, missed, unexplained_error_findings: unexplained.length,
    expected_decisions_total: decisionsTotal, expected_decisions_matched: decisionsOk, expected_decision_failures: decisionFailures,
  };
}
