import {
  MatchTracksRequestSchema,
  SearchTracksQuerySchema,
  type MatchTracksResponse,
  type SearchTracksResponse,
} from '@setlist/shared';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { requireSession } from '../auth/auth.routes';
import type { AuthService } from '../auth/auth.service';
import type { TrackMatchingService } from './track-matching.service';

export function registerTrackRoutes(
  app: FastifyInstance,
  deps: { tracks: TrackMatchingService; auth: AuthService; authenticate: preHandlerHookHandler },
): void {
  const { tracks, auth, authenticate } = deps;

  app.post('/api/tracks/match', { preHandler: authenticate }, async (request): Promise<MatchTracksResponse> => {
    const body = MatchTracksRequestSchema.parse(request.body);
    const accessToken = await auth.getAccessToken(requireSession(request));
    return { matches: await tracks.matchSongs(accessToken, body) };
  });

  app.get('/api/tracks/search', { preHandler: authenticate }, async (request): Promise<SearchTracksResponse> => {
    const { q } = SearchTracksQuerySchema.parse(request.query);
    const accessToken = await auth.getAccessToken(requireSession(request));
    return { tracks: await tracks.searchTracks(accessToken, q) };
  });
}
