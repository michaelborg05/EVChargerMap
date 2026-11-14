// Charger queries for the map. Everything is relative to a vehicle object
// (its plug types and whether it's a Tesla); nothing here assumes a car.
//
// Each site gets one marker category for that vehicle:
//   dc              has a DC plug the vehicle takes (e.g. CCS2)
//   dc_unconfirmed  DC listed but plug type not stated: show with a warning
//   ac              only AC plugs the vehicle takes (or AC, plug not stated)
//   incompatible    nothing usable, Tesla-only for a non-Tesla, or no plug data
// Planned ("Upcoming") sites never appear (site_access excludes them).
import { query } from './db.js';

export const CATEGORIES = ['dc', 'dc_unconfirmed', 'ac', 'incompatible'];
export const MAX_MARKERS = 2500;

// Shared SQL: per-site classification for vehicle params $1 (is_tesla),
// $2 (DC plug types) and $3 (AC plug types). `scope` narrows site_access first.
function classifiedSites(scope) {
  return `
    WITH s AS (SELECT * FROM site_access sa WHERE ${scope}),
    c AS (
      SELECT s.id,
             bool_or(c.standard = ANY ($2::text[]))                        AS has_dc,
             max(c.power_kw) FILTER (WHERE c.standard = ANY ($2::text[]))  AS dc_kw,
             bool_or(c.standard = 'DCUnspecified')                         AS has_dc_unspecified,
             max(c.power_kw) FILTER (WHERE c.standard = 'DCUnspecified')   AS dc_unspecified_kw,
             bool_or(c.standard = ANY ($3::text[]) OR c.standard = 'ACUnspecified') AS has_ac,
             max(c.power_kw) FILTER (WHERE c.standard = ANY ($3::text[]) OR c.standard = 'ACUnspecified') AS ac_kw,
             count(c.id)                                                   AS connector_rows
      FROM s LEFT JOIN connectors c ON c.site_id = s.id
      GROUP BY s.id
    ),
    k AS (
      SELECT s.*, c.connector_rows,
        CASE
          WHEN s.tesla_only AND NOT $1::boolean THEN 'incompatible'
          WHEN c.has_dc             THEN 'dc'
          WHEN c.has_dc_unspecified THEN 'dc_unconfirmed'
          WHEN c.has_ac             THEN 'ac'
          ELSE 'incompatible'
        END AS category,
        CASE
          WHEN s.tesla_only AND NOT $1::boolean THEN 'tesla_only'
          WHEN c.connector_rows = 0 THEN 'no_plug_data'
          WHEN NOT (c.has_dc OR c.has_dc_unspecified OR c.has_ac) THEN 'no_compatible_plug'
        END AS incompatible_reason,
        -- Connector kW first; fall back to the site's max kW only when the
        -- connector has none. NULL = unknown (planner assumes 50 kW, estimated).
        CASE
          WHEN c.has_dc             THEN coalesce(c.dc_kw, s.max_power_kw)
          WHEN c.has_dc_unspecified THEN coalesce(c.dc_unspecified_kw, s.max_power_kw)
          WHEN c.has_ac             THEN c.ac_kw
        END AS kw
      FROM s JOIN c USING (id)
    )`;
}

function vehicleParams(vehicle) {
  return [vehicle.isTesla, vehicle.dcConnectors, vehicle.acConnectors];
}

// Sites closer than this share one marker, so a charger is never hidden
// under its neighbour. Degrees of lat/lng: 0.0006 is about 55-65 m here.
const GROUP_EPS_DEG = 0.0006;

// Markers inside a bounding box. Returns { markers, truncated }.
// Each marker shows the best site at its spot (best category, then highest
// kW); `others` lists the rest of the group, if any.
export async function chargersInBox(vehicle, { minLng, minLat, maxLng, maxLat }, categories = CATEGORIES) {
  const { rows } = await query(
    `${classifiedSites('sa.geog && ST_MakeEnvelope($4, $5, $6, $7, 4326)::geography')},
     g AS (
       SELECT k.*, array_position($9::text[], category) AS rank,
              -- DBSCAN with minpoints 1 = "group everything within eps of each other"
              ST_ClusterDBSCAN(geog::geometry, eps := $11, minpoints := 1) OVER () AS group_id
       FROM k
       WHERE category = ANY ($8::text[])
     ),
     r AS (
       SELECT g.*,
              row_number() OVER (PARTITION BY group_id ORDER BY rank, kw DESC NULLS LAST, id) AS pos,
              jsonb_agg(jsonb_build_object('id', id, 'name', display_name, 'category', category, 'kw', kw, 'rank', rank))
                OVER (PARTITION BY group_id) AS members
       FROM g
     )
     SELECT id, display_name AS name, category, kw, is_tesla, tesla_open_to_all, members,
            ST_Y(geog::geometry) AS lat, ST_X(geog::geometry) AS lng
     FROM r
     WHERE pos = 1
     ORDER BY rank, kw DESC NULLS LAST
     LIMIT $10`,
    [...vehicleParams(vehicle), minLng, minLat, maxLng, maxLat, categories, CATEGORIES, MAX_MARKERS + 1, GROUP_EPS_DEG],
  );
  const truncated = rows.length > MAX_MARKERS;
  return {
    truncated,
    markers: rows.slice(0, MAX_MARKERS).map((r) => ({
      id: r.id, name: r.name, category: r.category,
      kw: r.kw === null ? null : Number(r.kw),        // pg returns numeric as a string
      lat: r.lat, lng: r.lng,
      tesla: r.is_tesla ? (r.tesla_open_to_all ? 'open_to_all' : 'tesla_only') : null,
      others: r.members
        .filter((m) => m.id !== r.id)
        .sort((a, b) => a.rank - b.rank || (b.kw ?? -1) - (a.kw ?? -1))
        .map((m) => ({ id: m.id, name: m.name, category: m.category, kw: m.kw })),
    })),
  };
}

// Full details for one site, with the warnings the brief requires.
// Returns null if the site doesn't exist (or is planned).
export async function chargerDetail(vehicle, id) {
  const { rows } = await query(
    `${classifiedSites('sa.id = $4')}
     SELECT id, origin, display_name, name_is_derived, operator, network, status, access, fee,
            opening_hours, website, address, state, category, incompatible_reason, kw,
            position_precision, is_tesla, tesla_open_to_all, source_count,
            ST_Y(geog::geometry) AS lat, ST_X(geog::geometry) AS lng
     FROM k`,
    [...vehicleParams(vehicle), id],
  );
  if (!rows.length) return null;
  const s = rows[0];

  const [connectors, sources] = await Promise.all([
    query(`SELECT standard, count, power_kw FROM connectors WHERE site_id = $1
           ORDER BY power_kw DESC NULLS LAST, standard`, [id]),
    query(`SELECT source_id, url, fetched_at FROM site_sources WHERE site_id = $1 ORDER BY source_id`, [id]),
  ]);

  const kw = s.kw === null ? null : Number(s.kw);
  return {
    id: s.id,
    name: s.display_name,
    operator: s.operator,
    network: s.network,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    status: s.status,
    access: s.access,
    fee: s.fee === true ? 'paid' : 'unknown',   // halans never reports "free"; unknown stays unknown
    openingHours: s.opening_hours,
    website: s.website,
    category: s.category,
    incompatibleReason: s.incompatible_reason,
    kw,
    vehicleMaxKw: s.category === 'dc' || s.category === 'dc_unconfirmed' ? vehicle.maxDcKw
      : s.category === 'ac' ? vehicle.maxAcKw : null,
    tesla: s.is_tesla ? (s.tesla_open_to_all ? 'open_to_all' : 'tesla_only') : null,
    connectors: connectors.rows.map((c) => ({
      standard: c.standard, count: c.count, kw: c.power_kw === null ? null : Number(c.power_kw),
    })),
    sources: sources.rows.map((r) => ({ id: r.source_id, url: r.url, fetchedAt: r.fetched_at })),
    origin: s.origin,
    warnings: warningsFor(s, kw, vehicle),
  };
}

function warningsFor(s, kw, vehicle) {
  const w = [];
  if (s.category === 'dc_unconfirmed') w.push('Plug type not stated: check for CCS2 before relying on it');
  if ((s.category === 'dc' || s.category === 'dc_unconfirmed') && kw === null) {
    w.push('Power unknown: charge times assume 50 kW (estimate)');
  }
  if (s.fee !== true) w.push('Fee unknown: not confirmed free');
  if (s.status === 'unknown') w.push('Operating status unknown');
  if (s.access === 'restricted' || s.access === 'private') w.push(`Access: ${s.access}`);
  if (s.position_precision === 'geocoded_locality') w.push('Location approximate (town centre only)');
  if (s.is_tesla && s.tesla_open_to_all && !vehicle.isTesla) {
    w.push('Tesla Supercharger open to other EVs (supercharge.info): confirm in the Tesla app');
  }
  if (s.incompatible_reason === 'tesla_only') w.push('Tesla vehicles only');
  return w;
}

export async function dataSources() {
  const { rows } = await query(
    `SELECT source_id AS id, name, attribution, licence, licence_url AS "licenceUrl",
            record_count AS "recordCount", error, fetched_at AS "fetchedAt"
     FROM data_sources
     WHERE error IS NULL               -- only credit sources that supplied data this load
     ORDER BY source_id`,
  );
  return rows;
}
