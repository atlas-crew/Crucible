export type OutputFormat = 'json' | 'table';

export interface GlobalOptions {
  server: string;
  timeout: number;
  format: OutputFormat;
}

export interface ParsedCommand {
  globals: GlobalOptions;
  command: string;
  args: string[];
}

const DEFAULT_SERVER = 'http://localhost:3000';
const DEFAULT_TIMEOUT = 30;

/**
 * Parse global options from the front of argv, return the remaining command + args.
 *
 * Global options (--server, --timeout, --format) are consumed from any position
 * before or interleaved with the command. The first non-flag, non-value token is the command.
 */
export function parseGlobals(argv: string[]): ParsedCommand {
  let server = process.env.CRUCIBLE_URL ?? DEFAULT_SERVER;
  let timeout = DEFAULT_TIMEOUT;
  let format: OutputFormat | undefined;
  let command = '';
  const args: string[] = [];
  let pastCommand = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (pastCommand) {
      args.push(arg);
      continue;
    }

    if (arg === '--server' || arg.startsWith('--server=')) {
      server = readFlag(arg, argv[i + 1], '--server');
      if (arg === '--server') i++;
      continue;
    }

    if (arg === '--timeout' || arg.startsWith('--timeout=')) {
      const val = readFlag(arg, argv[i + 1], '--timeout');
      if (arg === '--timeout') i++;
      const parsed = Number(val);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('--timeout must be a positive number of seconds');
      }
      timeout = parsed;
      continue;
    }

    if (arg === '--format' || arg.startsWith('--format=')) {
      const val = readFlag(arg, argv[i + 1], '--format');
      if (arg === '--format') i++;
      if (val !== 'json' && val !== 'table') {
        throw new Error('--format must be "json" or "table"');
      }
      format = val;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      command = 'help';
      pastCommand = true;
      continue;
    }

    if (arg.startsWith('-')) {
      // Unknown global flag — pass it to the command
      args.push(arg);
      pastCommand = true;
      continue;
    }

    command = arg;
    pastCommand = true;
  }

  const resolvedFormat = format ?? (process.stdout.isTTY ? 'table' : 'json');

  return {
    globals: { server: server.replace(/\/+$/, ''), timeout, format: resolvedFormat },
    command,
    args,
  };
}

/** Parse a --flag value or --flag=value. */
export function readFlag(arg: string, nextArg: string | undefined, flagName: string): string {
  if (arg.startsWith(`${flagName}=`)) {
    const value = arg.slice(flagName.length + 1).trim();
    if (!value) throw new Error(`${flagName} requires a value`);
    return value;
  }
  if (!nextArg || nextArg.startsWith('--')) {
    throw new Error(`${flagName} requires a value`);
  }
  return nextArg;
}

export function isHelpFlag(value: string): boolean {
  return value === '--help' || value === '-h';
}

/**
 * Basic client-side URL validation for the --target flag. The REST endpoint
 * is the authoritative validator (rejects credentials, fragments, etc.); this
 * just catches obvious typos before the network round trip.
 */
export function validateTargetUrlInput(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`--target must be a valid URL (got "${value}")`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('--target must use http or https');
  }
  return value;
}
