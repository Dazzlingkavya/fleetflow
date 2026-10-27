import { useApi } from "../api";
import type { Summary } from "../types";
import Async from "./Async";
import StatCard from "./StatCard";

const fmt = (n: number) => n.toLocaleString("en-IN");
function Bars({ title, data }: { title: string; data: Record<string, number> }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]); const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <section className="panel">
      <div className="panel-head"><h2>{title}</h2><span className="tag">Calculated</span></div>
      {rows.length === 0 && <p className="muted">None.</p>}
      {rows.map(([k, v]) => (<div className="bar-row" key={k}><span>{k}</span><div className="bar"><div style={{ width: `${(v / max) * 100}%` }} /></div><strong>{v}</strong></div>))}
    </section>
  );
}
export default function Overview({ variant }: { variant: string }) {
  const s = useApi<Summary>(`/api/summary?variant=${variant}`);
  return (
    <Async state={s}>{(d) => (<>
      <div className="stats">
        <StatCard label="Deliveries" value={fmt(d.deliveries.total)} note="Calculated" />
        <StatCard label="Assigned to routes" value={fmt(d.deliveries.assigned)} note={`${d.routes.total} routes`} />
        <StatCard label="Unserved (with reason)" value={fmt(d.deliveries.unserved)} note="Calculated" />
        <StatCard label="Delivered" value={fmt(d.deliveries.delivered)} note={`${d.deliveries.success_rate_pct}% of assigned`} />
        <StatCard label="Failed" value={fmt(d.deliveries.failed)} note="Simulated outcomes" />
        <StatCard label="On-time arrivals" value={`${d.performance.on_time_pct}%`} note={`${fmt(d.performance.on_time)} of ${fmt(d.performance.attempted)}`} />
        <StatCard label="Avg weight utilization" value={`${d.routes.avg_weight_utilization_pct}%`} note={`volume ${d.routes.avg_volume_utilization_pct}%`} />
        <StatCard label="Capacity violations" value={String(d.violations.capacity)} note={d.violations.capacity ? "Needs review" : "None found"} />
        <StatCard label="Total planned distance" value={`${fmt(d.routes.total_planned_distance_km)} km`} note={`${d.routes.avg_stops_per_route} stops/route`} />
        <StatCard label="Avg vehicles used / day" value={String(d.routes.avg_vehicles_used_per_day)} note="Calculated" />
      </div>
      <div className="grid2">
        <Bars title="Unserved deliveries by reason" data={d.unserved_by_reason} />
        <Bars title="Failed deliveries by reason" data={d.failed_by_reason} />
      </div>
    </>)}</Async>
  );
}
