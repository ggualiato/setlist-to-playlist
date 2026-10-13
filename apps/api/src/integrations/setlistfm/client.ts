import { notFound, rateLimited, upstreamError } from '../../errors';
import { fetchWithRetry, retryAfterSeconds, type HttpOptions } from '../http';
import { SetlistFmSetlistSchema, type SetlistFmSetlist } from './schemas';

const DEFAULT_BASE_URL = 'https://api.setlist.fm/rest/1.0';
const SETLIST_ID_PATTERN = /^[0-9a-f]{4,12}$/;

export interface SetlistFmClientOptions extends HttpOptions {
  apiKey: string;
  baseUrl?: string;
}

export class SetlistFmClient {
  private readonly baseUrl: string;

  constructor(private readonly options: SetlistFmClientOptions) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  async getSetlist(setlistId: string): Promise<SetlistFmSetlist> {
    // Defence in depth: the id is interpolated into a path on a fixed host.
    if (!SETLIST_ID_PATTERN.test(setlistId)) throw notFound('Setlist not found.');

    const response = await fetchWithRetry(
      'Setlist.fm',
      `${this.baseUrl}/setlist/${setlistId}`,
      { headers: { 'x-api-key': this.options.apiKey, Accept: 'application/json', 'Accept-Language': 'en' } },
      this.options,
    );

    if (response.status === 404) throw notFound('Setlist not found on Setlist.fm.');
    if (response.status === 429) {
      const wait = retryAfterSeconds(response);
      throw rateLimited(`Setlist.fm rate limit reached${wait === null ? '' : `; retry in ${Math.ceil(wait)}s`}.`);
    }
    if (response.status === 401 || response.status === 403) {
      throw upstreamError('Setlist.fm rejected the API key. Check SETLISTFM_API_KEY.');
    }
    if (!response.ok) throw upstreamError(`Setlist.fm responded with status ${response.status}.`);

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      throw upstreamError('Setlist.fm returned a non-JSON response.', cause);
    }
    const parsed = SetlistFmSetlistSchema.safeParse(body);
    if (!parsed.success) throw upstreamError('Setlist.fm returned an unexpected response shape.', parsed.error);
    return parsed.data;
  }
}
