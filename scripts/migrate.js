// Applies db/migrations/*.sql in filename order, once each.
// Applied files are recorded in schema_migrations. Each file runs in its own
// transaction, so a failing migration leaves nothing half-applied.
// Works the same against the local container and Neon.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../src/db.js';

// import.meta.dirname is ESM's equivalent of CommonJS's __dirname.
const dir = path.join(import.meta.dirname, '..', 'db', 'migrations');

const client = await pool.connect(); // top-level await is allowed in ESM
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const { rows } = await client.query('SELECT filename FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`${file} failed: ${err.message}`);
    }
  }
  console.log(count ? `${count} migration(s) applied` : 'database is up to date');
} finally {
  client.release();
  await pool.end();
}
