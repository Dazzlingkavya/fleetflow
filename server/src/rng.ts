// Deterministic random numbers. Same seed + same stream name = same numbers, always.
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class Rng {
  private next: () => number;
  constructor(seed: number, stream: string) {
    this.next = mulberry32(hashString(`${seed}:${stream}`));
  }
  float() { return this.next(); }
  int(lo: number, hi: number) { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  chance(p: number) { return this.next() < p; }
  pick<T>(a: readonly T[]): T { return a[this.int(0, a.length - 1)]; }
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((x, y) => x + y, 0);
    let r = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  }
  distinct(n: number, count: number, exclude: Set<number> = new Set()): number[] {
    const out: number[] = [];
    let guard = 0;
    while (out.length < Math.min(count, n - exclude.size) && guard++ < 100000) {
      const i = this.int(0, n - 1);
      if (!exclude.has(i) && !out.includes(i)) out.push(i);
    }
    return out.sort((a, b) => a - b);
  }
}
