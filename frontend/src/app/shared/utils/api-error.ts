/**
 * Readable message from an API error response (see docs/api-conventions.md):
 *   { error: { code, message, details } }
 * Falls back to `fallback` for network errors or unexpected bodies.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const body = (error as { error?: unknown } | null)?.error;
  const apiError = (body as { error?: unknown } | null)?.error;
  const message = (apiError as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

/** Stable machine-readable code of an API error, e.g. 'CONFLICT', or null. */
export function apiErrorCode(error: unknown): string | null {
  const code = ((error as { error?: { error?: { code?: unknown } } } | null)?.error?.error)?.code;
  return typeof code === 'string' ? code : null;
}
