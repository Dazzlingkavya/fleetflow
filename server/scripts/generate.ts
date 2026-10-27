// Usage: npm run generate [-- --scale small|full --out ../output]
import { join, resolve } from "node:path";
import { fullConfig, smallConfig } from "../src/config.js";
import { exportDataset } from "../src/exporter.js";
import { buildDataset } from "../src/pipeline.js";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const scale = arg("scale", "full"), out = resolve(arg("out", "../output"));
for (const anomalies of [false, true]) {
  const cfg = (scale === "small" ? smallConfig : fullConfig)(anomalies);
  const ds = buildDataset(cfg);
  const dir = join(out, ds.variant);
  const { manifest, report } = exportDataset(ds, dir);
  console.log(`[${ds.variant}] ${dir}\n  deliveries=${manifest.tables.delivery.rows} routes=${manifest.tables.route.rows} stops=${manifest.tables.route_stop.rows}` +
    `\n  errors=${report.summary.errors} warnings=${report.summary.warnings} checksum=${manifest.dataset_checksum}`);
}
