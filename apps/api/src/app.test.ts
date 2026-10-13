import type { LightMyRequestResponse } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app';
import type { AppConfig } from './config';
import { AppError } from './errors';
import { SetlistFmSetlistSchema } from './integrations/setlistfm/schemas';
import { AuthService } from './modules/auth/auth.service';
import { SessionStore } from './modules/auth/session-store';
import { PlaylistService, type PlaylistPort } from './modules/playlists/playlist.service';
import { SetlistService } from './modules/setlist/setlist.service';
import { TrackMatchingService } from './modules/tracks/track-matching.service';
import { makeTrack, spotifyUri } from './testing/builders';
import { radioheadRaw } from './testing/fixtures/setlistfm';

const WEB = 'http://127.0.0.1:5173';
const config: AppConfig = {
  nodeEnv: 'test',
  port: 0,
  host: '127.0.0.1',
  logLevel: 'silent',
  webOrigin: WEB,
  cookieSecure: false,
  setlistFmApiKey: 'k',
  spotify: { clientId: 'cid', clientSecret: 'sec', redirectUri: `${WEB}/api/auth/callback` },
};

const SETLIST_URL = 'https://www.setlist.fm/setlist/radiohead/2003/earls-court-london-england-63de4613.html';

function setup() {
  const getSetlist = vi.fn().mockResolvedValue(SetlistFmSetlistSchema.parse(radioheadRaw));
  const searchTracks = vi.fn().mockResolvedValue([makeTrack()]);
  const createPlaylist = vi.fn<PlaylistPort['createPlaylist']>().mockResolvedValue({ id: 'pl1', url: 'https://open.spotify.com/playlist/pl1' });
  const addItems = vi.fn<PlaylistPort['addItems']>().mockResolvedValue();
  const spotifyAuth = {
    buildAuthorizeUrl: (state: string) => `https://accounts.spotify.com/authorize?state=${state}`,
    exchangeCode: vi.fn().mockResolvedValue({ accessToken: 'ACCESS-SECRET', refreshToken: 'REFRESH-SECRET', expiresInSeconds: 3600 }),
    refreshAccessToken: vi.fn(),
  };
  const auth = new AuthService(spotifyAuth, { getCurrentUser: vi.fn().mockResolvedValue({ id: 'u1', displayName: 'Fan' }) }, new SessionStore());
  const app = buildApp({
    config,
    auth,
    setlists: new SetlistService({ getSetlist }),
    tracks: new TrackMatchingService({ searchTracks }),
    playlists: new PlaylistService({ createPlaylist, addItems }),
    logger: false,
  });
  return { app, getSetlist, searchTracks, createPlaylist, addItems, spotifyAuth };
}

const cookieValue = (res: LightMyRequestResponse, name: string) => res.cookies.find((c) => c.name === name)?.value;

async function login(ctx: ReturnType<typeof setup>): Promise<string> {
  const start = await ctx.app.inject({ method: 'GET', url: '/api/auth/login' });
  const state = cookieValue(start, 'oauth_state');
  const callback = await ctx.app.inject({
    method: 'GET',
    url: `/api/auth/callback?code=abc&state=${state}`,
    cookies: { oauth_state: state ?? '' },
  });
  const sid = cookieValue(callback, 'sid');
  if (!sid) throw new Error('login failed in test setup');
  return sid;
}

describe('OAuth routes', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('redirects to Spotify with a state that is also stored in an httpOnly cookie', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/login' });
    expect(res.statusCode).toBe(302);
    const state = cookieValue(res, 'oauth_state');
    expect(state).toBeTruthy();
    expect(res.headers.location).toContain(`state=${state}`);
    expect(res.cookies.find((c) => c.name === 'oauth_state')).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
  });

  it('rejects a callback whose state does not match the cookie (CSRF)', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/callback?code=abc&state=forged',
      cookies: { oauth_state: 'real' },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${WEB}/?auth_error=state_mismatch`);
    expect(cookieValue(res, 'sid')).toBeUndefined();
    expect(ctx.spotifyAuth.exchangeCode).not.toHaveBeenCalled();
  });

  it('rejects a callback with no state cookie', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/callback?code=abc&state=x' });
    expect(res.headers.location).toContain('auth_error=state_mismatch');
  });

  it('reports user denial', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/auth/callback?error=access_denied&state=s',
      cookies: { oauth_state: 's' },
    });
    expect(res.headers.location).toBe(`${WEB}/?auth_error=access_denied`);
  });

  it('creates an opaque session cookie and never exposes Spotify tokens', async () => {
    const sid = await login(ctx);
    expect(sid).not.toContain('SECRET');

    const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid } });
    expect(me.json()).toEqual({ user: { id: 'u1', displayName: 'Fan' } });
    expect(me.body).not.toContain('SECRET');
  });

  it('redirects with an error when the token exchange fails', async () => {
    ctx.spotifyAuth.exchangeCode.mockRejectedValue(new AppError('invalid_request', 'bad', 400));
    const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/callback?code=abc&state=s', cookies: { oauth_state: 's' } });
    expect(res.headers.location).toBe(`${WEB}/?auth_error=login_failed`);
  });

  it('returns null user when signed out, and logout invalidates the session', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/auth/me' })).json()).toEqual({ user: null });

    const sid = await login(ctx);
    const out = await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: { sid }, headers: { origin: WEB } });
    expect(out.statusCode).toBe(204);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: { sid } })).json()).toEqual({ user: null });
  });
});

describe('protected API routes', () => {
  let ctx: ReturnType<typeof setup>;
  let sid: string;
  beforeEach(async () => {
    ctx = setup();
    sid = await login(ctx);
  });

  it.each([
    ['POST', '/api/setlists/import'],
    ['POST', '/api/tracks/match'],
    ['GET', '/api/tracks/search?q=x'],
    ['POST', '/api/playlists'],
  ] as const)('%s %s requires a session', async (method, url) => {
    const res = await ctx.app.inject({ method, url, payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('imports a setlist from a valid URL', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/setlists/import', cookies: { sid }, payload: { url: SETLIST_URL } });
    expect(res.statusCode).toBe(200);
    const { setlist } = res.json<{ setlist: { id: string; songs: unknown[] } }>();
    expect(setlist.id).toBe('63de4613');
    expect(setlist.songs).toHaveLength(9);
    expect(ctx.getSetlist).toHaveBeenCalledWith('63de4613');
  });

  it('rejects non-setlist.fm URLs without any outbound request (SSRF)', async () => {
    for (const url of ['http://169.254.169.254/latest/meta-data', 'https://evil.example/setlist/a/2020/b-1a2b3c4d.html']) {
      const res = await ctx.app.inject({ method: 'POST', url: '/api/setlists/import', cookies: { sid }, payload: { url } });
      expect(res.statusCode).toBe(400);
    }
    expect(ctx.getSetlist).not.toHaveBeenCalled();
  });

  it('passes upstream "not found" through with a stable error shape', async () => {
    ctx.getSetlist.mockRejectedValue(new AppError('not_found', 'Setlist not found on Setlist.fm.', 404));
    const res = await ctx.app.inject({ method: 'POST', url: '/api/setlists/import', cookies: { sid }, payload: { url: SETLIST_URL } });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: 'Setlist not found on Setlist.fm.' } });
  });

  it('validates request bodies', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/tracks/match', cookies: { sid }, payload: { artistName: '', songs: [] } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'invalid_request' } });
  });

  it('matches tracks for songs', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/tracks/match',
      cookies: { sid },
      payload: { artistName: 'Radiohead', songs: [{ position: 1, title: 'Karma Police', coverOf: null, withArtist: null }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ matches: Array<{ status: string }> }>().matches[0]?.status).toBe('matched');
    expect(ctx.searchTracks).toHaveBeenCalledWith('ACCESS-SECRET', expect.any(String));
  });

  it('searches tracks for manual replacement', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/tracks/search?q=creep', cookies: { sid } });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ tracks: unknown[] }>().tracks).toHaveLength(1);
  });

  it('creates a playlist preserving order and duplicates', async () => {
    const uris = [spotifyUri(3), spotifyUri(1), spotifyUri(3)];
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/playlists',
      cookies: { sid },
      headers: { origin: WEB },
      payload: { name: 'Radiohead @ Earls Court', trackUris: uris },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: 'pl1', url: 'https://open.spotify.com/playlist/pl1', trackCount: 3 });
    expect(ctx.createPlaylist).toHaveBeenCalledWith('ACCESS-SECRET', { name: 'Radiohead @ Earls Court', description: '', isPublic: false });
    expect(ctx.addItems).toHaveBeenCalledWith('ACCESS-SECRET', 'pl1', uris);
  });

  it('rejects invalid track URIs and empty playlists', async () => {
    for (const trackUris of [[], ['spotify:episode:abc'], ['not-a-uri']]) {
      const res = await ctx.app.inject({ method: 'POST', url: '/api/playlists', cookies: { sid }, payload: { name: 'x', trackUris } });
      expect(res.statusCode).toBe(400);
    }
    expect(ctx.createPlaylist).not.toHaveBeenCalled();
  });

  it('tells the user where the playlist is when adding tracks fails', async () => {
    ctx.addItems.mockRejectedValue(new AppError('rate_limited', 'Spotify rate limit reached.', 429));
    const res = await ctx.app.inject({ method: 'POST', url: '/api/playlists', cookies: { sid }, payload: { name: 'x', trackUris: [spotifyUri(1)] } });
    expect(res.statusCode).toBe(429);
    expect(res.json<{ error: { message: string } }>().error.message).toContain('https://open.spotify.com/playlist/pl1');
  });

  it('blocks state-changing requests from other origins', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/playlists',
      cookies: { sid },
      headers: { origin: 'https://evil.example' },
      payload: { name: 'x', trackUris: [spotifyUri(1)] },
    });
    expect(res.statusCode).toBe(403);
    expect(ctx.createPlaylist).not.toHaveBeenCalled();
  });

  it('hides internal error details', async () => {
    ctx.getSetlist.mockRejectedValue(new Error('db password=hunter2'));
    const res = await ctx.app.inject({ method: 'POST', url: '/api/setlists/import', cookies: { sid }, payload: { url: SETLIST_URL } });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('hunter2');
  });

  it('answers malformed JSON with 400', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/setlists/import',
      cookies: { sid },
      headers: { 'content-type': 'application/json' },
      payload: '{bad',
    });
    expect(res.statusCode).toBe(400);
  });
});
