import { describe, expect, it, vi } from 'vitest';
import { spotifyUri } from '../../testing/builders';
import { ADD_ITEMS_BATCH_SIZE, SpotifyApiClient } from './api-client';
import { SpotifyAuthClient } from './auth-client';

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init });

type Mock = ReturnType<typeof vi.fn>;
const asFetch = (m: Mock) => m as unknown as typeof fetch;
const apiClient = (m: Mock) => new SpotifyApiClient({ fetch: asFetch(m), sleep: () => Promise.resolve() });
const lastCall = (m: Mock, index = 0) => m.mock.calls[index] as [string, RequestInit];

describe('SpotifyAuthClient', () => {
  const client = (m: Mock = vi.fn()) =>
    new SpotifyAuthClient({
      clientId: 'cid',
      clientSecret: 'secret',
      redirectUri: 'http://127.0.0.1:5173/api/auth/callback',
      fetch: asFetch(m),
    });

  it('builds an authorize URL with state, redirect URI and minimal scopes', () => {
    const url = new URL(client().buildAuthorizeUrl('abc'));
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'cid',
      response_type: 'code',
      redirect_uri: 'http://127.0.0.1:5173/api/auth/callback',
      scope: 'playlist-modify-private playlist-modify-public',
      state: 'abc',
    });
    expect(url.toString()).not.toContain('secret');
  });

  it('exchanges a code using Basic auth and form encoding', async () => {
    const m = vi.fn().mockResolvedValue(json({ access_token: 'a', token_type: 'Bearer', expires_in: 3600, refresh_token: 'r' }));
    const tokens = await client(m).exchangeCode('the-code');
    expect(tokens).toEqual({ accessToken: 'a', refreshToken: 'r', expiresInSeconds: 3600 });

    const [url, init] = lastCall(m);
    expect(url).toBe('https://accounts.spotify.com/api/token');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Basic ${Buffer.from('cid:secret').toString('base64')}`);
    const form = init.body as URLSearchParams;
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('the-code');
  });

  it('refreshes tokens and reports a non-rotated refresh token as null', async () => {
    const m = vi.fn().mockResolvedValue(json({ access_token: 'new', token_type: 'Bearer', expires_in: 3600 }));
    await expect(client(m).refreshAccessToken('old')).resolves.toEqual({
      accessToken: 'new',
      refreshToken: null,
      expiresInSeconds: 3600,
    });
  });

  it('maps a rejected refresh to unauthorized and a rejected code to invalid_request', async () => {
    const m = vi.fn().mockResolvedValue(json({ error: 'invalid_grant' }, { status: 400 }));
    await expect(client(m).refreshAccessToken('old')).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(client(m).exchangeCode('bad')).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('rejects malformed token responses', async () => {
    const m = vi.fn().mockResolvedValue(json({ nope: true }));
    await expect(client(m).exchangeCode('c')).rejects.toMatchObject({ code: 'upstream_error' });
  });
});

describe('SpotifyApiClient', () => {
  const rawTrack = (n: number) => ({
    uri: spotifyUri(n),
    name: `Song ${n}`,
    duration_ms: 1000,
    artists: [{ name: 'A' }],
    album: { name: 'Alb', album_type: 'album', images: [{ url: 'big' }, { url: 'small' }] },
    external_urls: { spotify: `https://open.spotify.com/track/${n}` },
  });

  it('searches with type=track, a capped limit and a bearer token, skipping null/non-track items', async () => {
    const m = vi.fn().mockResolvedValue(
      json({ tracks: { items: [rawTrack(1), null, { ...rawTrack(2), uri: 'spotify:local:a:b:c:1' }] } }),
    );
    const tracks = await apiClient(m).searchTracks('tok', 'track:"x" artist:"y"', 50);

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ uri: spotifyUri(1), name: 'Song 1', artists: ['A'], imageUrl: 'small' });
    const [url, init] = lastCall(m);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/v1/search');
    expect(parsed.searchParams.get('limit')).toBe('10');
    expect(parsed.searchParams.get('q')).toBe('track:"x" artist:"y"');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
  });

  it('creates playlists via POST /me/playlists', async () => {
    const m = vi.fn().mockResolvedValue(json({ id: 'pl1', external_urls: { spotify: 'https://open.spotify.com/playlist/pl1' } }, { status: 201 }));
    const created = await apiClient(m).createPlaylist('tok', { name: 'N', description: 'D', isPublic: false });

    expect(created).toEqual({ id: 'pl1', url: 'https://open.spotify.com/playlist/pl1' });
    const [url, init] = lastCall(m);
    expect(url).toBe('https://api.spotify.com/v1/me/playlists');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'N', description: 'D', public: false });
  });

  it('adds items to /items in ordered batches of 100', async () => {
    const m = vi.fn().mockImplementation(() => Promise.resolve(json({ snapshot_id: 's' }, { status: 201 })));
    const uris = Array.from({ length: 250 }, (_, i) => spotifyUri(i % 7)); // includes duplicates
    await apiClient(m).addItems('tok', 'pl1', uris);

    expect(m).toHaveBeenCalledTimes(3);
    const batches = m.mock.calls.map((_, i) => (JSON.parse(lastCall(m, i)[1].body as string) as { uris: string[] }).uris);
    expect(batches.map((b) => b.length)).toEqual([ADD_ITEMS_BATCH_SIZE, ADD_ITEMS_BATCH_SIZE, 50]);
    expect(batches.flat()).toEqual(uris);
    expect(lastCall(m)[0]).toBe('https://api.spotify.com/v1/playlists/pl1/items');
  });

  it('rejects suspicious playlist ids before calling the network', async () => {
    const m = vi.fn();
    await expect(apiClient(m).addItems('tok', '../me', [spotifyUri(1)])).rejects.toMatchObject({ code: 'upstream_error' });
    expect(m).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [429, 'rate_limited'],
    [500, 'upstream_error'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const m = vi.fn().mockResolvedValue(new Response('{}', { status, headers: { 'retry-after': '99' } }));
    await expect(apiClient(m).getCurrentUser('tok')).rejects.toMatchObject({ code });
  });

  it('falls back to the user id when there is no display name', async () => {
    const m = vi.fn().mockResolvedValue(json({ id: 'u1', display_name: null }));
    await expect(apiClient(m).getCurrentUser('tok')).resolves.toEqual({ id: 'u1', displayName: 'u1' });
  });
});
