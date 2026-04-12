import type { CrucibleClient } from '@atlascrew/crucible-client';
import { renderOutput } from '../format.js';
import type { GlobalOptions } from '../parse.js';

export async function healthCommand(client: CrucibleClient, globals: GlobalOptions): Promise<number> {
  const health = await client.health();
  process.stdout.write(renderOutput(health, globals.format));
  return 0;
}
