import express from 'express';
import { createServer } from 'http';
import { attachCrucibleBackend } from './backend.js';

const app = express();
const server = createServer(app);
const port = Number(process.env.PORT ?? 3001);

const backend = attachCrucibleBackend(app, server, { port });

server.listen(port, () => {
  console.log(
    `Demo Dashboard server running on port ${port} (${backend.catalog.size} scenarios loaded, target: ${backend.engine.targetUrl}, db: ${backend.dbPath})`,
  );
});

function shutdown() {
  console.log('Shutting down...');
  server.close(() => {
    backend.close();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
