import express, { type Request, type Response } from 'express';
import { createServer } from 'http';
import { dirname, resolve } from 'path';
import next from 'next';
import { fileURLToPath } from 'url';
import { attachCrucibleBackend } from '../../../apps/demo-dashboard/src/server/backend.js';

export interface CrucibleServerHandle {
  close: () => Promise<void>;
}

export interface StartCrucibleServerOptions {
  host?: string;
  port?: number;
}

export async function startCrucibleServer(
  options: StartCrucibleServerOptions = {},
): Promise<CrucibleServerHandle> {
  const host = options.host ?? process.env.HOSTNAME ?? '0.0.0.0';
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const app = express();
  const server = createServer(app);
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const scenariosDir = resolve(packageRoot, 'scenarios');
  const webClientDir = resolve(packageRoot, 'web-client');

  const backend = attachCrucibleBackend(app, server, {
    port,
    scenariosDir,
    wsPath: '/ws',
    enableCors: false,
  });

  const nextApp = next({
    dev: false,
    dir: webClientDir,
    hostname: host,
    port,
  });

  await nextApp.prepare();

  const handle = nextApp.getRequestHandler();
  app.all('*', (req: Request, res: Response) => handle(req, res));

  await new Promise<void>((resolvePromise) => {
    server.listen(port, host, resolvePromise);
  });

  console.log(
    `Crucible server running on http://${host}:${port} (${backend.catalog.size} scenarios loaded, target: ${backend.engine.targetUrl}, db: ${backend.dbPath})`,
  );

  return {
    close: async () => {
      await new Promise<void>((resolvePromise, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolvePromise();
        });
      });
      backend.close();
      await nextApp.close();
    },
  };
}
