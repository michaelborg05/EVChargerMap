// Starts the HTTP server. The app itself is built in app.js.
import { buildApp } from './app.js';
import { config } from './config.js';

const app = buildApp({ logger: true });

// host 0.0.0.0: Fastify defaults to localhost, which inside a container means
// "only this container" and Docker's port mapping couldn't reach it.
await app.listen({ port: config.port, host: '0.0.0.0' });

// Docker stops containers with SIGTERM; close cleanly so restarts are quick.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
