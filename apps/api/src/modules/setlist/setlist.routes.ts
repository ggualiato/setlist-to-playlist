import { ImportSetlistRequestSchema, type ImportSetlistResponse } from '@setlist/shared';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { SetlistService } from './setlist.service';

export function registerSetlistRoutes(
  app: FastifyInstance,
  deps: { setlists: SetlistService; authenticate: preHandlerHookHandler },
): void {
  // Requires a session so the Setlist.fm API key/quota can't be used anonymously.
  app.post('/api/setlists/import', { preHandler: deps.authenticate }, async (request): Promise<ImportSetlistResponse> => {
    const { url } = ImportSetlistRequestSchema.parse(request.body);
    return { setlist: await deps.setlists.importFromUrl(url) };
  });
}
