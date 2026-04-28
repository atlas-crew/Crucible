import type { CrucibleClient } from '@atlascrew/crucible-client';
import { renderOutput } from '../format.js';
import { readFlag, validateTargetUrlInput } from '../parse.js';
import type { GlobalOptions } from '../parse.js';

export async function simulateCommand(
  client: CrucibleClient,
  globals: GlobalOptions,
  args: string[],
): Promise<number> {
  let scenarioId: string | undefined;
  let targetUrl: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--scenario' || arg.startsWith('--scenario=')) {
      scenarioId = readFlag(arg, args[i + 1], '--scenario');
      if (arg === '--scenario') i++;
    } else if (arg === '--target' || arg === '-t' || arg.startsWith('--target=')) {
      targetUrl = readFlag(arg, args[i + 1], '--target');
      if (arg === '--target' || arg === '-t') i++;
    } else if (!arg.startsWith('-')) {
      scenarioId = arg;
    } else {
      process.stderr.write(`Unknown option: ${arg}\n`);
      return 1;
    }
  }

  if (!scenarioId) {
    process.stderr.write('Usage: crucible-cli simulate <scenario-id> [--target <url>]\n');
    return 1;
  }

  if (targetUrl !== undefined) {
    try {
      validateTargetUrlInput(targetUrl);
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
      return 1;
    }
  }

  const result = await client.simulations.start(
    scenarioId,
    targetUrl !== undefined ? { targetUrl } : undefined,
  );
  process.stdout.write(renderOutput(result, globals.format));
  return 0;
}
