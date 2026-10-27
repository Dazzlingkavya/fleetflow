import { useState } from "react";
import { useApi } from "../api";
import type { Finding } from "../types";
import Async from "./Async";

export default function ExceptionsPanel({ variant }: { variant: string }) {
  const [limit, setLimit] = useState(30);
  const s = useApi<Finding[]>(`/api/exceptions?variant=${variant}`);
  return (
    <section className="panel">
      <div className="panel-head"><h2>Exceptions</h2><span className="tag">Real validator findings</span></div>
      <Async state={s}>{(rows) => (<>
        <p className="muted">{rows.filter((r) => r.severity === "ERROR").length} errors and {rows.filter((r) => r.severity === "WARNING").length} warnings. Errors are listed first.</p>
        {rows.length === 0 && <p>No exceptions found.</p>}
        <ul className="exceptions">{rows.slice(0, limit).map((e, i) => (
          <li key={i} className={`exception ${e.severity === "ERROR" ? "sev-high" : "sev-low"}`}>
            <div className="exception-top"><strong>{e.code}</strong><span className="exception-meta">{e.severity} - {e.entity_type} {e.entity_id}{e.route_id ? ` (route ${e.route_id})` : ""}</span></div>
            <p>{e.message}</p></li>))}</ul>
        {limit < rows.length && <button className="btn" onClick={() => setLimit(limit + 50)}>Show more</button>}
      </>)}</Async>
    </section>
  );
}
