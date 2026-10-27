import { useApi } from "../api";
import type { Validation } from "../types";
import Async from "./Async";

export default function ValidationView({ variant }: { variant: string }) {
  const s = useApi<Validation>(`/api/validation?variant=${variant}`);
  return (
    <Async state={s}>{(v) => (<>
      <div className="stats">
        <div className="stat"><div className="stat-label">Checks passed</div><div className="stat-value">{v.summary.checks_passed}/{v.summary.checks_total}</div></div>
        <div className="stat"><div className="stat-label">Errors</div><div className="stat-value">{v.summary.errors}</div></div>
        <div className="stat"><div className="stat-label">Warnings</div><div className="stat-value">{v.summary.warnings}</div></div>
        <div className="stat"><div className="stat-label">Anomalies detected</div><div className="stat-value">{v.ground_truth_evaluation.detected}/{v.ground_truth_evaluation.injected_anomalies}</div><span className="tag">Scored against ground truth</span></div>
      </div>
      <section className="panel"><div className="panel-head"><h2>Checks</h2></div>
        <div className="table-wrap"><table><thead><tr><th>Status</th><th>Code</th><th>What it checks</th><th className="num">Violations</th></tr></thead>
          <tbody>{v.checks.map((c) => (<tr key={c.code}><td><span className={c.status === "PASS" ? "pill pill-good" : c.status === "WARN" ? "pill pill-warn" : "pill pill-bad"}>{c.status}</span></td><td className="strong">{c.code}</td><td>{c.description}</td><td className="num">{c.violations}</td></tr>))}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><h2>Record counts</h2></div>
        <div className="table-wrap"><table><tbody>{Object.entries(v.record_counts).map(([k, n]) => (<tr key={k}><td>{k}</td><td className="num">{n.toLocaleString("en-IN")}</td></tr>))}</tbody></table></div></section>
    </>)}</Async>
  );
}
