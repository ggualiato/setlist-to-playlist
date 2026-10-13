import type { TrackCandidate } from '@setlist/shared';
import type { ZodType } from 'zod';
import { forbidden, rateLimited, unauthorized, upstreamError } from '../../errors';
import { fetchWithRetry, retryAfterSeconds, type HttpOptions } from '../http';
import {
  AddItemsResponseSchema,
  CreatedPlaylistSchema,
  CurrentUserSchema,
  SearchResponseSchema,
  type RawTrack,
} from './schemas';

const DEFAULT_BASE_URL = 'https://api.spotify.com/v1';
/** Search `limit` maximum since the February 2026 Development Mode changes. */
export const SEARCH_LIMIT_MAX = 10;
/** Spotify accepts at most 100 items per add-items request. */
export const ADD_ITEMS_BATCH_SIZE = 100;
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9]+$/;

export interface SpotifyApiClientOptions extends HttpOptions {
  baseUrl?: string;
}

export interface CreatePlaylistInput {
  name: string;
  description: string;
  isPublic: boolean;
}

export interface CreatedPlaylist {
  id: string;
  url: string;
}

export function toTrackCandidate(raw: RawTrack): TrackCandidate | null {
  const id = /^spotify:track:([A-Za-z0-9]{22})$/.exec(raw.uri)?.[1];
  // Skips local files / episodes should they ever appear.
  if (!id) return null;
  return {
    uri: raw.uri,
    name: raw.name,
    artists: raw.artists.map((a) => a.name),
    album: raw.album.name,
    albumType: raw.album.album_type ?? null,
    imageUrl: raw.album.images[raw.album.images.length > 1 ? 1 : 0]?.url ?? null,
    durationMs: Math.round(raw.duration_ms),
    externalUrl: raw.external_urls?.spotify ?? `https://open.spotify.com/track/${id}`,
  };
}

export class SpotifyApiClient {
  private readonly baseUrl: string;

  constructor(private readonly options: SpotifyApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  async getCurrentUser(accessToken: string): Promise<{ id: string; displayName: string }> {
    const me = await this.request(accessToken, 'GET', '/me', CurrentUserSchema);
    return { id: me.id, displayName: me.display_name?.trim() || me.id };
  }

  async searchTracks(accessToken: string, query: string, limit = SEARCH_LIMIT_MAX): Promise<TrackCandidate[]> {
    const params = new URLSearchParams({
      q: query,
      type: 'track',
      limit: String(Math.min(Math.max(limit, 1), SEARCH_LIMIT_MAX)),
    });
    const result = await this.request(accessToken, 'GET', `/search?${params.toString()}`, SearchResponseSchema);
    return result.tracks.items.flatMap((item) => {
      const candidate = item ? toTrackCandidate(item) : null;
      return candidate ? [candidate] : [];
    });
  }

  /** POST /me/playlists (replaces the removed POST /users/{id}/playlists). */
  async createPlaylist(accessToken: string, input: CreatePlaylistInput): Promise<CreatedPlaylist> {
    const created = await this.request(accessToken, 'POST', '/me/playlists', CreatedPlaylistSchema, {
      name: input.name,
      description: input.description,
      public: input.isPublic,
    });
    return { id: created.id, url: created.external_urls.spotify };
  }

  /** POST /playlists/{id}/items in batches of 100, preserving order (replaces the deprecated /tracks). */
  async addItems(accessToken: string, playlistId: string, uris: readonly string[]): Promise<void> {
    if (!PLAYLIST_ID_PATTERN.test(playlistId)) throw upstreamError('Spotify returned an invalid playlist id.');
    for (let i = 0; i < uris.length; i += ADD_ITEMS_BATCH_SIZE) {
      await this.request(
        accessToken,
        'POST',
        `/playlists/${playlistId}/items`,
        AddItemsResponseSchema,
        { uris: uris.slice(i, i + ADD_ITEMS_BATCH_SIZE) },
      );
    }
  }

  private async request<T>(
    accessToken: string,
    method: 'GET' | 'POST',
    path: string,
    schema: ZodType<T>,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetchWithRetry(
      'Spotify',
      `${this.baseUrl}${path}`,
      { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
      this.options,
    );

    if (response.status === 401) throw unauthorized('Your Spotify session expired. Please sign in again.');
    if (response.status === 403) {
      throw forbidden(
        'Spotify refused the request. In Development Mode, your Spotify account must be added to the app\'s user allowlist, and the app owner needs Premium.',
      );
    }
    if (response.status === 429) {
      const wait = retryAfterSeconds(response);
      throw rateLimited(`Spotify rate limit reached${wait === null ? '' : `; retry in ${Math.ceil(wait)}s`}.`);
    }
    if (!response.ok) throw upstreamError(`Spotify responded with status ${response.status}.`);

    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw upstreamError('Spotify returned an unexpected response shape.');
    return parsed.data;
  }
}
