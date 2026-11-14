// Ingest, step 3: Tesla Supercharger sites from supercharge.info.
// Downloads one JSON file (all sites worldwide, ~7 MB), keeps Australia,
// saves it to data/supercharge/ (reused with --offline), and replaces the
// supercharger_sites table in one transaction. If the download fails, the
// table is left as it was.
//
//   node src/ingest/superchargers.js [--offline]
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../db.js';

const URL = 'https://supercharge.info/service/supercharge/allSites';
const CACHE = path.join(import.meta.dirname, '..', '..', 'data', 'supercharge', 'sites-au.json');

async function fetchAustralianSites() {
  const res = await fetch(URL, {
    headers: { 'user-agent': 'personal-ev-trip-planner (non-commercial)' },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`supercharge.info returned HTTP ${res.status}`);
  const all = await res.json();
  if (!Array.isArray(all)) throw new Error('supercharge.info: expected a JSON array');
  return all.filter((s) => s.address?.country === 'Australia');
}

export async function loadSuperchargers({ offline = false } = {}) {
  let sites;
  if (offline) {
    sites = JSON.parse(await fs.readFile(CACHE, 'utf8'));
    console.log(`supercharge.info: offline, ${sites.length} AU sites from cache`);
  } else {
    sites = await fetchAustralianSites();
    // Sanity check: a sudden collapse in count means the feed broke, not that
    // Tesla closed most of Australia. Refuse rather than wipe good data.
    if (sites.length < 50) throw new Error(`supercharge.info: only ${sites.length} AU sites; refusing to load`);
    await fs.mkdir(path.dirname(CACHE), { recursive: true });
    await fs.writeFile(CACHE, JSON.stringify(sites));
    console.log(`supercharge.info: fetched ${sites.length} AU sites`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM supercharger_sites');
    const { rowCount } = await client.query(
      `INSERT INTO supercharger_sites
         (id, name, status, other_evs, stall_count, power_kw, plugs, geog, date_opened, raw)
       SELECT (s->>'id')::integer, s->>'name', s->>'status', (s->>'otherEVs')::boolean,
              (s->>'stallCount')::integer, (s->>'powerKilowatt')::numeric, s->'plugs',
              ST_SetSRID(ST_MakePoint((s->'gps'->>'longitude')::float8,
                                      (s->'gps'->>'latitude')::float8), 4326)::geography,
              (s->>'dateOpened')::date, s
       FROM jsonb_array_elements($1::jsonb) AS s`,
      [JSON.stringify(sites)],
    );
    // No published licence; credit the source anyway.
    await client.query(
      `INSERT INTO data_sources (source_id, name, attribution, licence, homepage, record_count, fetched_at)
       VALUES ('supercharge_info', 'supercharge.info', 'Tesla open-to-all status: supercharge.info',
               'No licence published (personal use)', 'https://supercharge.info/', $1, now())
       ON CONFLICT (source_id) DO UPDATE SET
         record_count = EXCLUDED.record_count, fetched_at = EXCLUDED.fetched_at, loaded_at = now()`,
      [rowCount],
    );
    await client.query('COMMIT');
    console.log(`loaded ${rowCount} supercharger sites`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (import.meta.filename === process.argv[1]) {
  try {
    await loadSuperchargers({ offline: process.argv.includes('--offline') });
  } finally {
    await pool.end();
  }
}
