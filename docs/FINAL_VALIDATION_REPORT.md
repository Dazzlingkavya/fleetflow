# FleetFlow - Final Validation Report

Everything below was actually run in the build workspace (Linux, Node 22, PostgreSQL 16). Seed: **20261022**.

## 1. Test results
| Check | Command | Result |
|---|---|---|
| Server TypeScript check | `npm run typecheck --prefix server` | PASS |
| Client TypeScript check + production build | `npm run build --prefix client` | PASS |
| Automated tests (9 files) | `npm test` with `DATABASE_URL` set | **51 passed, 0 failed, 0 skipped** |
| Same tests without a database | `npm test` | 50 passed, 1 skipped (the PostgreSQL test is skipped, not passed) |
| Repeat-run check | `npm run repro` | **PASS** - both variants: identical row counts and identical SHA-256 for all 34 files in each run |
| Real PostgreSQL 16 load | `db:load` for both variants, and `psql -f schema.sql`, `psql -f seed.sql` | PASS - all FKs, CHECKs and UNIQUEs accepted the data |
| API smoke test on a running server | `GET /api/health`, `/api/summary` | PASS (real numbers returned) |

Test coverage: deterministic generation, required counts, ID formats, PK uniqueness, FK integrity and joins, planning constraints
(capacity, restrictions, licences, shifts, time windows, service durations, one route per vehicle/driver/day), priority handling, unserved handling,
simulation lifecycle and append-only history, failure reason codes, edge-case coverage and detection, ground-truth isolation, exports and manifests,
reproducibility, dashboard API results, PostgreSQL integration.

## 2. Reproducibility (seed 20261022, run twice)
| Variant | Dataset checksum (both runs identical) |
|---|---|
| baseline | `5e0123f0243aaaa37e63d51d3bf5ff6384ad8e7842786f520fb740084560ef85` |
| dataset (with anomalies) | `74c5d5976aafaedbaf07ed55253c0eaf9ec681755153648e1434ea48b6c308d1` |

## 3. Record counts
| Table | baseline | dataset |
|---|---:|---:|
| customer_site | 500 | 500 |
| delivery / order / time_window | 2,000 each | 2,000 each |
| vehicle / driver | 100 / 100 | 100 / 100 |
| vehicle_capacity | 110 | 110 |
| vehicle_site_restriction | 1,020 | 1,020 |
| shift | 2,364 | 2,364 |
| travel_time_matrix (30 days x 5 bands x 81 zone pairs) | 12,150 | 12,150 |
| route | 418 | 412 |
| route_stop | 1,980 | 1,958 |
| delivery_outcome | 1,980 | 1,955 |
| state_event | 17,164 | 17,059 |

## 4. Validation results (37 checks)
| | baseline | dataset |
|---|---:|---:|
| Errors | **0** | 34 (all explained by the 20 injected anomalies) |
| Warnings | 121 (20 unserved + 101 simulated shift overruns) | 150 (42 unserved + 108 simulated shift overruns) |
| Checks passed / failed / warning | 35 / 0 / 2 | 26 / 9 / 2 |
| Injected anomalies detected | n/a | **20 of 20** |
| Error findings not explained by an injected anomaly | 0 | **0** |
| Expected planner decisions matched (unserved + reason) | 20 of 20 | 42 of 42 |

Injected anomalies detected (dataset): 5 out-of-region coordinates, 3 capacity, 3 shift, 3 arrival-before-departure, 3 omitted stop, 3 duplicated stop.
Knock-on codes (for example `ROUTE_TOTAL_MISMATCH`) appear only on the anomaly's own route and are listed in the ground truth.

## 5. Business outcome numbers (dataset variant, from `/api/summary`)
2,000 deliveries: 1,958 assigned, 42 unserved (each with a reason), 1,792 delivered, 166 failed (91.5% of assigned succeeded). On-time arrivals 94.4% (1,838 of 1,947 attempted).
412 routes, 4.8 stops per route, average weight utilization 82.4%, 39,990 km planned distance, 13.7 vehicles used per day.

## 6. Requirement checklist
| Requirement | Status | Where |
|---|---|---|
| 12 entities with PK/FK, bridge table, event history | Done | `types.ts`, `db/schema.sql`, `DATA_DICTIONARY.md` |
| Required ID formats | Done + tested | `generator.ts`, `generator.test.ts` |
| 500 sites, 2,000 deliveries, 100 vehicles, 30 days of matrices, seed 20261022 | Done + tested | `config.ts`, `generator.ts` |
| Scale parameter (small and full use the same generator) | Done + tested | `SMALL_SCALE`, `--scale small` |
| 5 edge cases, injected after a valid baseline, labelled | Done + tested | `generator.ts`, `anomalies.ts` |
| Separate ground truth, never planner input | Done + tested | `output/*/ground_truth/`, `groundtruth.test.ts` |
| Planner (capacity, restrictions, windows, shifts, service time, priority; unserved with reason) | Done + tested | `planner.ts` |
| Deterministic simulation, append-only events, failure reason codes | Done + tested | `simulator.ts` |
| Validation with error/warning codes | Done + tested | `validator.ts` |
| CSV, JSON, SQL seed, manifests, validation report | Done + tested | `exporter.ts`, `output/` |
| Dashboard on real backend calculations, loading and error states, routes/stops/deliveries/exceptions/validation views | Built; API tested; UI not browser-tested (see below) | `client/`, `app.ts` |
| README, data dictionary, validation report | Done | `README.md`, `docs/` |

## 7. Honest limitations
1. **The dashboard screens were not opened in a real browser here.** The client passes the TypeScript check and builds, and every API it calls was tested, but I could not look at the rendered pages. Please open http://localhost:5173 and check each tab.
2. **The API does not read from PostgreSQL.** It generates data in memory with the same code. PostgreSQL loading is provided and was tested for real (`db:load`, `schema.sql`, `seed.sql`), but the web app does not query the database.
3. Tested on Linux only. It is written to be Windows-friendly (no shell-specific scripts) but was not run on Windows.
4. The challenge text gave no counts for orders, drivers, shifts, capacities or restrictions. I chose: 2,000 orders (1 per delivery), 100 drivers, about 78% daily shift coverage, restrictions for trucks on narrow-street sites. IDs for sites, shifts and similar tables are my own format.
5. The travel-time matrix is **zone-based** (9 x 9 zones per day and time band), not site-to-site (that would be 7.5 million rows). Road distance is straight-line x 1.3.
6. The planner is a fast greedy insertion heuristic. It is deterministic and respects all hard rules, but it does not prove optimal routes.
7. 101 (baseline) / 108 (dataset) simulated routes return to the depot after the shift end because actual traffic was slower than planned. They are shown as warnings (`ACTUAL_SHIFT_OVERRUN`); planned routes themselves all fit their shifts.
8. The ground-truth separation tests are partly structural (no label columns, planner accepts only `PlannerInput`, no references in source). They show the design, not an external audit.
9. At small scale some anomaly types may be skipped if no suitable route exists; at full scale all 20 were created.
10. I did not publish anything to GitHub or the YottaFlex portal. That is for you to do (see `docs/GITHUB_AND_SUBMISSION.md`).
