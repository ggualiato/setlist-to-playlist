import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../errors';
import { AuthService, type SpotifyAuthPort } from './auth.service';
import { SessionStore } from './session-store';

function setup(now = { t: 1_000_000 }) {
  const spotifyAuth = {
    buildAuthorizeUrl: vi.fn((state: string) => `https://accounts.spotify.com/authorize?state=${state}`),
    exchangeCode: vi.fn<SpotifyAuthPort['exchangeCode']>().mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresInSeconds: 3600,
    }),
    refreshAccessToken: vi.fn<SpotifyAuthPort['refreshAccessToken']>().mockResolvedValue({
      accessToken: 'access-2',
      refreshToken: null,
      expiresInSeconds: 3600,
    }),
  };
  const profile = { getCurrentUser: vi.fn().mockResolvedValue({ id: 'u1', displayName: 'User One' }) };
  const store = new SessionStore(60_000 * 60, () => now.t);
  const service = new AuthService(spotifyAuth, profile, store, () => now.t);
  return { spotifyAuth, profile, store, service, now };
}

describe('AuthService', () => {
  it('generates unique, unguessable states', () => {
    const { service } = setup();
    const a = service.beginLogin();
    const b = service.beginLogin();
    expect(a.state).not.toBe(b.state);
    expect(a.state.length).toBeGreaterThanOrEqual(32);
    expect(a.authorizeUrl).toContain(a.state);
  });

  it('compares OAuth state safely', () => {
    expect(AuthService.isStateValid('abc', 'abc')).toBe(true);
    expect(AuthService.isStateValid('abc', 'abd')).toBe(false);
    expect(AuthService.isStateValid('abc', 'abcd')).toBe(false);
    expect(AuthService.isStateValid(undefined, 'abc')).toBe(false);
    expect(AuthService.isStateValid('abc', undefined)).toBe(false);
    expect(AuthService.isStateValid('', '')).toBe(false);
  });

  it('creates a session bound to the Spotify user after login', async () => {
    const { service, profile } = setup();
    const session = await service.completeLogin('code');
    expect(profile.getCurrentUser).toHaveBeenCalledWith('access-1');
    expect(session.user).toEqual({ id: 'u1', displayName: 'User One' });
    expect(service.getSession(session.id)).toBe(session);
  });

  it('returns the cached token while valid and refreshes near expiry', async () => {
    const { service, spotifyAuth, now } = setup();
    const session = await service.completeLogin('code');

    await expect(service.getAccessToken(session)).resolves.toBe('access-1');
    expect(spotifyAuth.refreshAccessToken).not.toHaveBeenCalled();

    now.t += 3600_000 - 30_000; // inside the 60s margin
    await expect(service.getAccessToken(session)).resolves.toBe('access-2');
    expect(spotifyAuth.refreshAccessToken).toHaveBeenCalledWith('refresh-1');
    expect(session.refreshToken).toBe('refresh-1'); // not rotated -> kept
  });

  it('keeps a rotated refresh token', async () => {
    const { service, spotifyAuth, now } = setup();
    spotifyAuth.refreshAccessToken.mockResolvedValue({ accessToken: 'a3', refreshToken: 'r3', expiresInSeconds: 3600 });
    const session = await service.completeLogin('code');
    now.t += 3600_000;
    await service.getAccessToken(session);
    expect(session.refreshToken).toBe('r3');
  });

  it('shares one refresh between concurrent requests', async () => {
    const { service, spotifyAuth, now } = setup();
    const session = await service.completeLogin('code');
    now.t += 3600_000;
    const tokens = await Promise.all([service.getAccessToken(session), service.getAccessToken(session)]);
    expect(tokens).toEqual(['access-2', 'access-2']);
    expect(spotifyAuth.refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('drops the session when the refresh token is rejected', async () => {
    const { service, spotifyAuth, now } = setup();
    spotifyAuth.refreshAccessToken.mockRejectedValue(new AppError('unauthorized', 'nope', 401));
    const session = await service.completeLogin('code');
    now.t += 3600_000;
    await expect(service.getAccessToken(session)).rejects.toMatchObject({ code: 'unauthorized' });
    expect(service.getSession(session.id)).toBeUndefined();
  });

  it('expires sessions after the TTL and supports logout', async () => {
    const { service, now } = setup();
    const a = await service.completeLogin('c');
    service.logout(a.id);
    expect(service.getSession(a.id)).toBeUndefined();

    const b = await service.completeLogin('c');
    now.t += 60_000 * 60 + 1;
    expect(service.getSession(b.id)).toBeUndefined();
  });
});
