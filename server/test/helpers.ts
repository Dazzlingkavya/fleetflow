import { fullConfig, smallConfig } from "../src/config.js";
import { buildDataset, type Dataset } from "../src/pipeline.js";
import { validate } from "../src/validator.js";

const cache = new Map<string, Dataset>();
export function full(anomalies: boolean): Dataset {
  const k = "full" + anomalies; if (!cache.has(k)) cache.set(k, buildDataset(fullConfig(anomalies))); return cache.get(k)!;
}
export function small(anomalies: boolean): Dataset {
  const k = "small" + anomalies; if (!cache.has(k)) cache.set(k, buildDataset(smallConfig(anomalies))); return cache.get(k)!;
}
const fc = new Map<Dataset, ReturnType<typeof validate>>();
export function findingsOf(ds: Dataset) { if (!fc.has(ds)) fc.set(ds, validate(ds.tables)); return fc.get(ds)!; }
export const by = <T>(rows: T[], key: (r: T) => string) => new Map(rows.map((r) => [key(r), r]));
