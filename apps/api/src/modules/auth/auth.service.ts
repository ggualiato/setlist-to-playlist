import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError, unauthorized } from '../../errors';
import type { SpotifyTokenSet } from '../../integrations/spotify/auth-client';
import type { Session, SessionStore } from './session-store';

export interface SpotifyAuthPort {
  buildAuthorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<SpotifyTokenSet>;
  refreshAccessToken(refreshToken: string): Promise<SpotifyTokenSet>;
}

export interface SpotifyProfilePort {
  getCurrentUser(accessToken: string): Promise<{ id: string; displayName: string }>;
}

/** Refresh slightly early so a token never expires mid-request. */
const REFRESH_MARGIN_MS = 60_000;

export class AuthService {
  private readonly refreshing = new Map<string, Promise<string>>();

  constructor(
    private readonly spotifyAuth: SpotifyAuthPort,
    private readonly spotifyProfile: SpotifyProfilePort,
    private readonly sessions: SessionStore,
    private readonly now: () => number = Date.now,
  ) {}

  /** Starts OAuth: the caller must persist `state` (httpOnly cookie) and verify it on callback. */
  beginLogin(): { state: string; authorizeUrl: string } {
    const state = randomBytes(24).toString('base64url');
    return { state, authorizeUrl: this.spotifyAuth.buildAuthorizeUrl(state) };
  }

  static isStateValid(expected: string | undefined, received: string | undefined): boolean {
    if (!expected || !received) return false;
    const a = Buffer.from(expected);
    const b = Buffer.from(received);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async completeLogin(code: string): Promise<Session> {
    const tokens = await this.spotifyAuth.exchangeCode(code);
    if (!tokens.refreshToken) throw new AppError('upstream_error', 'Spotify did not return a refresh token.', 502);
    const user = await this.spotifyProfile.getCurrentUser(tokens.accessToken);
    return this.sessions.create({
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: this.now() + tokens.expiresInSeconds * 1000,
    });
  }

  getSession(sessionId: string | undefined): Session | undefined {
    return this.sessions.get(sessionId);
  }

  logout(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Returns a valid Spotify access token for the session, refreshing it when needed. */
  async getAccessToken(session: Session): Promise<string> {
    if (session.accessTokenExpiresAt - REFRESH_MARGIN_MS > this.now()) return session.accessToken;

    // Concurrent requests share one refresh (refresh tokens may be rotated).
    const inFlight = this.refreshing.get(session.id);
    if (inFlight) return inFlight;

    const refresh = this.refresh(session).finally(() => this.refreshing.delete(session.id));
    this.refreshing.set(session.id, refresh);
    return refresh;
  }

  private async refresh(session: Session): Promise<string> {
    try {
      const tokens = await this.spotifyAuth.refreshAccessToken(session.refreshToken);
      session.accessToken = tokens.accessToken;
      session.accessTokenExpiresAt = this.now() + tokens.expiresInSeconds * 1000;
      if (tokens.refreshToken) session.refreshToken = tokens.refreshToken;
      return session.accessToken;
    } catch (error) {
      if (error instanceof AppError && error.code === 'unauthorized') {
        this.sessions.delete(session.id);
        throw unauthorized('Your Spotify session expired. Please sign in again.');
      }
      throw error;
    }
  }
}
