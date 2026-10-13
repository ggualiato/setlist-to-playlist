import type { ErrorCode } from '@setlist/shared';

/** Error that is safe to show to the client: code + message are sent verbatim. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly statusCode: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}

export const invalidRequest = (message: string): AppError => new AppError('invalid_request', message, 400);
export const unauthorized = (message = 'Please sign in with Spotify.'): AppError =>
  new AppError('unauthorized', message, 401);
export const forbidden = (message: string): AppError => new AppError('forbidden', message, 403);
export const notFound = (message: string): AppError => new AppError('not_found', message, 404);
export const rateLimited = (message: string): AppError => new AppError('rate_limited', message, 429);
export const upstreamError = (message: string, cause?: unknown): AppError =>
  new AppError('upstream_error', message, 502, cause === undefined ? undefined : { cause });
