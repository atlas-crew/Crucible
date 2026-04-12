import type { OutputFormat } from './parse.js';

/**
 * Render an array of objects as either JSON or an ASCII table.
 */
export function renderOutput(data: unknown, format: OutputFormat): string {
  if (format === 'json') {
    return `${JSON.stringify(data, null, 2)}\n`;
  }

  if (Array.isArray(data) && data.length > 0) {
    return renderTable(data);
  }

  if (typeof data === 'object' && data !== null) {
    return renderKeyValue(data as Record<string, unknown>);
  }

  return `${JSON.stringify(data, null, 2)}\n`;
}

/** Render an array of objects as a columnar table. */
export function renderTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '(no results)\n';

  const headers = Object.keys(rows[0]);
  const stringRows = rows.map((row) =>
    headers.map((h) => formatCell(row[h])),
  );

  const widths = headers.map((header, i) =>
    Math.max(header.length, ...stringRows.map((row) => row[i].length)),
  );

  const renderRow = (cells: string[]) =>
    `${cells.map((cell, i) => cell.padEnd(widths[i])).join('  ')}\n`;

  let output = '';
  output += renderRow(headers);
  output += renderRow(widths.map((w) => '-'.repeat(w)));
  for (const row of stringRows) {
    output += renderRow(row);
  }
  return output;
}

/** Render a single object as key: value pairs. */
function renderKeyValue(obj: Record<string, unknown>): string {
  const maxKey = Math.max(...Object.keys(obj).map((k) => k.length));
  return Object.entries(obj)
    .map(([key, value]) => `${key.padEnd(maxKey)}  ${formatCell(value)}`)
    .join('\n') + '\n';
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Format millisecond duration for display. */
export function formatDuration(durationMs?: number): string {
  if (durationMs == null) return '-';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}
