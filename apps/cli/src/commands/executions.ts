import type { CrucibleClient, ListExecutionsParams, ExecutionStatus, ExecutionMode } from '@atlascrew/crucible-client';
import { renderOutput, renderTable, formatDuration } from '../format.js';
import { readFlag } from '../parse.js';
import type { GlobalOptions } from '../parse.js';

export async function executionsCommand(
  client: CrucibleClient,
  globals: GlobalOptions,
  args: string[],
): Promise<number> {
  // Sub-command: "executions get <id>"
  if (args[0] === 'get') {
    return executionGetCommand(client, globals, args.slice(1));
  }

  const params: ListExecutionsParams = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--scenario' || arg.startsWith('--scenario=')) {
      params.scenarioId = readFlag(arg, args[i + 1], '--scenario');
      if (arg === '--scenario') i++;
    } else if (arg === '--status' || arg.startsWith('--status=')) {
      const val = readFlag(arg, args[i + 1], '--status');
      if (arg === '--status') i++;
      params.status = val.split(',') as ExecutionStatus[];
    } else if (arg === '--mode' || arg.startsWith('--mode=')) {
      params.mode = readFlag(arg, args[i + 1], '--mode') as ExecutionMode;
      if (arg === '--mode') i++;
    } else if (arg === '--limit' || arg.startsWith('--limit=')) {
      params.limit = Number(readFlag(arg, args[i + 1], '--limit'));
      if (arg === '--limit') i++;
    } else if (arg === 'list') {
      // explicit "list" sub-command — no-op, already listing
    } else {
      process.stderr.write(`Unknown option: ${arg}\n`);
      return 1;
    }
  }

  const executions = await client.executions.list(params);

  if (globals.format === 'json') {
    process.stdout.write(renderOutput(executions, 'json'));
    return 0;
  }

  if (executions.length === 0) {
    process.stdout.write('No executions found.\n');
    return 0;
  }

  const rows = executions.map((e) => ({
    id: e.id.slice(0, 8),
    scenario: e.scenarioId,
    mode: e.mode,
    status: e.status,
    score: e.report?.score != null ? `${e.report.score}%` : '-',
    duration: formatDuration(e.duration),
  }));

  process.stdout.write(renderTable(rows));
  return 0;
}

async function executionGetCommand(
  client: CrucibleClient,
  globals: GlobalOptions,
  args: string[],
): Promise<number> {
  const id = args[0];
  if (!id) {
    process.stderr.write('Usage: crucible-cli executions get <id>\n');
    return 1;
  }

  const execution = await client.executions.get(id);
  process.stdout.write(renderOutput(execution, globals.format));
  return 0;
}
