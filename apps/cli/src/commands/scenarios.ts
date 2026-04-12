import type { CrucibleClient } from '@atlascrew/crucible-client';
import { renderOutput, renderTable } from '../format.js';
import type { GlobalOptions } from '../parse.js';

export async function scenariosCommand(client: CrucibleClient, globals: GlobalOptions): Promise<number> {
  const scenarios = await client.scenarios.list();

  if (globals.format === 'json') {
    process.stdout.write(renderOutput(scenarios, 'json'));
    return 0;
  }

  if (scenarios.length === 0) {
    process.stdout.write('No scenarios found.\n');
    return 0;
  }

  const rows = scenarios.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category ?? '-',
    difficulty: s.difficulty ?? '-',
    steps: s.steps.length,
  }));

  process.stdout.write(renderTable(rows));
  return 0;
}
