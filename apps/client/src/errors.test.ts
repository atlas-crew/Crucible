import { describe, it, expect } from 'vitest';
import { CrucibleApiError } from './errors.js';

describe('CrucibleApiError', () => {
  it('uses body.error as message when available', () => {
    const err = new CrucibleApiError(404, 'Not Found', { error: 'Execution not found' });
    expect(err.message).toBe('Execution not found');
    expect(err.name).toBe('CrucibleApiError');
    expect(err.status).toBe(404);
    expect(err.statusText).toBe('Not Found');
    expect(err.body).toEqual({ error: 'Execution not found' });
  });

  it('falls back to "status statusText" when no body', () => {
    const err = new CrucibleApiError(500, 'Internal Server Error');
    expect(err.message).toBe('500 Internal Server Error');
    expect(err.body).toBeUndefined();
  });

  it('is an instance of Error', () => {
    const err = new CrucibleApiError(400, 'Bad Request');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CrucibleApiError);
  });
});
