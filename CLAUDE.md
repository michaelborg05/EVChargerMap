# EV Charger Routing App

Personal EV trip planner for a BYD Atto 3. Plans a route with charging stops
using road distance and predicted arrival charge %, for one car and one user.
Built as a learning project (first Node.js project; owner is experienced in
Python, PostgreSQL, Linux and Docker).

Full project plan, findings and decision log: `docs/PLAN.md`. Read it when you
need the reasoning behind a decision; don't re-argue logged decisions.

## Current stage

Stage 2b: map. 2a (data) is done except 2a.4 (duplicate review, via Google
Places lookups). 2b.1 map page is built; next is 2b.2, the owner judging the
markers against the PlugShare complaints.

Later stages: 2c route and corridor, 2d planner, 3 validate against
the November 2026 Melbourne trip actuals (see docs/PLAN.md, Stage 3).

## Running it

- `docker compose up -d` (add `--build -V` after changing dependencies, so the
  container gets a fresh node_modules)
- `docker compose exec app node scripts/migrate.js`
- `docker compose exec app node src/ingest/run.js [--offline]`
- `docker compose exec app node --test`
- Map: http://localhost:3000. On Docker Desktop `--watch` doesn't see file
  changes: `docker compose restart app` after editing `src/`.

## Stack (decided)

- Node.js app, Docker Compose, Postgres with PostGIS (`postgis/postgis` alpine image)
- Charger data: reuse code from https://github.com/halans/ev-charge-map-au (MIT, Node, zero deps).
  Sources: NSW, VIC, ACT, QLD, TAS open data, OpenStreetMap, Open Charge Map.
- Routing: OpenRouteService API (free: 2,000 directions/day, 40/min)
- Basemap: Google Maps JavaScript API
- Live charger status: Google Places API (New), `evChargeOptions` field
- Later hosting: Render (new service, Docker) + Neon (new project). Not before Stage 3.

## Rules for the code

- All config from environment variables (`DATABASE_URL`, `GOOGLE_PLACES_API_KEY`,
  `GOOGLE_MAPS_API_KEY`, `OPENROUTESERVICE_API_KEY`, `OPENCHARGE_API_KEY`, `PORT`);
  see `.env.example`. The Places key is server-only and must never reach the browser;
  the Maps key is the only key the frontend may see.
- Vehicles: backend code, schema and APIs must take the vehicle (battery, connectors,
  max DC kW, per-speed consumption, Tesla or not) as data, never hardcode the Atto 3.
  The UI may assume the Atto 3 for v1. Use a `.env` file locally; `.env` is in `.gitignore`.
  Never commit keys or write them into code, logs or tests.
- The same Docker image must run locally and on Render with config changes only.
- Ask before adding a dependency; prefer few, well-known packages.
- Explain Node-specific idioms briefly when you use them; the owner is learning Node.

## Planner rules (from the brief)

- Road distance only, never straight-line distance.
- Consumption depends on cruise speed (see car profile). Planner asks for cruise speed, default 110 km/h.
- Buffer 15% minimum arrival charge; target charge 80% per stop.
- Any leg that breaks the buffer must be flagged, never silently allowed.
- Unknown charger kW: assume 50 kW for charge-time estimates and mark it as an estimate.
- Exclude unbuilt ("Upcoming") chargers. A missing fee is never shown as free.
- Vehicle type setting (Tesla / non-Tesla, default non-Tesla). Tesla vehicle: all Tesla
  sites. Non-Tesla: Tesla sites only if confirmed open to non-Teslas (supercharge.info
  `otherEVs`, loaded each ingest; no data licence, personal use only). Query chargers
  through `sites_for_vehicle(is_tesla)`; `available_sites` is the non-Tesla default.
- DC chargers with no stated plug type are shown with a "check for CCS2" warning.
- A "my chargers" table holds verified sites missing from open data
  (e.g. Oliver's Gundagai); treat them like any other charger.

## Google constraints (terms)

- Places data shown on a map must be on a Google map, with Google attribution.
- Only place IDs may be stored. Fetch Google kW, plug counts and live status fresh
  for each plan; never write them to the database.
- For selected stops, Google's plug count and kW override open data when present.
- Keep calls low: live checks only for chosen stops. A hard Places quota of about
  900 calls/month is set in Google Cloud.

## Car profile

| Field | Value |
|---|---|
| Car | BYD Atto 3 Premium (Extended Range), 2025 |
| Battery | 60.48 kWh gross |
| Connector | CCS2 (DC), Type 2 (AC) |
| Max DC | 80 kW |
| Consumption at 100 km/h | ~16.6 kWh/100 km (estimate) |
| Consumption at 110 km/h | ~18.3 kWh/100 km (measured on the Hume) |
| Consumption at 120 km/h | much higher; not reliably measured |

## Known data quirks

- NSW: ~73% of rows have no station name; ratings mix kW values with "AC";
  some rows are unbuilt "Upcoming" chargers.
- About a third of all sites have unknown power. Connector data is better (~88%).
- About 80% of sites appear in only one source.

## Test cases to keep

- Oran Park (home) to Lilydale VIC, 100% start, 110 km/h: the planner must never
  suggest Coolac (312 km) as the first stop.
- Predicted arrival at Yass (233 km leg) and Albury (278 km leg from Yass, after a
  full charge) should be within about 5 points of the actual 21% and 16%.
- PlugShare's 323 km Oran Park to Gundagai first leg must be flagged as unsafe.

## How we work

Claude scaffolds, writes code and tests, and explains choices. The owner decides
the schema and rules, runs everything locally, and verifies results against the
map and real-world knowledge. Stop and ask before anything that costs money,
touches API keys, or deletes data.