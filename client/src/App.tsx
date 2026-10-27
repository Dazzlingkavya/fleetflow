import { useState } from "react";
import { useApi } from "./api";
import DeliveriesTable from "./components/DeliveriesTable";
import ExceptionsPanel from "./components/ExceptionsPanel";
import Overview from "./components/Overview";
import RoutesTable from "./components/RoutesTable";
import ValidationView from "./components/ValidationView";

const TABS = ["Overview", "Routes", "Deliveries", "Exceptions", "Validation"] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [variant, setVariant] = useState("dataset");
  const health = useApi<{ ok: boolean }>("/api/health"); // real check: is the Express server running?
  const server = health.loading ? "checking..." : health.data?.ok ? "online" : "offline";
  return (
    <div className="app">
      <header className="top">
        <div><h1>FleetFlow</h1><p className="tagline">Plan deliveries. Keep routes on time.</p></div>
        <div className="top-right">
          <label className="check">Data: <select value={variant} onChange={(e) => setVariant(e.target.value)}>
            <option value="dataset">With labelled anomalies (full dataset)</option><option value="baseline">Clean baseline</option></select></label>
          <div className={`server server-${health.loading ? "checking" : health.data?.ok ? "online" : "offline"}`}>Server: {server}</div>
        </div>
      </header>
      <div className="notice"><span className="tag">Synthetic data</span><span>All numbers are calculated by the backend from generated data (seed 20261022). No real personal data is used.</span></div>
      <nav className="tabs">{TABS.map((t) => <button key={t} className={t === tab ? "tab active" : "tab"} onClick={() => setTab(t)}>{t}</button>)}</nav>
      {tab === "Overview" && <Overview variant={variant} />}
      {tab === "Routes" && <RoutesTable variant={variant} />}
      {tab === "Deliveries" && <DeliveriesTable variant={variant} />}
      {tab === "Exceptions" && <ExceptionsPanel variant={variant} />}
      {tab === "Validation" && <ValidationView variant={variant} />}
    </div>
  );
}
