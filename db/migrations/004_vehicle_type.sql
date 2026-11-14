-- Vehicle type decides Tesla access (decision log, 14 Nov 2026):
--   Tesla vehicle:     every Tesla site is usable.
--   Non-Tesla vehicle: Tesla-only sites are excluded.
--
-- site_access      built (non-planned) sites, with Tesla access columns. No vehicle filter.
-- sites_for_vehicle(is_tesla)  the sites a vehicle may use. Default: non-Tesla.
-- available_sites  kept as the non-Tesla default, so existing queries stay safe.

DROP VIEW available_sites;

CREATE VIEW site_access AS
SELECT s.*,
       sc.other_evs AS tesla_open_to_all,     -- NULL for non-Tesla sites and unmatched Tesla sites
       (s.is_tesla AND sc.other_evs IS NOT TRUE) AS tesla_only   -- unconfirmed counts as Tesla-only
FROM sites s
LEFT JOIN LATERAL (
  SELECT sc.other_evs
  FROM supercharger_sites sc
  WHERE s.is_tesla
    AND sc.status IN ('OPEN', 'EXPANDING')
    AND ST_DWithin(sc.geog, s.geog, 200)
  ORDER BY sc.geog <-> s.geog
  LIMIT 1
) sc ON true
WHERE s.status <> 'planned';

-- A simple SQL function like this is inlined by the planner, so callers'
-- ST_DWithin filters still use the spatial index.
CREATE FUNCTION sites_for_vehicle(p_is_tesla boolean DEFAULT false)
RETURNS SETOF site_access
LANGUAGE sql STABLE
AS $$
  SELECT * FROM site_access WHERE p_is_tesla OR NOT tesla_only
$$;

CREATE VIEW available_sites AS
SELECT * FROM sites_for_vehicle(false);
