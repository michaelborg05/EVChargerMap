# EV Charger Routing App — Project Plan

Oct 7, 2026 · @Michael

## Project brief

Build a personal EV trip planner that can plan the Sydney to Melbourne trip in November with trustworthy, road-distance-based charging stops.

**Why:** PlugShare was hard to use for this trip. Its marker colours are confusing (green = "public", orange = "fast"), its range ring uses straight-line distance rather than road distance, and the saved trip's ring covers almost the whole route for no clear reason. It also allowed a 323 km first leg (Oran Park to Oliver's Gundagai) against a 300 km range setting, with no warning.

**Audience:** Personal use only for v1. A public product is a possible later decision, not a v1 goal.

**v1 definition of done:** Plan Oran Park to Lilydale with my car profile, starting charge and cruise speed. Every leg shows road distance and arrival charge %, no leg drops below my buffer, the markers are readable without guessing, and predicted arrival % matches my actual November 2026 trip within about 5 percentage points.

**v1 inputs:** start and destination; vehicle type (Tesla / non-Tesla, controls Tesla-only chargers); car profile (usable battery kWh, connector type, max DC charge rate, highway and mixed consumption in kWh/100 km, official range for reference); starting charge %; minimum arrival buffer %; target charge % per stop.

**v1 outputs:** route on a map, suggested charging stops, arrival % and margin per leg, rough charge time per stop, warnings for any leg that breaks the buffer.

**v1 design rules:**

- Road distance only, never straight-line distance.
- Route line coloured by estimated charge level (green, amber near buffer, red past it) instead of a range ring.
- Markers show compatibility and kW; incompatible chargers greyed out; visible legend; amber and red reserved for warnings.
- Clicking a stop shows road distance from the previous stop, arrival %, and margin.
- For selected stops, Google's plug count and kW override open data when present. Google data is fetched fresh for each plan and never stored (only place IDs are stored), and is shown on a Google map with Google attribution.
- Unknown kW is treated as 50 kW for charge-time estimates and shown as an estimate.
- Unbuilt ("Upcoming") chargers are excluded; a missing fee is never shown as free.
- Tesla Superchargers are excluded by default; only sites confirmed open to non-Teslas are included.
- A "my chargers" table holds verified sites missing from open data (e.g. Oliver's Gundagai); the planner treats them like any other charger.

**Out of scope for v1:** elevation, weather, traffic, live charger status, user accounts, multiple cars, public hosting.

**Target date:** to be set (suggested: end of January 2027). The Melbourne trip in November 2026 was driven without the app; its actual figures are now the main test case (see Stage 3).

## How to use this doc

Update the Status, Done and Notes columns as you go. Each stage ends with exit criteria; don't start the next stage until they're met.

| Key | Meaning |
| --- | --- |
| Not started / In progress / Blocked / Done | Status values |
| AI | Claude does the work; you review the output |
| Human + AI | Shared: Claude drafts or builds, you decide, run or check |
| Human | Yours only: goals, decisions, real-world checks, money, keys |

Timeline assumes starting the week of 7 October: Stage 1 about 1 week, Stage 2 about 3 weeks, Stage 3 the week before the trip.

## Stage 1: Discover and decide (about 1 week)

Goal: make the platform, data, routing and hosting decisions, and prove the data with real corridor samples.

| # | Task | Who | Output | Status | Done | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1.1 | Write the problem statement and v1 definition of done | Human | One paragraph in my own words | Done | 7 Oct 2026 | Defined in course document section 5 |
| 1.2 | Compare charger data sources (Open Charge Map, NSW/VIC open data, OSM, Google Places) on coverage, fields, licence, cost | AI | Comparison table | Done | 7 Oct 2026 | See Stage 1 findings: charger data sources |
| 1.3 | Pull sample data for the Sydney–Melbourne corridor from the top two sources | Human + AI | Script (Claude) run by me | Done | 8 Oct 2026 | Google sample pulled and assessed (8 Oct). Open data pulled fresh via halans repo incl. Open Charge Map: 3,947 sites (1,979 NSW, 713 VIC). Power known for 66%, connectors for 88%; 80% of sites single-source; 1,336 sites with unknown speed. |
| 1.4 | Spot-check 10–15 known chargers (Gundagai, Glenrowan, etc.) against the sample data | Human | Accuracy notes per source | Done | 8 Oct 2026 | Local chargers within 10 km all present and look right. Gundagai and Yass chargers present on the map but can't be verified from local knowledge; per-stop verification deferred to 3.2. Data judged good enough for v1. |
| 1.5 | Compare map and routing options (Google, OpenRouteService, self-hosted Valhalla/OSRM) | AI | Options with cost and effort | Done | 8 Oct 2026 | See Stage 1 findings: maps, routing and hosting. Recommendation: OpenRouteService for routing, MapLibre/Leaflet with MapTiler or OSM tiles. Google terms check outstanding. |
| 1.6 | Compare hosting: home Linux box with remote access, cheap VPS, cloud free tier | AI | Options, incl. phone access on the road | Done | 8 Oct 2026 | See Stage 1 findings: maps, routing and hosting. Recommendation: Neon free (new project) + Render, free tier for dev, Starter ($7/mo) for the trip. |
| 1.7 | Choose stack, routing service, hosting; set monthly cost ceiling | Human | Decision log entries | Done | 9 Oct 2026 | All decisions logged: Node.js, halans code, OpenRouteService, Google Maps basemap, local Docker then Render. |
| 1.8 | Look up battery and charging specs for the car profile | AI drafts, Human verifies | Car profile specs | Done | 9 Oct 2026 | Confirmed: BYD Atto 3 Premium (Extended Range), 2025 model. 60.48 kWh, CCS2, 80 kW DC. See Car profile section. |
| 1.9 | Measure real highway consumption on a long freeway drive | Human | kWh/100 km at about 110 km/h | Done | 9 Oct 2026 | Original estimate \~16.6 kWh/100 km (Newcastle trip, M12/M7 commute) proved too low for the Hume. Superseded by Nov 2026 trip: \~18.3 at 110 km/h. See Car profile. |
| 1.10 | Create accounts and API keys; set billing alerts | Human | Keys stored safely, alerts on | Done | 9 Oct 2026 | Google Places key, Maps JavaScript API enabled, OpenRouteService key saved. New Neon project deferred to cloud move. MapTiler not needed. |
| 1.11 | Write project brief and decision log | AI drafts, Human edits | This doc | Done | 9 Oct 2026 | Brief signed off with data rules added; decision log up to date. Stage 1 complete. |

**Exit criteria:** decisions logged, real corridor data loaded and spot-checked, brief written.

### Stage 1 findings: charger data sources (task 1.2)

No free source gives reliable live availability for the Hume corridor. Google Places is the only one with availability fields, and whether they're populated in Australia is untested. Combined open data covers roughly 82% of Australian sites and 89% of bays.

| Source | Coverage | Freshness | Live status | Licence | Limits / cost |
| --- | --- | --- | --- | --- | --- |
| OpenStreetMap (Overpass) | National, but only 27–42% of sites; uneven tags | Continuous; refresh daily | No | ODbL 1.0 (share-alike) | Free, no key; cache, don't query per request |
| Transport for NSW | 1,958 rows; richest but messiest | Republished every few months (CSV last modified April 2026) | No | CC-BY 3.0 AU | Free, no key |
| Victoria DEECA | 152 sites, government-funded only | Monthly | No | CC-BY 4.0 | Free, no key |
| Open Charge Map | National, crowdsourced plus imports | Varies by record | No (user check-ins only) | Mixed; use opendata=true for open records | Free key; about 10,000 requests/day |
| Google Places (New) | Broad | Live where operators feed it | Partly: available and out-of-service counts with timestamp | Proprietary; check terms before storing | Enterprise + Atmosphere SKU; 1K free calls/month |
| Exploren | Own network only | Live in their app | In app only; no public API found | n/a | n/a |

**Data quality warnings:**

- NSW: 73% of rows have no station name, ratings mix kW values with "AC", and 98 rows are unbuilt "Upcoming" chargers that must be excluded.
- NSW and VIC publish no fees; a missing fee must never display as free.
- VIC has structured plug types (e.g. "1 x CCS2, 1 x CHAdeMO").
- OSM: 785 of 1,590 chargers have a CCS2 tag; the rest need a fallback rule.

**Recommendation for v1:** NSW + VIC + OSM as base data, filtered to CCS2 DC. Google Places as an on-demand live check for chosen stops only.

**Option to decide:** reuse the merged GeoJSON export from [halans/ev-charge-map-au](https://github.com/halans/ev-charge-map-au) (MIT code, Node) instead of writing my own ingestion.

**Follow-ups:**

- [x] Test Google Places live fields on 5 known Hume chargers (done 8 Oct 2026)
- [x] ~~Optional: ask Exploren about OCPI or data access~~ (cancelled 9 Oct)
- [x] Find Oliver's Gundagai in open data: not in NSW, OSM, Open Charge Map or Google, but active on PlugShare (check-ins as recent as 29 Sept 2026). A real gap in open data (9 Oct).
- [x] Decide how to handle chargers missing from open data: "my chargers" table plus contributing to Open Charge Map or OSM (9 Oct)
- [ ] Add Oliver's Gundagai to Open Charge Map or OSM (runs alongside Stage 2)
- [x] Confirm which Tesla Superchargers on the route are open to non-Teslas, and test the Atto 3 at an open site (14 Nov): charged at Yass Supercharger on the Nov 2026 trip; Holbrook and Gundagai confirmed not open in the Tesla app. Open-to-all status now loaded from supercharge.info (see decision log).

**Google test results (8 Oct 2026):** live availability returned for Evie, bp pulse and Chargefox, and for some Exploren sites (Gungahlin yes, Gobbagombalin no). NRMA and Tesla returned plug counts only, no live status. Timestamps update roughly every 10 minutes. Out-of-service counts are populated (e.g. Glenrowan bp pulse 1 of 4 CCS2 out). Text search around town names returned off-route results and duplicates; use search-along-route and dedupe on place ID in the build.

**Google API costs (USD, per month, checked 8 Oct 2026):**

| What | SKU | Free | After free tier |
| --- | --- | --- | --- |
| Live charger data by text search | Text Search Enterprise + Atmosphere | 1,000 | $40 per 1,000 |
| Live charger data by place ID | Place Details Enterprise + Atmosphere | 1,000 | $25 per 1,000 |
| Find place IDs only | Text Search Essentials (IDs only) | Unlimited | Free |
| Route calculation | Compute Routes Essentials | 10,000 | $5 per 1,000 |
| Google map display | Dynamic Maps | 10,000 loads | $7 per 1,000 |

The highest-tier field requested sets the price; free allowances are pooled across all projects on one billing account. Planning at home is effectively free; refreshing 20 chargers every 10 minutes while driving would use the whole monthly allowance in one day. Guardrails: free IDs-only searches, live checks only for chosen stops, OSM tiles for the map, budget alert, hard quota of about 900 Places calls a month.

Sources: [ev-charge-map-au data sources](https://github.com/halans/ev-charge-map-au/blob/master/docs/DATA_SOURCES.md), [Google Places data fields](https://developers.google.com/maps/documentation/places/web-service/data-fields), [Google EVChargeOptions reference](https://googleapis.dev/dotnet/Google.Maps.Places.V1/latest/api/Google.Maps.Places.V1.EVChargeOptions.Types.ConnectorAggregation.html)

### Stage 1 findings: maps, routing and hosting (tasks 1.5 and 1.6)

Checked 8 Oct 2026. Prices in USD.

**Routing (one route call per trip plan, so volume is tiny):**

| Option | Free allowance | Cost / effort | Notes |
| --- | --- | --- | --- |
| OpenRouteService API | 2,000 directions/day, 40/min | Free; API key | OSM-based, matches an OSM basemap. Recommended for v1. |
| Google Routes (Compute Routes Essentials) | 10,000/month | $5 per 1,000 after | Good fallback; check Google terms on non-Google maps |
| Self-hosted OSRM or Valhalla | Unlimited | Docker + Australia OSM extract; RAM scales with extract size (planet car build \~415 GiB, Australia a small fraction) | Good learning, no limits. Stage 2+ option, not v1. |

**Map display:**

| Option | Free allowance | Notes |
| --- | --- | --- |
| Leaflet or MapLibre + OSM standard tiles | Light personal use only | Heavy use and offline use not permitted; donated servers |
| Leaflet or MapLibre + MapTiler | 5,000 map sessions, 100,000 requests/month | Non-commercial only; service pauses rather than billing when exceeded. Recommended. |
| Google Maps JavaScript (Dynamic Maps) | 10,000 loads/month | $7 per 1,000 after; simplest if Google terms require Google data on a Google map |

**Hosting:**

| Option | Cost | Pros | Cons |
| --- | --- | --- | --- |
| Neon free (new project) | $0 | PostGIS supported; 0.5 GB and 100 CU-hours per project, ample for \~4k chargers | Exceeding a limit suspends the database until next month |
| Render free web service | $0 | Existing platform | Sleeps after 15 min idle; about a minute to wake. Free hours shared across all free services. |
| Render Starter | $7/month | Always on; 512 MB RAM fine for FastAPI | Too small to host a routing engine |
| Home Linux server + Docker + Tailscale | $0 | Full control; could host a routing engine later | Home power or internet outage while away = no app |

**Recommendation:** Neon free (separate project from the crypto system) + Render free tier while building; upgrade the web service to Starter for November. OpenRouteService for routing, MapLibre or Leaflet with MapTiler tiles, Google Places only for live status. Estimated v1 cost: $0 while building, about $7 for the trip month.

**Decisions for 1.7:**

- [x] Language and dev hosting: Node.js, local Docker + local Postgres (8 Oct)
- [x] Routing: OpenRouteService (9 Oct)
- [x] Basemap: Google Maps, required by Places terms (9 Oct)
- [x] Data ingest: reuse halans code (9 Oct)
- [x] Cloud deployment: build locally in Docker, move to a new Render service when ready (9 Oct)
- [x] Google terms checked: Places data on a map must be on a Google map; place IDs are the only Places content that can be stored (9 Oct)

Note: with a Google basemap, MapTiler is no longer needed. Google Maps JavaScript gives 10,000 free map loads a month, then $7 per 1,000; personal use stays at $0. Estimated v1 cost unchanged: $0 while building, about $7 for the Render trip month.

Sources: [OpenRouteService plans](https://openrouteservice.org/plans/), [OSRM memory requirements](https://github.com/Project-OSRM/osrm-backend/wiki/Disk-and-Memory-Requirements), [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/), [MapTiler pricing](https://www.maptiler.com/cloud/pricing/), [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [Neon pricing](https://neon.com/pricing), [Render hosting costs](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses)

### Car profile (tasks 1.8 and 1.9)

| Field | Value | Source |
| --- | --- | --- |
| Model | BYD Atto 3 Premium (Extended Range), 2025 model | Confirmed by owner |
| Battery | 60.48 kWh gross, LFP blade | Published specs |
| Connector | CCS2 (DC), Type 2 (AC) | Published specs |
| Max DC charge rate | 80 kW | Published specs |
| Max AC charge rate | 7 kW single phase | Published specs |
| Official range | 480 km NEDC; 420 km WLTP | Published specs |
| Consumption at 100 km/h | \~16.6 kWh/100 km (estimate) | Newcastle trip and M12/M7 commute, displayed-range method |
| Consumption at 110 km/h | \~18.3 kWh/100 km (measured) | Yass to Albury, Nov 2026, cruise control at 110 |
| Consumption at 120 km/h | Much higher; not reliably measured | Nov 2026 trip observation |
| Planner defaults | Cruise speed 110 km/h; buffer 15%; target charge 80% | Brief |

**How consumption was measured:** the car's displayed range appears to be on the NEDC basis (480 km = 100%), so displayed range used ÷ 480 × 60.48 kWh gives energy used. The original 16.6 kWh/100 km estimate came from drives at lower speeds than the Hume and underestimated highway use by about 10% at 110 km/h and about 24% in mixed 110–120 driving. Lesson: test conditions must match use conditions. Speed is the biggest variable in the model, so consumption is stored per cruise speed.

**What it means at 110 km/h:** highway range is about 330 km from 100% to 0, about 280 km from 100% to a 15% buffer, and about 215 km per leg from 80% down to 15%. A 312 km first leg to Coolac would arrive at about 6% even leaving at 100%; PlugShare's 323 km leg would not be safely reachable. Climbs (e.g. up to the Southern Tablelands around Goulburn) add to this; elevation is a v2 feature.

**Caveats:** assumes the range display moves in step with charge %, and uses gross capacity (usable is slightly lower, so real consumption may be a little lower). On the next freeway drive, record the trip computer's kWh/100 km or start and end charge %.

**Tesla note:** early Atto 3 models have been reported unable to charge at Superchargers open to non-Teslas. Test at a local open Supercharger before relying on one.

## Stage 2: Build (about 3 weeks)

Goal: a working planner in four milestones, each usable on its own if later ones slip.

| # | Milestone | Task | Who | Status | Done | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 2a.1 | Data foundation | Scaffold repo and Docker Compose (Node.js app + PostgreSQL with PostGIS) | AI | Done | 13 Nov 2026 | Node 24 + `postgis/postgis:17-3.5-alpine`; `/health` checks DB and PostGIS. Plain-SQL migrations (`db/migrations`, `scripts/migrate.js`) so the same files run on Neon. halans `src/` vendored at commit 74dcc0e, with 3 one-line path changes (see `vendor/halans/VENDORED.md`). Fixed: Node's 250 ms connect timeout made Overpass (Germany) fail from Docker; image now sets 2 s. |
| 2a.2 | Data foundation | Design schema: chargers, connectors, power, source | Human + AI | Done | 14 Nov 2026 | `002_chargers.sql`: one `sites` table for open data and my chargers (`origin` column; reload only replaces open data), `connectors`, `site_sources`. Fee and kW kept as NULL when unknown. `003_superchargers.sql`: `supercharger_sites` from supercharge.info, and the `available_sites` view (excludes planned; Tesla only if open to all). DC with no plug type shown with a warning. See decision log, 14 Nov. |
| 2a.3 | Data foundation | Write ingestion and normalisation scripts | AI | Done | 13 Nov 2026 | `src/ingest/run.js`: halans pipeline, then `load.js` replaces open-data rows in one transaction. 13 Nov run: 5,220 source records, 3,937 sites (OSM 1,654, NSW 1,956, OCM 1,386, VIC 152, TAS 55, QLD 17). ACT fails: page states 74 chargers / 131 bays but parser finds 82 / 145, so halans rejects it. Off the Hume route; left as a known gap. Exit query `sql/near-point.sql`: 4 CCS2 sites within 5 km of Goulburn incl. the open-to-all Lockyer St Supercharger; covered by `test/near-point.test.js`. 14 Nov: added step 3, supercharge.info (199 AU sites; 165 of 206 Tesla DC sites match within 200 m). 4 open Superchargers missing from open data (Springwood, Mascot, Newstead, Lancelin), none on the Hume. |
| 2a.4 | Data foundation | Decide duplicate-merge rules across sources; review merged results | Human + AI | Not started |  | No local knowledge for these; plan is to check doubtful pairs against Google Places (free place-ID lookups) in 2b. Candidates: Goulburn Chargefox (350 kW) and NRMA "Sydney Road" (210 kW) are 5 m apart; Yass NRMA sites 77 m and 224 m from Yass Soldiers Club and Chargefox. Same site or genuinely separate? Some suburbs come through as "New South Wales" or "Australia". |
| 2b.1 | Map | Map page showing chargers, clear legend, kW on markers, incompatible greyed out | AI | Done | 14 Nov 2026 | Fastify API (`/api/chargers` by map area, `/api/chargers/:id`, `/api/sources`, `/api/config`) + plain HTML/JS page on a Google map. Categories per vehicle: DC fits (blue, kW label), DC plug not stated (dashed), AC only (purple, off by default), can't use (grey: wrong plug, Tesla-only, no plug data). Zoomed out (< zoom 9): plain dots, grey hidden. Sites within ~60 m share one marker showing the best charger, with a "+N" badge and a list in the popup. Popup shows connectors, kW vs car max, fee (never "free"), warnings, sources. Attribution footer from `data_sources`. Vehicle profile is a JSON file (`src/vehicles/`), passed to all queries. |
| 2b.1a | Map | Before hosting: create a real Google Maps Map ID (free) and set `GOOGLE_MAPS_MAP_ID` | Human | Not started |  | `DEMO_MAP_ID` is used meanwhile; fine for local development. |
| 2b.2 | Map | Judge marker design against the PlugShare complaints | Human | Done | 14 Nov 2026 | Owner reviewed the map: working well. |
| 2c.1 | Route and corridor | Fetch route and draw it on the map | AI | Not started |  |  |
| 2c.2 | Route and corridor | Find chargers near the route: distance along route and detour distance | AI | Not started |  |  |
| 2c.3 | Route and corridor | Check corridor results against the map by eye | Human | Not started |  |  |
| 2d.1 | Planner | Define rules: buffer %, target charge %, maximum detour | Human | Not started |  |  |
| 2d.2 | Planner | Implement stop selection and arrival % per leg | AI | Not started |  |  |
| 2d.3 | Planner | Write tests, incl. the 323 km Gundagai leg, which must be flagged | AI | Not started |  |  |
| 2d.4 | Planner | Hand-calculate 2–3 legs and compare with app output | Human | Not started |  |  |
| 2d.5 | Planner | Build leg view: road distance, arrival %, margin, warnings, coloured route line | Human + AI | Not started |  |  |
| 2d.6 | Planner | Review code for keys and secrets before running anywhere but my machine | Human | Not started |  |  |

**Exit criteria:** enter Oran Park to Lilydale with my car profile and get a plan where every leg shows its numbers.

## Stage 3: Validate against the Melbourne trip

Goal: prove the planner's predictions against what actually happened on the November 2026 drive, then trust it for the next real trip.

**Melbourne trip actuals (November 2026, driven without the app):**

| Leg | Distance | Start | Arrival (displayed range) | Arrival % | Speed | Consumption |
| --- | --- | --- | --- | --- | --- | --- |
| Oran Park → Yass | 233 km | 100% (480 km) | 101 km | \~21% | Mix of 110–120 km/h | \~20.5 kWh/100 km |
| Yass → Albury | 278 km | 100% (full charge at Yass) | 77 km | \~16% | Cruise control 110 km/h | \~18.3 kWh/100 km |
| Albury → Lilydale | Not recorded |  |  |  |  |  |

Planned first stop was Coolac (312 km); had to stop at Yass instead. Charge times at Yass and Albury not recorded. At 120 km/h, displayed range fell at nearly 2 km per km driven; at 110, about 1.45; at 115, noticeably steeper than 110.

| # | Task | Who | Status | Done | Notes |
| --- | --- | --- | --- | --- | --- |
| 3.1 | Run the planner for Oran Park → Lilydale, 100% start, 110 km/h; compare its stops and arrival % with the actuals | Human + AI | Not started |  |  |
| 3.2 | Check the planner never suggests Coolac as a first stop, and that predicted arrival at Yass and Albury is within about 5 points of 21% and 16% | Human | Not started |  |  |
| 3.3 | Deploy so it's reachable from my phone; test on the phone | Human + AI | Not started |  |  |
| 3.4 | Use the planner for the next real trip and record actuals | Human | Not started |  |  |

**Exit criteria:** predictions match the Melbourne actuals within about 5 percentage points, and I'd trust the plan for the next trip.

## Stage 4: After the trip (optional)

Goal: learn from real trip data and decide whether there's a v2.

| # | Task | Who | Status | Done | Notes |
| --- | --- | --- | --- | --- | --- |
| 4.1 | Record actual arrival % and consumption for each leg | Human | Done | 13 Nov 2026 | Melbourne trip recorded in Stage 3 (first two legs). Albury → Lilydale leg and charge times not recorded. |
| 4.2 | Compare predicted vs actual; tune the consumption model | AI | In progress |  | Initial comparison done: estimate 16.6 vs measured 18.3 kWh/100 km at 110. Car profile changed to per-speed consumption. Full comparison after the planner exists (3.1). |
| 4.3 | Decide what v2 is, or whether there is one | Human | Not started |  |  |

## Decision log

One row per decision, newest first. Record the options you rejected too, so you don't re-argue them later.

| Date | Decision | Options considered | Why this one | Related task |
| --- | --- | --- | --- | --- |
| 8 Oct 2026 | Live status in v1: on-demand Google Places check for selected stops. NRMA and Tesla shown as status unknown. | No live status; Google Places live check; operator OCPI feeds | Test showed live data for Evie, bp pulse, Chargefox and some Exploren. Out-of-service counts give a reliability signal open data lacks. OCPI needs commercial agreements. | 1.2, 1.7 |
| 8 Oct 2026 | Build in Node.js | Python (FastAPI); Node.js | Learn a second language; halans repo is Node (MIT), so its parsing and merge code can be reused directly. | 1.7 |
| 8 Oct 2026 | Develop locally: Docker on home Linux box, local Postgres container with PostGIS (postgis alpine image). Move to Render + Neon when ready to host. | Render + Neon from day one; local Docker first | $0 while building; Docker image and Postgres move to Render and Neon with config changes only. Separate Render service, not bolted onto the crypto system. | 1.6, 1.7 |
| 9 Oct 2026 | Data ingest: reuse halans code | Reuse halans code/export; write my own | Already handles source quirks and merging; same language. | 1.7, 2a |
| 9 Oct 2026 | Routing: OpenRouteService | OpenRouteService; Google Routes | Free tier far exceeds need; Google terms restrict Places data on non-Google maps, not third-party routes on a Google map. | 1.5, 1.7 |
| 9 Oct 2026 | Basemap: Google Maps (JavaScript API) | MapTiler/OSM tiles; Google Maps | Google terms require Places data on a map to be on a Google map. 10,000 free map loads/month covers personal use. | 1.5, 1.7 |
| 9 Oct 2026 | Chargers missing from open data: add a "my chargers" table, and contribute missing sites to Open Charge Map or OSM | Ignore gaps; my chargers table; contribute to open data | Oliver's Gundagai is active (PlugShare check-ins 29 Sept 2026) but absent from every source. The table guarantees it's in my plan; contributing fixes it at the source. Enter from own knowledge, not PlugShare's listing. | 1.4, 2a |
| 14 Nov 2026 | Map markers: chargers within ~60 m are grouped into one marker showing the best (usable first, then highest kW), with "+N"; zoomed out shows dots only | Overlapping markers; marker clustering library; server-side grouping | Overlaps hid the fastest chargers (Goulburn 350 kW under 210 kW; Lockyer St Supercharger under a 75 kW Chargefox). Grouping on the server needs no extra dependency and doubles as a duplicate finder for 2a.4. | 2b.1, 2a.4 |
| 14 Nov 2026 | Web stack: Fastify for the API, plain HTML/JS frontend with no build step | Node built-in http; Fastify; Express. React vs plain JS. | Fastify is well known and small, with schema validation built in. Plain JS keeps the learning focused; revisit if the planner UI gets complex. | 2b |
| 14 Nov 2026 | Two Google keys: `GOOGLE_PLACES_API_KEY` (server only; Places API (New); quota ~900/month) and `GOOGLE_MAPS_API_KEY` (browser; Maps JavaScript API only; localhost:3000 and later Render URL; daily load cap) | One key; two keys; IP-restricted browser key | A map key is public by design, so it gets only the cheap Maps JS API and a quota. Keeping the Places key server-side means a copied map key can't spend Places calls. IP restriction can't work for a key used in the browser. | 2b.1 |
| 14 Nov 2026 | v1 UI is for the Atto 3 only, but backend is vehicle-agnostic: car profile passed as data (battery, connectors, max DC kW, per-speed consumption, is Tesla) | Hardcode Atto 3; selectable profiles in v1; data-driven backend with single-car UI | Keeps v1 small while allowing more cars later without a rewrite. | 2b, 2d |
| 14 Nov 2026 | Vehicle type setting (Tesla / non-Tesla, default non-Tesla): a Tesla vehicle sees all Tesla sites; a non-Tesla vehicle excludes Tesla-only sites. In the database: `site_access` view + `sites_for_vehicle(is_tesla)` function (`004_vehicle_type.sql`). | Always exclude Tesla-only sites; per-vehicle setting | Lets the app plan for a Tesla too. This is one setting, not multiple car profiles; "multiple cars" stays out of scope for v1 unless the brief changes. UI for the setting comes in 2b/2d. | 2a.2, 2b.1, 2d |
| 14 Nov 2026 | Tesla open-to-all status from supercharge.info: AU sites downloaded each ingest into `supercharger_sites`, matched to our Tesla sites within 200 m. Tesla sites are available only when matched to an open site with `otherEVs` = true. | Exclude all Teslas; Tesla app/website (no public API, scraping breaks terms); supercharge.info | Most Hume Superchargers are open to all (Yass, Coolac, Albury, Goulburn Lockyer St). supercharge.info matched owner's Tesla-app checks on the trip (Holbrook and Gundagai not open). No licence published for its data: personal use only; ask them before any public release. Confirm in the Tesla app before relying on a stop. | 2a.2, Stage 1 follow-up |
| 14 Nov 2026 | DC connectors with no plug type ("DCUnspecified", mostly NSW) are shown as possible CCS2, with a warning to check the plug type | Exclude them; treat as CCS2; show with warning | Excluding them hides real chargers (288 sites have no CCS2 listed at all), but silently treating them as CCS2 could send me to a CHAdeMO-only site. | 2a.2 |
| 14 Nov 2026 | Open data and my chargers share one `sites` table, with an `origin` column; a reload replaces only open-data rows | One table; separate my_chargers table | Planner reads one table and treats both alike; hand-entered sites can't be wiped by an ingest. | 2a.2 |
| 13 Nov 2026 | Consumption depends on cruise speed: car profile stores a figure per speed; planner asks for cruise speed (default 110 km/h) | Single consumption figure; per-speed figures; full physics model with elevation | Melbourne trip showed \~18.3 kWh/100 km at 110 vs 16.6 estimate, and much higher at 120. Per-speed figures are simple and match measured data; elevation deferred to v2. | 1.9, 2d, 4.2 |
