import { Fragment, useState } from "react";
import { hhmm, useApi } from "../api";
import type { RouteRow, StopRow } from "../types";
import Async from "./Async";

function statusClass(r: RouteRow) { return r.error_count ? "pill pill-bad" : "pill pill-good"; }
function Stops({ id, variant }: { id: string; variant: string }) {
  const s = useApi<{ stops: StopRow[] }>(`/api/routes/${id}/stops?variant=${variant}`);
  return (
    <Async state={s}>{(d) => (
      <div className="table-wrap"><table>
        <thead><tr><th>#</th><th>Delivery</th><th>Site</th><th>Window</th><th>Arrive</th><th>Service</th><th>Leave</th><th className="num">kg</th><th>Outcome</th></tr></thead>
        <tbody>{d.stops.map((x) => (<tr key={x.route_stop_id}><td>{x.sequence}</td><td>{x.delivery_id}</td><td>{x.site_name}</td><td>{hhmm(x.window_start_min)}-{hhmm(x.window_end_min)}</td><td>{hhmm(x.planned_arrival_min)}</td><td>{hhmm(x.planned_service_start_min)}</td><td>{hhmm(x.planned_departure_min)}</td><td className="num">{x.load_weight_kg}</td><td>{x.outcome ? <span className={x.outcome === "DELIVERED" ? "pill pill-good" : "pill pill-bad"}>{x.failure_reason_code ?? x.outcome}</span> : "-"}</td></tr>))}</tbody>
      </table></div>
    )}</Async>
  );
}
export default function RoutesTable({ variant }: { variant: string }) {
  const [issues, setIssues] = useState(false), [open, setOpen] = useState<string | null>(null), [limit, setLimit] = useState(50);
  const s = useApi<RouteRow[]>(`/api/routes?variant=${variant}${issues ? "&issues=1" : ""}`);
  return (
    <section className="panel">
      <div className="panel-head"><h2>Routes</h2><label className="check"><input type="checkbox" checked={issues} onChange={(e) => setIssues(e.target.checked)} /> Only routes with validation errors</label></div>
      <Async state={s}>{(rows) => (<>
        <p className="muted">Showing {Math.min(limit, rows.length)} of {rows.length} routes. Click a row to see its ordered stops.</p>
        <div className="table-wrap"><table>
          <thead><tr><th>Route</th><th>Date</th><th>Driver</th><th>Vehicle</th><th className="num">Stops</th><th className="num">Distance</th><th>Load</th><th>Time</th><th>Result</th><th>Check</th></tr></thead>
          <tbody>{rows.slice(0, limit).map((r) => (<Fragment key={r.route_id}>
            <tr className="click" onClick={() => setOpen(open === r.route_id ? null : r.route_id)}>
              <td className="strong">{r.route_id}</td><td>{r.route_date}</td><td>{r.driver_name}</td><td>{r.vehicle_id} <span className="muted">{r.vehicle_type}</span></td>
              <td className="num">{r.stops}</td><td className="num">{r.distance_km} km</td>
              <td><div className="load"><div className="load-bar" style={{ width: `${Math.min(100, r.utilization_pct ?? 0)}%`, background: (r.utilization_pct ?? 0) > 100 ? "#f0b4a8" : undefined }} /><span>{r.utilization_pct ?? "-"}%</span></div></td>
              <td>{hhmm(r.start_min)}-{hhmm(r.end_min)}</td><td>{r.delivered} ok / {r.failed} failed</td>
              <td><span className={statusClass(r)}>{r.error_count ? `${r.error_count} error(s)` : "Valid"}</span></td>
            </tr>
            {open === r.route_id && <tr><td colSpan={10}><Stops id={r.route_id} variant={variant} /></td></tr>}
          </Fragment>))}</tbody>
        </table></div>
        {limit < rows.length && <button className="btn" onClick={() => setLimit(limit + 100)}>Show more</button>}
      </>)}</Async>
    </section>
  );
}
