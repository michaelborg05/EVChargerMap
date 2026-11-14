// Integration test for the Stage 2a exit criterion. Needs a loaded database:
//   docker compose exec app node --test
// node:test is Node's built-in test runner (no dependency needed).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, query } from '../src/db.js';

after(() => pool.end());

const GOULBURN = { lat: -34.7546, lng: 149.7186 };

// Same logic as sql/near-point.sql, parameterised for node-postgres ($1, $2...).
async function ccs2Near({ lat, lng }, km) {
  const { rows } = await query(
    `SELECT s.id, s.status, s.is_tesla, ST_Distance(s.geog, p.g) AS metres
       FROM available_sites s
       CROSS JOIN (SELECT ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography AS g) p
       JOIN connectors c ON c.site_id = s.id AND c.standard = 'CCS2'
      WHERE ST_DWithin(s.geog, p.g, $3 * 1000)
      GROUP BY s.id, s.status, s.is_tesla, s.geog, p.g`,
    [lat, lng, km],
  );
  return rows;
}

test('finds CCS2 DC chargers within 5 km of Goulburn', async () => {
  const rows = await ccs2Near(GOULBURN, 5);
  assert.ok(rows.length >= 1, 'expected at least one CCS2 site near Goulburn');
  for (const r of rows) assert.ok(r.metres <= 5000);
});

test('never returns planned sites', async () => {
  const rows = await ccs2Near(GOULBURN, 50);
  assert.ok(rows.every((r) => r.status !== 'planned'));
});

// Is the Tesla site matched to this supercharge.info site usable by this vehicle?
async function teslaAvailable(superchargerName, { teslaVehicle }) {
  const { rows } = await query(
    `SELECT bool_or(v.id IS NOT NULL) AS available
       FROM supercharger_sites sc
       JOIN sites s ON s.is_tesla AND ST_DWithin(s.geog, sc.geog, 200)
       LEFT JOIN sites_for_vehicle($2) v ON v.id = s.id
      WHERE sc.name = $1`,
    [superchargerName, teslaVehicle],
  );
  assert.ok(rows.length && rows[0].available !== null, `no Tesla site matched to ${superchargerName}`);
  return rows[0].available;
}

// Owner-verified on the Nov 2026 trip (Tesla app) and on supercharge.info.
const OPEN_TO_ALL = ['Yass, NSW', 'Coolac, NSW', 'Albury, NSW', 'Goulburn, NSW - Lockyer St'];
const TESLA_ONLY = ['Gundagai, NSW', 'Holbrook, NSW', 'Goulburn, NSW'];

test('non-Tesla vehicle: open-to-all Superchargers available', async () => {
  for (const name of OPEN_TO_ALL) assert.equal(await teslaAvailable(name, { teslaVehicle: false }), true, name);
});

test('non-Tesla vehicle: Tesla-only Superchargers excluded', async () => {
  for (const name of TESLA_ONLY) assert.equal(await teslaAvailable(name, { teslaVehicle: false }), false, name);
});

test('Tesla vehicle: every Hume Supercharger available', async () => {
  for (const name of [...OPEN_TO_ALL, ...TESLA_ONLY]) {
    assert.equal(await teslaAvailable(name, { teslaVehicle: true }), true, name);
  }
});

test('available_sites matches the non-Tesla default', async () => {
  const { rows } = await query(
    `SELECT (SELECT count(*) FROM available_sites) = (SELECT count(*) FROM sites_for_vehicle()) AS same`,
  );
  assert.equal(rows[0].same, true);
});
