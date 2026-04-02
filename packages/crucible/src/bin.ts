#!/usr/bin/env node

import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { runCli } from '../../../apps/demo-dashboard/src/cli/assess-command.js';
import { fileURLToPath } from 'url';
import { startCrucibleServer } from './server.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagedScenariosDir = resolve(packageRoot, 'scenarios');
if (!process.env.CRUCIBLE_SCENARIOS_DIR && existsSync(packagedScenariosDir)) {
  process.env.CRUCIBLE_SCENARIOS_DIR = packagedScenariosDir;
}

const [command = 'start', ...args] = process.argv.slice(2);

if (command === 'start' || command === 'serve') {
  const server = await startCrucibleServer();

  const shutdown = () => {
    void server.close().finally(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} else if (command === 'assess') {
  process.argv = [process.argv[0], process.argv[1], ...args];
  process.exitCode = await runCli();
} else if (command === 'help' || command === '--help' || command === '-h') {
  console.log(`Usage: crucible [start|serve|assess]

start, serve  Start the unified Crucible web and API server
assess        Run the existing assessment CLI
`);
} else {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}
