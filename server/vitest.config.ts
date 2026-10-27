import { defineConfig } from "vitest/config";
// Build each dataset once and share it between test files (faster).
export default defineConfig({ test: { testTimeout: 120000, hookTimeout: 120000, pool: "forks", poolOptions: { forks: { singleFork: true } }, isolate: false } });
