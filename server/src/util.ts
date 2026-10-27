// Small helpers used everywhere.
export const pad = (n: number, w: number) => String(n).padStart(w, "0");
export const round = (x: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round((x + Number.EPSILON) * f) / f;
};
export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// date + minutes-after-midnight -> "YYYY-MM-DDTHH:MM:SS" (local time, no timezone)
export function isoAt(date: string, min: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCMinutes(d.getUTCMinutes() + min);
  return d.toISOString().slice(0, 19);
}
export function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const a = m.get(k);
    if (a) a.push(r);
    else m.set(k, [r]);
  }
  return m;
}
