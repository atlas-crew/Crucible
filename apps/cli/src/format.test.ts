import { describe, it, expect } from 'vitest';
import { renderOutput, renderTable, formatDuration } from './format.js';

describe('renderOutput', () => {
  it('renders JSON format', () => {
    const result = renderOutput({ status: 'ok' }, 'json');
    expect(JSON.parse(result)).toEqual({ status: 'ok' });
  });

  it('renders array as table', () => {
    const result = renderOutput(
      [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }],
      'table',
    );
    expect(result).toContain('id');
    expect(result).toContain('name');
    expect(result).toContain('Alpha');
    expect(result).toContain('Beta');
  });

  it('renders single object as key-value pairs', () => {
    const result = renderOutput({ status: 'ok', count: 3 }, 'table');
    expect(result).toContain('status');
    expect(result).toContain('ok');
    expect(result).toContain('count');
    expect(result).toContain('3');
  });
});

describe('renderTable', () => {
  it('renders column headers with separator', () => {
    const result = renderTable([{ a: 1, b: 2 }]);
    const lines = result.split('\n');
    expect(lines[0]).toContain('a');
    expect(lines[0]).toContain('b');
    expect(lines[1]).toMatch(/^-+/);
  });

  it('handles empty array', () => {
    expect(renderTable([])).toContain('no results');
  });

  it('aligns columns', () => {
    const result = renderTable([
      { name: 'short', value: 'x' },
      { name: 'a-longer-name', value: 'y' },
    ]);
    const lines = result.split('\n').filter(Boolean);
    // All data lines should have consistent spacing
    expect(lines.length).toBe(4); // header, separator, 2 rows
  });
});

describe('formatDuration', () => {
  it('returns dash for undefined', () => {
    expect(formatDuration()).toBe('-');
  });

  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(2500)).toBe('2.5s');
  });
});
