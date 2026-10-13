import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../../config';
import { unauthorized } from '../../errors';
import { AuthService } from './auth.service';
import type { Session } from './session-store';

export const SESSION_COOKIE = 'sid';
export const STATE_COOKIE = 'oauth_state';
const STATE_COOKIE_MAX_AGE_SECONDS = 10 * 60;
const SESSION_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

declare module 'fastify' {
  interface FastifyRequest {
    session: Session | null;
  }
}

const CallbackQuerySchema = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(256).optional(),
  error: z.string().max(100).optional(),
});

/** preHandler: resolves the session cookie or rejects with 401. */
export function createAuthenticate(auth: AuthService) {
  return (request: FastifyRequest, _reply: FastifyReply, done: (error?: Error) => void): void => {
    const session = auth.getSession(request.cookies[SESSION_COOKIE]);
    if (!session) return done(unauthorized());
    request.session = session;
    done();
  };
}

/** Handlers behind `authenticate` call this to get the session without non-null assertions. */
export function requireSession(request: FastifyRequest): Session {
  if (!request.session) throw unauthorized();
  return request.session;
}

export function registerAuthRoutes(app: FastifyInstance, deps: { auth: AuthService; config: AppConfig }): void {
  const { auth, config } = deps;
  const cookieBase = { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure } as const;
  const failRedirect = (reply: FastifyReply, reason: string) =>
    reply.clearCookie(STATE_COOKIE, { path: '/api/auth' }).redirect(`${config.webOrigin}/?auth_error=${reason}`);

  app.get('/api/auth/login', (_request, reply) => {
    const { state, authorizeUrl } = auth.beginLogin();
    return reply
      .setCookie(STATE_COOKIE, state, { ...cookieBase, path: '/api/auth', maxAge: STATE_COOKIE_MAX_AGE_SECONDS })
      .redirect(authorizeUrl);
  });

  app.get('/api/auth/callback', async (request, reply) => {
    const query = CallbackQuerySchema.safeParse(request.query);
    if (!query.success) return failRedirect(reply, 'invalid_callback');

    // State is verified first, even for error callbacks, so forged requests are ignored uniformly.
    if (!AuthService.isStateValid(request.cookies[STATE_COOKIE], query.data.state)) {
      return failRedirect(reply, 'state_mismatch');
    }
    if (query.data.error || !query.data.code) return failRedirect(reply, 'access_denied');

    try {
      const session = await auth.completeLogin(query.data.code);
      return reply
        .clearCookie(STATE_COOKIE, { path: '/api/auth' })
        .setCookie(SESSION_COOKIE, session.id, { ...cookieBase, path: '/', maxAge: SESSION_COOKIE_MAX_AGE_SECONDS })
        .redirect(`${config.webOrigin}/`);
    } catch (error) {
      request.log.warn({ err: error instanceof Error ? error.message : 'unknown' }, 'spotify login failed');
      return failRedirect(reply, 'login_failed');
    }
  });

  app.get('/api/auth/me', (request) => {
    const session = auth.getSession(request.cookies[SESSION_COOKIE]);
    return { user: session?.user ?? null };
  });

  app.post('/api/auth/logout', (request, reply) => {
    const sid = request.cookies[SESSION_COOKIE];
    if (sid) auth.logout(sid);
    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).status(204).send();
  });
}
