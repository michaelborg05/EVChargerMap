// Builds the Fastify app. Kept separate from server.js so tests can create an
// app and call it with app.inject() without opening a port.
import fs from 'node:fs/promises';
import path from 'node:path';
import Fastify from 'fastify';
import { config } from './config.js';
import { pool, query } from './db.js';
import { getVehicle, DEFAULT_VEHICLE_ID } from './vehicles/index.js';
import { CATEGORIES, chargersInBox, chargerDetail, dataSources } from './chargers.js';

const PUBLIC_DIR = path.join(import.meta.dirname, '..', 'public');

// The only files served from public/. An explicit list means a crafted URL
// can never read anything else from disk.
const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
};

export function buildApp(opts = {}) {
  const app = Fastify({ logger: opts.logger ?? false });

  // Shared by the charger routes: ?vehicle=<id>, default the Atto 3.
  // Fastify's JSON schemas validate query strings before the handler runs.
  const vehicleQuery = { vehicle: { type: 'string', default: DEFAULT_VEHICLE_ID } };

  function vehicleOr400(id, reply) {
    const vehicle = getVehicle(id);
    if (!vehicle) reply.code(400).send({ error: `unknown vehicle "${id}"` });
    return vehicle;
  }

  app.get('/health', async (req, reply) => {
    try {
      const { rows } = await query('SELECT postgis_version() AS postgis');
      return { status: 'ok', db: 'ok', postgis: rows[0].postgis };
    } catch (err) {
      req.log.error({ msg: 'health check failed', err: err.message });
      return reply.code(503).send({ status: 'error', db: 'unreachable' });
    }
  });

  // Browser config. The Maps key is a browser key (restricted in Google
  // Cloud); the Places key is never sent.
  app.get('/api/config', async (req, reply) => {
    if (!config.keys.googleMaps) return reply.code(503).send({ error: 'GOOGLE_MAPS_API_KEY not set' });
    const v = getVehicle();
    return {
      googleMapsApiKey: config.keys.googleMaps,
      googleMapsMapId: config.googleMapsMapId,
      vehicle: { id: v.id, name: v.name, isTesla: v.isTesla, maxDcKw: v.maxDcKw, dcConnectors: v.dcConnectors },
    };
  });

  app.get('/api/chargers', {
    schema: {
      querystring: {
        type: 'object',
        required: ['bbox'],
        properties: {
          bbox: { type: 'string', pattern: '^-?[0-9.]+(,-?[0-9.]+){3}$' },   // minLng,minLat,maxLng,maxLat
          categories: { type: 'string' },                                    // comma list; default all
          ...vehicleQuery,
        },
      },
    },
  }, async (req, reply) => {
    const vehicle = vehicleOr400(req.query.vehicle, reply);
    if (!vehicle) return reply;
    const [minLng, minLat, maxLng, maxLat] = req.query.bbox.split(',').map(Number);
    const coords = [minLng, minLat, maxLng, maxLat];
    if (!coords.every(Number.isFinite) || minLng >= maxLng || minLat >= maxLat
        || Math.abs(minLat) > 90 || Math.abs(maxLat) > 90) {
      return reply.code(400).send({ error: 'bbox must be minLng,minLat,maxLng,maxLat' });
    }
    const categories = req.query.categories
      ? req.query.categories.split(',').filter((c) => CATEGORIES.includes(c))
      : CATEGORIES;
    return chargersInBox(vehicle, { minLng, minLat, maxLng, maxLat }, categories);
  });

  app.get('/api/chargers/:id', {
    schema: { querystring: { type: 'object', properties: vehicleQuery } },
  }, async (req, reply) => {
    const vehicle = vehicleOr400(req.query.vehicle, reply);
    if (!vehicle) return reply;
    const detail = await chargerDetail(vehicle, req.params.id);
    if (!detail) return reply.code(404).send({ error: 'not found' });
    return detail;
  });

  app.get('/api/sources', async () => dataSources());

  for (const [route, [file, type]] of Object.entries(STATIC_FILES)) {
    app.get(route, async (req, reply) => {
      // Read on each request so edits show up without a restart (tiny files).
      const body = await fs.readFile(path.join(PUBLIC_DIR, file));
      return reply.type(type).header('cache-control', 'no-cache').send(body);
    });
  }

  // Close the shared DB pool when the app closes (shutdown, or end of tests).
  app.addHook('onClose', async () => { await pool.end(); });

  return app;
}
