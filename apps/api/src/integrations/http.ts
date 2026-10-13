import { upstreamError } from '../errors';

export type FetchFn = typeof fetch;

export interface HttpOptions {
  fetch?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
  /** Retries after a 429 that carries a short Retry-After. */
  maxRetries?: number;
  /** Longer Retry-After values are not waited for; the 429 is returned to the caller. */
  maxRetryDelayMs?: number;
  timeoutMs?: number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Parses a Retry-After header expressed in seconds. */
export function retryAfterSeconds(response: Response): number | null {
  const raw = response.headers.get('retry-after');
  if (raw === null) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

/**
 * fetch with a timeout and bounded retry on 429. Network failures and timeouts become
 * AppErrors that name the service but never include request details (which may hold secrets).
 */
export async function fetchWithRetry(
  service: string,
  url: string,
  init: RequestInit,
  options: HttpOptions = {},
): Promise<Response> {
  const fetchFn = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxRetries = options.maxRetries ?? 2;
  const maxRetryDelayMs = options.maxRetryDelayMs ?? 5_000;
  const timeoutMs = options.timeoutMs ?? 10_000;

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (cause) {
      throw upstreamError(`Could not reach ${service}. Try again shortly.`, cause);
    }

    if (response.status !== 429 || attempt >= maxRetries) return response;
    const delayMs = (retryAfterSeconds(response) ?? 1) * 1000;
    if (delayMs > maxRetryDelayMs) return response;
    await sleep(delayMs);
  }
}
