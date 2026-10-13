import cookie from '@fastify/cookie';
import type { ErrorCode } from '@setlist/shared';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import type { AppConfig } from './config';
import { AppError } from './errors';
import { createAuthenticate, registerAuthRoutes } from './modules/auth/auth.routes';
import type { AuthService } from './modules/auth/auth.service';
import type { PlaylistService } from './modules/playlists/playlist.service';
import { registerPlaylistRoutes } from './modules/playlists/playlists.routes';
import type { SetlistService } from './modules/setlist/setlist.service';
import { registerSetlistRoutes } from './modules/setlist/setlist.routes';
import type { TrackMatchingService } from './modules/tracks/track-matching.service';
import { registerTrackRoutes } from './modules/tracks/tracks.routes';

export interface AppDeps {
  config: AppConfig;
  auth: AuthService;
  setlists: SetlistService;
  tracks: TrackMatchingService;
  playlists: PlaylistService;
  logger?: FastifyServerOptions['logger'];
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function summarizeZodError(error: ZodError): string {
  // Paths and rule messages only; never echo submitted values.
  return error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const { config } = deps;
  const app = Fastify({
    logger: deps.logger ?? {
      level: config.logLevel,
      redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'], censor: '[redacted]' },
      serializers: {
        // OAuth callback URLs carry `code` and `state` in the query string; log the path only.
        req: (req: { method: string; url: string }) => ({ method: req.method, path: req.url.split('?')[0] }),
      },
    },
    bodyLimit: 64 * 1024,
  });

  void app.register(cookie);
  app.decorateRequest('session', null);

  // CSRF defence in depth on top of SameSite=Lax cookies: browsers always send Origin on
  // cross-site POSTs, so reject state-changing requests from any origin but our web app.
  app.addHook('onRequest', (request, _reply, done) => {
    const origin = request.headers.origin;
    if (!SAFE_METHODS.has(request.method) && origin !== undefined && origin !== config.webOrigin) {
      return done(new AppError('forbidden', 'Cross-origin request blocked.', 403));
    }
    done();
  });

  const authenticate = createAuthenticate(deps.auth);
  registerAuthRoutes(app, { auth: deps.auth, config });
  registerSetlistRoutes(app, { setlists: deps.setlists, authenticate });
  registerTrackRoutes(app, { tracks: deps.tracks, auth: deps.auth, authenticate });
  registerPlaylistRoutes(app, { playlists: deps.playlists, auth: deps.auth, authenticate });

  app.get('/api/health', () => ({ status: 'ok' }));

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { code: 'not_found' satisfies ErrorCode, message: 'Route not found.' } }),
  );

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: { code: 'invalid_request', message: summarizeZodError(error) } });
    }
    const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({ error: { code: 'invalid_request', message: 'Malformed request.' } });
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send({ error: { code: 'internal_error', message: 'Something went wrong.' } });
  });

  return app;
}
