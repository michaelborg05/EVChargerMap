// Minimal HTTP server using Node's built-in `http` module.
// Stage 2a only needs /health; a framework decision can wait for Stage 2b.
import http from 'node:http';
import { config } from './config.js';
import { pool, query } from './db.js';

async function health(res) {
  try {
    const { rows } = await query('SELECT postgis_version() AS postgis');
    sendJson(res, 200, { status: 'ok', db: 'ok', postgis: rows[0].postgis });
  } catch (err) {
    // Log the message only: connection errors can include the URL.
    console.error('health check failed:', err.message);
    sendJson(res, 503, { status: 'error', db: 'unreachable' });
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') return health(res);
  sendJson(res, 404, { error: 'not found' });
});

server.listen(config.port, () => {
  console.log(`listening on port ${config.port}`);
});

// Docker stops containers with SIGTERM; close cleanly so restarts are quick.
process.on('SIGTERM', () => {
  server.close(() => pool.end().then(() => process.exit(0)));
});
