import { CreatePlaylistRequestSchema, type CreatePlaylistResponse } from '@setlist/shared';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireSession } from '../auth/auth.routes';
import type { AuthService } from '../auth/auth.service';
import type { PlaylistService } from './playlist.service';

export function registerPlaylistRoutes(
  app: FastifyInstance,
  deps: { playlists: PlaylistService; auth: AuthService; authenticate: preHandlerHookHandler },
): void {
  app.post('/api/playlists', { preHandler: deps.authenticate }, async (request, reply): Promise<CreatePlaylistResponse> => {
    const body = CreatePlaylistRequestSchema.parse(request.body);
    const accessToken = await deps.auth.getAccessToken(requireSession(request));
    const result = await deps.playlists.create(accessToken, body);
    void reply.status(201);
    return result;
  });
}
