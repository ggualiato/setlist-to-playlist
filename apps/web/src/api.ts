import {
  ApiErrorResponseSchema,
  CreatePlaylistResponseSchema,
  ImportSetlistResponseSchema,
  MatchTracksResponseSchema,
  MeResponseSchema,
  SearchTracksResponseSchema,
  type CreatePlaylistRequest,
  type CreatePlaylistResponse,
  type ErrorCode,
  type Setlist,
  type SessionUser,
  type TrackCandidate,
  type TrackMatch,
} from '@setlist/shared';
import type { ZodType } from 'zod';

export class ApiClientError extends Error {
  constructor(
    readonly code: ErrorCode | 'network' | 'invalid_response',
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/** Everything the UI needs from the backend; swapped for a fake in tests. */
export interface Api {
  getMe(): Promise<SessionUser | null>;
  importSetlist(url: string): Promise<Setlist>;
  matchTracks(setlist: Setlist): Promise<TrackMatch[]>;
  searchTracks(query: string): Promise<TrackCandidate[]>;
  createPlaylist(request: CreatePlaylistRequest): Promise<CreatePlaylistResponse>;
  logout(): Promise<void>;
}

export function createApi(fetchFn: typeof fetch = (...args) => fetch(...args)): Api {
  async function send(path: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetchFn(path, {
        credentials: 'same-origin',
        ...init,
        headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      });
    } catch {
      throw new ApiClientError('network', 'Could not reach the server. Check your connection and try again.', 0);
    }
    if (response.ok) return response;

    const parsed = ApiErrorResponseSchema.safeParse(await response.json().catch(() => null));
    if (parsed.success) throw new ApiClientError(parsed.data.error.code, parsed.data.error.message, response.status);
    throw new ApiClientError('upstream_error', `Unexpected server response (${response.status}).`, response.status);
  }

  async function requestJson<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
    const response = await send(path, init);
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new ApiClientError('invalid_response', 'The server sent an unexpected response.', response.status);
    return parsed.data;
  }

  const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

  return {
    async getMe() {
      return (await requestJson('/api/auth/me', MeResponseSchema)).user;
    },
    async importSetlist(url) {
      return (await requestJson('/api/setlists/import', ImportSetlistResponseSchema, post({ url }))).setlist;
    },
    async matchTracks(setlist) {
      const body = {
        artistName: setlist.artist.name,
        songs: setlist.songs.map(({ position, title, coverOf, withArtist }) => ({ position, title, coverOf, withArtist })),
      };
      return (await requestJson('/api/tracks/match', MatchTracksResponseSchema, post(body))).matches;
    },
    async searchTracks(query) {
      const path = `/api/tracks/search?${new URLSearchParams({ q: query }).toString()}`;
      return (await requestJson(path, SearchTracksResponseSchema)).tracks;
    },
    createPlaylist(request) {
      return requestJson('/api/playlists', CreatePlaylistResponseSchema, post(request));
    },
    async logout() {
      await send('/api/auth/logout', { method: 'POST' });
    },
  };
}
