// API tests via app.inject(): Fastify runs the request in-process, no port.
// Needs a loaded database: docker compose exec app node --test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

const app = buildApp();
after(() => app.close());   // also closes the DB pool (onClose hook)

// Roughly 10 km around Goulburn.
const GOULBURN_BBOX = '149.62,-34.84,149.82,-34.67';

async function get(url) {
  const res = await app.inject({ method: 'GET', url });
  return { status: res.statusCode, body: res.json() };
}

test('health reports DB and PostGIS', async () => {
  const { status, body } = await get('/health');
  assert.equal(status, 200);
  assert.equal(body.db, 'ok');
});

test('chargers near Goulburn: Lockyer St Supercharger usable, older one Tesla-only (Atto 3)', async () => {
  const { status, body } = await get(`/api/chargers?bbox=${GOULBURN_BBOX}`);
  assert.equal(status, 200);
  const teslas = body.markers.filter((m) => m.tesla);
  assert.ok(teslas.some((m) => m.tesla === 'open_to_all' && m.category === 'dc'), 'open-to-all Supercharger as dc');
  assert.ok(teslas.some((m) => m.tesla === 'tesla_only' && m.category === 'incompatible'), 'Tesla-only shown greyed');
  assert.ok(body.markers.some((m) => m.category === 'dc' && !m.tesla), 'non-Tesla DC site');
});

test('co-located chargers share one marker, best one shown', async () => {
  // Goulburn: Chargefox 350 kW and NRMA 210 kW are ~5 m apart.
  const { body } = await get(`/api/chargers?bbox=${GOULBURN_BBOX}&categories=dc`);
  const group = body.markers.find((m) => m.kw === 350);
  assert.ok(group, '350 kW site is the visible marker');
  assert.ok(group.others.some((o) => Number(o.kw) === 210), '210 kW site listed in the group');
  assert.ok(!body.markers.some((m) => m.kw === 210), '210 kW not a separate overlapping marker');
});

test('category filter only returns requested categories', async () => {
  const { body } = await get(`/api/chargers?bbox=${GOULBURN_BBOX}&categories=dc`);
  assert.ok(body.markers.length > 0);
  assert.ok(body.markers.every((m) => m.category === 'dc'));
});

test('markers are ordered usable-first', async () => {
  const { body } = await get(`/api/chargers?bbox=${GOULBURN_BBOX}`);
  const order = ['dc', 'dc_unconfirmed', 'ac', 'incompatible'];
  const ranks = body.markers.map((m) => order.indexOf(m.category));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test('detail: unknown fee is never free, and warnings are present', async () => {
  const { body: list } = await get(`/api/chargers?bbox=${GOULBURN_BBOX}&categories=dc`);
  for (const m of list.markers) {
    const { status, body } = await get(`/api/chargers/${encodeURIComponent(m.id)}`);
    assert.equal(status, 200);
    assert.ok(['paid', 'unknown'].includes(body.fee), `fee ${body.fee}`);
    if (body.fee === 'unknown') assert.ok(body.warnings.some((w) => w.startsWith('Fee unknown')));
    if (body.kw === null) assert.ok(body.warnings.some((w) => w.includes('assume 50 kW')));
  }
});

test('detail for a missing site is 404', async () => {
  const { status } = await get('/api/chargers/does-not-exist');
  assert.equal(status, 404);
});

test('bad bbox and unknown vehicle are 400', async () => {
  assert.equal((await get('/api/chargers?bbox=1,2,3')).status, 400);
  assert.equal((await get('/api/chargers?bbox=150,-34,149,-35')).status, 400);
  assert.equal((await get('/api/chargers?bbox=1.2.3,1,2,3')).status, 400);
  assert.equal((await get(`/api/chargers?bbox=${GOULBURN_BBOX}&vehicle=nope`)).status, 400);
});

test('config never exposes the Places key', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/config' });
  const places = process.env.GOOGLE_PLACES_API_KEY;
  if (places) assert.ok(!res.body.includes(places));
  assert.ok(!('googlePlacesApiKey' in res.json()));
});

test('sources include attribution for OSM', async () => {
  const { body } = await get('/api/sources');
  assert.ok(body.some((s) => s.id === 'osm' && s.attribution.includes('OpenStreetMap')));
});

test('static files: page served, anything else 404', async () => {
  assert.equal((await app.inject({ url: '/' })).statusCode, 200);
  assert.equal((await app.inject({ url: '/../package.json' })).statusCode, 404);
});
