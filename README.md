# FleetFlow - Delivery Planning and Logistics Platform

YottaFlex AI 72-hour challenge project. It generates synthetic logistics data (seed **20261022**), plans delivery routes,
simulates deliveries, validates everything, exports CSV/JSON/SQL, and shows real results on a React dashboard.

**All data is synthetic. No real personal data is used** (see `output/*/source_manifest.json`).

## What is inside
| Folder | What it is |
|---|---|
| `client/` | Dashboard (React + Vite + TypeScript) |
| `server/src/` | Generator, planner, simulator, anomalies, validator, exporter, metrics, Express API |
| `server/db/schema.sql` | PostgreSQL schema (keys, foreign keys, checks) |
| `server/scripts/` | `generate`, `repro`, `db-load` commands |
| `server/test/` | 51 automated tests |
| `output/baseline/` | Clean data (0 validation errors) |
| `output/dataset/` | Same data + 20 labelled anomalies (the "full dataset") |
| `docs/` | Data dictionary, validation report, GitHub guide |

## 1. Install (Windows + VS Code)
1. Install **Node.js 18 or newer** (https://nodejs.org, choose LTS). Check: `node -v`.
2. Open the `fleetflow` folder in VS Code. Open a terminal: menu **Terminal > New Terminal**.
3. Run: `npm run install:all`

## 2. Run the website
```
npm run dev
```
Open **http://localhost:5173**. The first page load builds the dataset in memory (a few seconds).
The backend runs on port 4000. If the dashboard says "Server: offline", the backend did not start - read the terminal for errors.

The dashboard works **without** PostgreSQL. The API generates data in memory using the same generator.

## 3. Generate the data files
```
npm run generate
```
Creates `output/baseline/` and `output/dataset/` with: `csv/`, `json/`, `sql/schema.sql`, `sql/seed.sql`, `ground_truth/`,
`validation_report.md/.json`, `manifest.json` (row counts + SHA-256 checksums), `source_manifest.json`.
Small starter data (same code, smaller numbers): `npm run generate --prefix server -- --scale small --out ../output-small`.

## 4. PostgreSQL (optional)
1. Install PostgreSQL 14+ and create a database, for example:
   `CREATE USER fleet WITH PASSWORD 'fleet'; CREATE DATABASE fleetflow OWNER fleet;`
2. Set the connection string (Windows PowerShell): `$env:DATABASE_URL="postgres://fleet:fleet@localhost:5432/fleetflow"`
3. Load: `npm run db:load` (clean + seed data, with the full dataset). For the clean baseline: `npm run db:load --prefix server -- --variant baseline`
4. Or use the exported files directly: `psql -f output/dataset/sql/schema.sql` then `psql -f output/dataset/sql/seed.sql`.

The loader and the SQL files were tested against a real PostgreSQL 16 (see docs/FINAL_VALIDATION_REPORT.md).
The Express API does **not** read from PostgreSQL yet - it calculates from the in-memory pipeline (known limitation).

## 5. Tests and checks
```
npm test               # 51 automated tests (database test runs only if DATABASE_URL is set; otherwise it is skipped)
npm run repro          # runs the generator twice with seed 20261022 and compares row counts + checksums
npm run typecheck      # TypeScript check of server + client build
```

## How the pipeline works
1. **Generate** master data first (sites, vehicles, capacities, drivers, shifts, traffic matrices, restrictions), then orders, deliveries, time windows.
2. **Plan** (`planner.ts`): deliveries of each day are sorted by priority (1 urgent ... 4 low), then window end. Each is inserted into the existing route
   where the route finishes earliest, or a new route opens (smallest suitable vehicle, earliest feasible driver shift). Rules checked: vehicle capacity
   (weight, volume, stops, capacity valid on that date), vehicle-site restrictions, driver licence, hard time windows, service duration, driver shift
   (including return to depot), one route per vehicle/driver per day. If nothing works the delivery is **unserved with a reason code**.
3. **Simulate** (`simulator.ts`): deterministic actual travel/service times and outcomes using the written rules; every state change is appended to `state_event`.
4. **Inject anomalies** (only in `output/dataset`): 5 edge cases, each labelled in `ground_truth`.
5. **Validate** (`validator.ts`): 37 checks, errors and warnings with reason codes.
6. **Export** and show on the **dashboard**.

## Ground truth is separate
`ground_truth.csv/json` live in their own folder and are **never** passed to the planner (`plan()` accepts only `PlannerInput`),
simulator or validator. Tests check this (no label columns in data tables, no ground-truth words in planner input, source files do not reference it).
Ground truth is used only for scoring ("did the validator find every injected anomaly?").

## Troubleshooting
| Problem | Fix |
|---|---|
| `npm` is not recognized | Install Node.js, then close and reopen VS Code |
| Dashboard shows "Server: offline" | Backend not running. Run `npm run dev` from the `fleetflow` folder and read the red errors |
| Port 4000 or 5173 busy | Close the other program, or set `PORT=4001` (and change the proxy in `client/vite.config.ts`) |
| `db:load` says "Set DATABASE_URL" | Set the variable as shown in step 4 |
| `password authentication failed` | Check username/password in `DATABASE_URL` |
| PowerShell blocks scripts | Use **Command Prompt** terminal in VS Code, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |

See `docs/DATA_DICTIONARY.md` for every table and rule.
"# fleetflow" 
