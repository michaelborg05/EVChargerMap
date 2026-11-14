-- Tesla Supercharger sites from supercharge.info (Australia only), used to
-- decide which Tesla sites are open to non-Teslas.
-- Kept in a separate table and matched by distance at query time, because
-- halans site ids can change between ingests.
--
-- Licence: supercharge.info publishes no licence for its data. Personal use
-- only; ask them before any public release (PLAN.md decision log, 14 Nov 2026).

CREATE TABLE supercharger_sites (
  id             integer PRIMARY KEY,      -- supercharge.info site id
  name           text NOT NULL,
  status         text NOT NULL,            -- OPEN, EXPANDING, CLOSED_TEMP, PERMIT, ...
  other_evs      boolean,                  -- true = open to non-Tesla EVs
  stall_count    integer,
  power_kw       numeric,
  plugs          jsonb,                    -- e.g. {"ccs2": 12}
  geog           geography(Point, 4326) NOT NULL,
  date_opened    date,
  raw            jsonb NOT NULL,
  loaded_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX supercharger_sites_geog_idx ON supercharger_sites USING gist (geog);

-- Tesla sites are now included when a supercharge.info site within 200 m is
-- open (OPEN or EXPANDING) and open to other EVs. Unmatched Tesla sites stay
-- excluded: open access is unconfirmed.
-- New column tesla_open_to_all: true/false for Tesla sites, NULL otherwise.
CREATE OR REPLACE VIEW available_sites AS
SELECT s.*, sc.other_evs AS tesla_open_to_all
FROM sites s
LEFT JOIN LATERAL (
  SELECT sc.other_evs
  FROM supercharger_sites sc
  WHERE s.is_tesla
    AND sc.status IN ('OPEN', 'EXPANDING')
    AND ST_DWithin(sc.geog, s.geog, 200)
  ORDER BY sc.geog <-> s.geog              -- nearest first
  LIMIT 1
) sc ON true
WHERE s.status <> 'planned'
  AND (NOT s.is_tesla OR sc.other_evs IS TRUE);
