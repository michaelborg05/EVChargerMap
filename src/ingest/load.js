// Ingest, step 2: load data/halans/cache/dataset.json into Postgres.
//
// The whole file is sent to Postgres once as a single jsonb parameter and
// unpacked there with jsonb_array_elements, so the mapping below is plain SQL.
// It runs in one transaction: either every open-data row is replaced, or
// nothing changes. Rows with origin = 'mine' are never touched.
//
//   node src/ingest/load.js     (also called by src/ingest/run.js)
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../db.js';

const DEFAULT_PATH = path.join(import.meta.dirname, '..', '..', 'data', 'halans', 'cache', 'dataset.json');

export async function loadDataset(datasetPath = DEFAULT_PATH) {
  const { sites, sources, attribution } = JSON.parse(await fs.readFile(datasetPath, 'utf8'));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query('CREATE TEMP TABLE staging (s jsonb) ON COMMIT DROP');
    await client.query('INSERT INTO staging SELECT jsonb_array_elements($1::jsonb)', [JSON.stringify(sites)]);

    // ON DELETE CASCADE removes their connectors and site_sources too.
    await client.query("DELETE FROM sites WHERE origin = 'open_data'");

    const { rowCount: siteCount } = await client.query(`
      INSERT INTO sites (
        id, origin, name, display_name, name_is_derived, operator, network,
        status, access, fee, opening_hours, website, plug_count, max_power_kw,
        speed_band, address, suburb, state, postcode, geog,
        position_precision, position_error_m, source_count, confidence, raw)
      SELECT
        s->>'id', 'open_data', s->>'name', s->>'displayName',
        coalesce((s->>'nameIsDerived')::boolean, false),
        s->>'operator', s->>'network', s->>'status', s->>'access',
        (s->>'fee')::boolean, s->>'openingHours', s->>'website',
        (s->>'plugCount')::integer, (s->>'maxPowerKw')::numeric, s->>'speedBand',
        s->'address'->>'full', s->'address'->>'suburb', s->>'state', s->'address'->>'postcode',
        ST_SetSRID(ST_MakePoint((s->>'lng')::float8, (s->>'lat')::float8), 4326)::geography,
        s->>'positionPrecision', (s->>'positionErrorMetres')::numeric,
        coalesce((s->>'sourceCount')::integer, 1), (s->>'confidence')::numeric, s
      FROM staging`);

    const { rowCount: connectorCount } = await client.query(`
      INSERT INTO connectors (site_id, standard, count, power_kw, sources)
      SELECT s->>'id', c->>'standard', (c->>'count')::integer, (c->>'powerKw')::numeric,
             ARRAY(SELECT jsonb_array_elements_text(coalesce(c->'sources', '[]')))
      FROM staging, jsonb_array_elements(s->'connectors') AS c`);

    const { rowCount: sourceCount } = await client.query(`
      INSERT INTO site_sources (site_id, source_id, source_record_id, fetched_at, url)
      SELECT DISTINCT ON (s->>'id', r->>'sourceId', r->>'sourceRecordId')
             s->>'id', r->>'sourceId', r->>'sourceRecordId', (r->>'fetchedAt')::timestamptz, r->>'url'
      FROM staging, jsonb_array_elements(s->'sources') AS r`);

    // Source metadata for attribution. Attribution entries without a matching
    // source (e.g. nominatim, used for geocoding) are included too.
    const meta = attribution.map((a) => {
      const src = sources.find((s) => s.sourceId === a.sourceId) ?? {};
      const fetched = (src.fetch ?? []).map((f) => f.fetchedAt).filter(Boolean).sort();
      return {
        source_id: a.sourceId, name: src.name ?? null, attribution: a.text,
        licence: a.licence ?? null, licence_url: a.licenceUrl ?? null, homepage: src.homepage ?? null,
        record_count: src.recordCount ?? null, error: src.error ?? null, fetched_at: fetched.at(-1) ?? null,
      };
    });
    await client.query("DELETE FROM data_sources WHERE source_id <> 'supercharge_info'");
    await client.query(
      `INSERT INTO data_sources (source_id, name, attribution, licence, licence_url, homepage,
                                 record_count, error, fetched_at)
       SELECT source_id, name, attribution, licence, licence_url, homepage, record_count, error, fetched_at
       FROM jsonb_to_recordset($1::jsonb) AS x(source_id text, name text, attribution text, licence text,
            licence_url text, homepage text, record_count integer, error text, fetched_at timestamptz)`,
      [JSON.stringify(meta)],
    );

    await client.query('COMMIT');
    console.log(`loaded ${siteCount} sites, ${connectorCount} connectors, ${sourceCount} source links`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run directly (not imported): this is ESM's version of Python's
// `if __name__ == "__main__":`.
if (import.meta.filename === process.argv[1]) {
  try {
    await loadDataset();
  } finally {
    await pool.end();
  }
}
