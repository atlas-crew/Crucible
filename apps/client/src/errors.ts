/**
 * Error thrown when the Crucible API returns a non-2xx response.
 *
 * Inspect `.status` for HTTP status code branching (404 vs 409 vs 500, etc.)
 * and `.body` for the parsed error payload from the server.
 */
export class CrucibleApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: { error: string } | undefined;

  constructor(status: number, statusText: string, body?: { error: string }) {
    const message = body?.error ?? `${status} ${statusText}`;
    super(message);
    this.name = 'CrucibleApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}
