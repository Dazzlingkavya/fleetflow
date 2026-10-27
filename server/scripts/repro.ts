// Runs the generator twice with seed 20261022 into temp folders and compares row counts + checksums.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fullConfig } from "../src/config.js";
import { exportDataset } from "../src/exporter.js";
import { buildDataset } from "../src/pipeline.js";

let ok = true;
for (const anomalies of [false, true]) {
  const runs = [0, 1].map(() => { const d = mkdtempSync(join(tmpdir(), "ff-")); const r = exportDataset(buildDataset(fullConfig(anomalies)), d); rmSync(d, { recursive: true, force: true }); return r.manifest; });
  const [a, b] = runs;
  const counts = JSON.stringify(Object.values(a.tables).map((t) => t.rows)) === JSON.stringify(Object.values(b.tables).map((t) => t.rows));
  const sums = JSON.stringify(a.files) === JSON.stringify(b.files) && a.dataset_checksum === b.dataset_checksum;
  console.log(`${a.variant}: counts identical=${counts}, all ${Object.keys(a.files).length} file checksums identical=${sums}\n  run1=${a.dataset_checksum}\n  run2=${b.dataset_checksum}`);
  ok = ok && counts && sums;
}
console.log(ok ? "REPRODUCIBLE: PASS" : "REPRODUCIBLE: FAIL");
process.exit(ok ? 0 : 1);
