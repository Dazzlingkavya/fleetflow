import { useEffect, useState } from "react";

export interface ApiState<T> { data: T | null; loading: boolean; error: string | null; }
// Loads JSON from our backend. Shows loading and error states to the screen.
export function useApi<T>(url: string): ApiState<T> {
  const [s, setS] = useState<ApiState<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    const ctl = new AbortController();
    setS({ data: null, loading: true, error: null });
    fetch(url, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Server answered ${r.status}`))))
      .then((data) => setS({ data, loading: false, error: null }))
      .catch((e) => { if (e.name !== "AbortError") setS({ data: null, loading: false, error: e.message || "Could not reach the server" }); });
    return () => ctl.abort();
  }, [url]);
  return s;
}
export const hhmm = (m: number | null | undefined) => (m === null || m === undefined ? "-" : `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
