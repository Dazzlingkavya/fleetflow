import type { ReactNode } from "react";
import type { ApiState } from "../api";

// Shows "Loading", an error box, or the content.
export default function Async<T>({ state, children }: { state: ApiState<T>; children: (d: T) => ReactNode }) {
  if (state.loading) return <div className="state" role="status">Loading real results from the server... (the first request builds the dataset and can take a few seconds)</div>;
  if (state.error || !state.data) return <div className="state state-error" role="alert">Could not load data: {state.error}. Is the server running? Start it with <code>npm run dev</code> in the fleetflow folder.</div>;
  return <>{children(state.data)}</>;
}
