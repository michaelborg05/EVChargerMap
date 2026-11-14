-- Stage 2a exit query: CCS2 DC chargers within 5 km of a point.
-- Default point: Goulburn (-34.7546, 149.7186). ST_MakePoint takes (lng, lat).
--
-- Uses sites_for_vehicle(:tesla): excludes planned ("Upcoming") sites. For a
-- non-Tesla vehicle (default) also excludes Tesla sites unless supercharge.info
-- says they are open to other EVs; a Tesla vehicle sees all Tesla sites.
-- ccs2_confirmed = true:  site lists a CCS2 connector.
-- ccs2_confirmed = false: site lists only DC with no plug type (mostly NSW).
--                         Shown, with a warning to check the plug type
--                         (owner decision, 14 Nov 2026).
-- kW NULL means unknown; never assume it's fast.
--
--   psql postgres://ev:ev@localhost:5433/evcharger -f sql/near-point.sql
--   psql ... -v lat=-35.0 -v lng=148.0 -v km=10 -f sql/near-point.sql
--   psql ... -v tesla=true -f sql/near-point.sql     (as a Tesla vehicle)
\if :{?lat}   \else \set lat -34.7546 \endif
\if :{?lng}   \else \set lng 149.7186 \endif
\if :{?km}    \else \set km 5 \endif
\if :{?tesla} \else \set tesla false \endif

WITH here AS (
  SELECT ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography AS g
)
SELECT
  s.display_name,
  s.operator,
  s.suburb,
  round((ST_Distance(s.geog, here.g) / 1000)::numeric, 2)  AS km,
  bool_or(c.standard = 'CCS2')                              AS ccs2_confirmed,
  max(c.power_kw)                                           AS dc_kw,
  sum(c.count)                                              AS dc_plugs,
  s.status,
  s.position_precision,
  s.source_count,
  s.tesla_only,
  CASE WHEN NOT bool_or(c.standard = 'CCS2')
       THEN 'Plug type not stated: check for CCS2 before relying on it'
  END                                                       AS warning
FROM sites_for_vehicle(:tesla) s
CROSS JOIN here
JOIN connectors c ON c.site_id = s.id
                 AND c.standard IN ('CCS2', 'DCUnspecified')
WHERE ST_DWithin(s.geog, here.g, :km * 1000)   -- metres; uses the GiST index
GROUP BY s.id, s.display_name, s.operator, s.suburb, s.geog, here.g,
         s.status, s.position_precision, s.source_count, s.tesla_only
ORDER BY ccs2_confirmed DESC, km;
