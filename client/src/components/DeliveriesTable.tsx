import { useState } from "react";
import { useApi } from "../api";
import type { DeliveryRow } from "../types";
import Async from "./Async";

const STATUSES = ["", "DELIVERED", "FAILED", "UNSERVED"];
export default function DeliveriesTable({ variant }: { variant: string }) {
  const [status, setStatus] = useState(""), [limit, setLimit] = useState(100);
  const s = useApi<DeliveryRow[]>(`/api/deliveries?variant=${variant}${status ? `&status=${status}` : ""}`);
  return (
    <section className="panel">
      <div className="panel-head"><h2>Deliveries</h2>
        <label className="check">Status: <select value={status} onChange={(e) => { setStatus(e.target.value); setLimit(100); }}>{STATUSES.map((x) => <option key={x} value={x}>{x || "All"}</option>)}</select></label></div>
      <Async state={s}>{(rows) => (<>
        <p className="muted">Showing {Math.min(limit, rows.length)} of {rows.length} deliveries.</p>
        <div className="table-wrap"><table>
          <thead><tr><th>Delivery</th><th>Date</th><th>Site</th><th>Priority</th><th className="num">kg</th><th>Status</th><th>Route</th><th>Reason</th></tr></thead>
          <tbody>{rows.slice(0, limit).map((d) => (<tr key={d.delivery_id}><td className="strong">{d.delivery_id}</td><td>{d.delivery_date}</td><td>{d.site_id}</td><td>{d.priority}</td><td className="num">{d.weight_kg}</td>
            <td><span className={d.status === "DELIVERED" ? "pill pill-good" : d.status === "FAILED" ? "pill pill-bad" : "pill pill-warn"}>{d.status}</span></td><td>{d.route_id ?? "-"}</td><td>{d.reason ?? "-"}</td></tr>))}</tbody>
        </table></div>
        {limit < rows.length && <button className="btn" onClick={() => setLimit(limit + 200)}>Show more</button>}
      </>)}</Async>
    </section>
  );
}
