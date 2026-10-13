import { randomBytes } from 'node:crypto';
import type { SessionUser } from '@setlist/shared';

export interface Session {
  id: string;
  user: SessionUser;
  /** Spotify tokens never leave the server; the browser only holds the opaque session id. */
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  expiresAt: number;
}

export type NewSession = Omit<Session, 'id' | 'expiresAt'>;

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * In-memory store. Fine for a handful of users on one process; sessions are lost on restart
 * (users simply sign in again). Swap for a persistent store behind this interface if needed.
 */
export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly ttlMs = SESSION_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  create(input: NewSession): Session {
    this.sweep();
    const session: Session = { ...input, id: randomBytes(32).toString('base64url'), expiresAt: this.now() + this.ttlMs };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string | undefined): Session | undefined {
    if (!id) return undefined;
    const session = this.sessions.get(id);
    if (session && session.expiresAt <= this.now()) {
      this.sessions.delete(id);
      return undefined;
    }
    return session;
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  private sweep(): void {
    const now = this.now();
    for (const [id, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(id);
  }
}
