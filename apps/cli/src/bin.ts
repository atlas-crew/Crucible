import { CrucibleClient, CrucibleApiError } from '@atlascrew/crucible-client';
import { parseGlobals } from './parse.js';
import { healthCommand } from './commands/health.js';
import { scenariosCommand } from './commands/scenarios.js';
import { assessCommand } from './commands/assess.js';
import { simulateCommand } from './commands/simulate.js';
import { executionsCommand } from './commands/executions.js';
import { reportsCommand } from './commands/reports.js';

const HELP = `Usage: crucible-cli [options] <command> [command-options]

Commands:
  health                    Check server health
  scenarios                 List all scenarios
  assess <scenario> [opts]  Run assessment, wait for result
  simulate <scenario>       Start a simulation
  executions [opts]         List executions
  executions get <id>       Get execution details
  reports <id> [opts]       Get or download assessment report

Global Options:
  --server <url>     Server URL (env: CRUCIBLE_URL, default: http://localhost:3000)
  --timeout <sec>    Request timeout in seconds (default: 30)
  --format <fmt>     Output format: json | table (default: auto-detect)
  --help, -h         Show this help message

Examples:
  crucible-cli health
  crucible-cli scenarios
  crucible-cli assess my-scenario --fail-below 90
  crucible-cli assess my-scenario --target https://staging.example.com
  crucible-cli simulate my-scenario -t https://prod.example.com
  crucible-cli executions --status running,completed --limit 20
  crucible-cli reports abc123 --download pdf -o report.pdf
`;

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseGlobals(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    return 1;
  }

  const { globals, command, args } = parsed;

  if (!command || command === 'help') {
    process.stdout.write(HELP);
    return command ? 0 : 1;
  }

  const client = new CrucibleClient({
    baseUrl: globals.server,
    timeout: globals.timeout * 1000,
  });

  switch (command) {
    case 'health':
      return healthCommand(client, globals);
    case 'scenarios':
      return scenariosCommand(client, globals);
    case 'assess':
      return assessCommand(client, globals, args);
    case 'simulate':
      return simulateCommand(client, globals, args);
    case 'executions':
      return executionsCommand(client, globals, args);
    case 'reports':
      return reportsCommand(client, globals, args);
    default:
      process.stderr.write(`Unknown command: ${command}\n`);
      process.stdout.write(HELP);
      return 1;
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    if (error instanceof CrucibleApiError) {
      process.stderr.write(`API error (${error.status}): ${error.message}\n`);
    } else if (error instanceof TypeError && error.message.includes('fetch')) {
      process.stderr.write(`Connection failed: could not reach server\n`);
    } else {
      process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    }
    process.exitCode = 1;
  });
