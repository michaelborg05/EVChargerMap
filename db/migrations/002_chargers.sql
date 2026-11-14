-- Charger schema (task 2a.2). DRAFT for owner review.
--
-- Open data and "my chargers" share one sites table, told apart by `origin`.
-- The ingest only replaces origin = 'open_data' rows, so hand-entered sites
-- survive every reload and the planner treats both the same.
-- Rules from the brief live in the available_sites view, not in the loader,
-- so the raw data stays inspectable.

CREATE TABLE sites (
  id                  text PRIMARY KEY,      -- halans canonical id; 'mine:<slug>' for my chargers
  origin              text NOT NULL CHECK (origin IN ('open_data', 'mine')),
  name                text,                  -- NULL for most NSW rows
  display_name        text NOT NULL,         -- name, or one derived from operator/suburb
  name_is_derived     boolean NOT NULL DEFAULT false,
  operator            text,
  network             text,
  status              text NOT NULL CHECK (status IN ('operational', 'planned', 'unknown')),
  access              text,                  -- public / restricted / private / unknown
  fee                 boolean,               -- NULL = unknown. Never display NULL as free.
  opening_hours       text,
  website             text,
  plug_count          integer,
  max_power_kw        numeric,               -- NULL = unknown; planner assumes 50 kW, marked as estimate
  speed_band          text,
  address             text,
  suburb              text,
  state               text,
  postcode            text,
  geog                geography(Point, 4326) NOT NULL,  -- distances in metres
  position_precision  text,                  -- 'surveyed' or 'geocoded_locality' (town centre only)
  position_error_m    numeric,
  source_count        integer NOT NULL DEFAULT 1,
  confidence          numeric,               -- halans merge confidence, 0..1
  is_tesla            boolean GENERATED ALWAYS AS (
                        (coalesce(operator, '') || ' ' || coalesce(network, '') || ' ' || coalesce(name, ''))
                        ~* 'tesla'
                      ) STORED,
  notes               text,                  -- free text, mainly for my chargers
  raw                 jsonb,                 -- full halans record: provenance and conflicts per field
  loaded_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (origin = 'open_data' OR id LIKE 'mine:%')
);

CREATE INDEX sites_geog_idx ON sites USING gist (geog);

-- One row per connector standard per site, e.g. 2 x CCS2 at 50 kW.
-- standard values from halans: CCS2, CHAdeMO, Type2, Type1, CCS1,
-- TeslaProprietary, ACUnspecified, DCUnspecified (DC, plug type not stated).
CREATE TABLE connectors (
  id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_id   text NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  standard  text NOT NULL,
  count     integer,
  power_kw  numeric,
  sources   text[] NOT NULL DEFAULT '{}'
);

CREATE INDEX connectors_site_idx ON connectors (site_id);
CREATE INDEX connectors_standard_idx ON connectors (standard);

-- Which source records were merged into each site.
CREATE TABLE site_sources (
  site_id           text NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
  source_id         text NOT NULL,         -- osm, nsw, vic, qld, act, tas, ocm
  source_record_id  text NOT NULL,
  fetched_at        timestamptz,
  url               text,
  PRIMARY KEY (site_id, source_id, source_record_id)
);

-- Sites the planner may use: built, and not Tesla.
-- Tesla sites confirmed open to non-Teslas will be added back once we have
-- that list (PLAN.md Stage 1 follow-up).
CREATE VIEW available_sites AS
SELECT *
FROM sites
WHERE status <> 'planned'
  AND NOT is_tesla;
