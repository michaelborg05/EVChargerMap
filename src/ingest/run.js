// Ingest, step 1: run the vendored halans pipeline. It fetches NSW, VIC, ACT,
// QLD, TAS, OSM and Open Charge Map, normalises and merges them, and writes
// data/halans/cache/dataset.json. Step 2: load it into Postgres (load.js).
// Step 3: Tesla open-to-all data from supercharge.info (superchargers.js).
//
//   node src/ingest/run.js            fetch fresh from every source
//   node src/ingest/run.js --offline  reuse files already in data/halans/raw
import path from 'node:path';
import { createRequire } from 'node:module';
import { pool } from '../db.js';
import { loadDataset } from './load.js';
import { loadSuperchargers } from './superchargers.js';

// Point halans at our gitignored data folder. This must be set before the
// require() below, because halans reads it when its modules load.
process.env.EVMAP_DATA_DIR ??= path.join(import.meta.dirname, '..', '..', 'data', 'halans');

// createRequire gives ESM code a CommonJS-style require(), so we can load the
// vendored CommonJS modules exactly as upstream does.
const require = createRequire(import.meta.url);
const pipeline = require('../../vendor/halans/src/pipeline.js');

const offline = process.argv.includes('--offline');
const ocmKey = process.env.OPENCHARGE_API_KEY;
if (!ocmKey && !offline) {
  console.warn('OPENCHARGE_API_KEY not set: the Open Charge Map source will likely fail');
}

// halans leaves OCM out by default because it needs a key, so list every source explicitly.
const SOURCES = ['osm', 'nsw', 'vic', 'qld', 'act', 'tas', 'ocm'];

const { dataset, report } = await pipeline.ingest({
  sources: SOURCES,
  offline,
  apiKeys: { ocm: ocmKey }, // halans passes this to its OCM source; never logged
  log: (m) => console.log(m),
});

pipeline.saveDataset(dataset);
pipeline.saveReport(report);

console.log('\ncounts:', dataset.counts);
console.log(`wrote ${path.relative(process.cwd(), pipeline.DATASET_PATH)}`);

const failed = report.sources.filter((s) => s.error);
if (failed.length) {
  // Still load: halans keeps going without a failed source, and a missing
  // source is better than no data. The warning (and exit code) says which.
  console.error(`WARNING: ${failed.length} source(s) failed: ${failed.map((s) => s.sourceId).join(', ')}`);
  process.exitCode = 1;
}

// Step 2: replace open-data rows in Postgres.
// Step 3: Tesla open-to-all data. A failure here keeps the previous
// supercharger table, so the chargers loaded in step 2 still stand.
try {
  await loadDataset(pipeline.DATASET_PATH);
  try {
    await loadSuperchargers({ offline });
  } catch (err) {
    console.error(`WARNING: supercharge.info step failed, kept previous data: ${err.message}`);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
