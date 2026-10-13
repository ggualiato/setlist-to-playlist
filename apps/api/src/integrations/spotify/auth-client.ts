import { invalidRequest, rateLimited, unauthorized, upstreamError } from '../../errors';
import { fetchWithRetry, type HttpOptions } from '../http';
import { TokenResponseSchema } from './schemas';

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

/** Minimum scopes: create playlists (private by default, public on request) and add tracks. */
export const SPOTIFY_SCOPES = ['playlist-modify-private', 'playlist-modify-public'] as const;

export interface SpotifyTokenSet {
  accessToken: string;
  /** Null when Spotify did not rotate the refresh token; keep using the previous one. */
  refreshToken: string | null;
  expiresInSeconds: number;
}

export interface SpotifyAuthClientOptions extends HttpOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Authorization Code Flow (server-side, with client secret). Never log values handled here. */
export class SpotifyAuthClient {
  constructor(private readonly options: SpotifyAuthClientOptions) {}

  buildAuthorizeUrl(state: string): string {
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      client_id: this.options.clientId,
      response_type: 'code',
      redirect_uri: this.options.redirectUri,
      scope: SPOTIFY_SCOPES.join(' '),
      state,
    }).toString();
    return url.toString();
  }

  exchangeCode(code: string): Promise<SpotifyTokenSet> {
    return this.requestToken(
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.options.redirectUri }),
      'exchange',
    );
  }

  refreshAccessToken(refreshToken: string): Promise<SpotifyTokenSet> {
    return this.requestToken(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }), 'refresh');
  }

  private async requestToken(body: URLSearchParams, purpose: 'exchange' | 'refresh'): Promise<SpotifyTokenSet> {
    const basic = Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString('base64');
    const response = await fetchWithRetry(
      'Spotify',
      TOKEN_URL,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
      this.options,
    );

    if (response.status === 400 || response.status === 401) {
      // invalid_grant / invalid_client. Response bodies are deliberately not forwarded.
      throw purpose === 'refresh'
        ? unauthorized('Your Spotify session expired. Please sign in again.')
        : invalidRequest('Spotify rejected the sign-in request. Please try again.');
    }
    if (response.status === 429) throw rateLimited('Spotify rate limit reached. Try again shortly.');
    if (!response.ok) throw upstreamError(`Spotify token endpoint responded with status ${response.status}.`);

    const parsed = TokenResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw upstreamError('Spotify returned an unexpected token response.');
    return {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token ?? null,
      expiresInSeconds: parsed.data.expires_in,
    };
  }
}
