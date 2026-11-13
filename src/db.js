// One shared connection pool for the whole process.
// `pg` is CommonJS, so ESM imports its default export and destructures Pool.
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool({ connectionString: config.databaseUrl });

// Convenience wrapper: `await query('select $1::int', [1])`.
export function query(text, params) {
  return pool.query(text, params);
}
