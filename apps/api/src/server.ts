import { buildApp } from './app';
import { loadConfig } from './config';
import { SetlistFmClient } from './integrations/setlistfm/client';
import { SpotifyApiClient } from './integrations/spotify/api-client';
import { SpotifyAuthClient } from './integrations/spotify/auth-client';
import { AuthService } from './modules/auth/auth.service';
import { SessionStore } from './modules/auth/session-store';
import { PlaylistService } from './modules/playlists/playlist.service';
import { SetlistService } from './modules/setlist/setlist.service';
import { TrackMatchingService } from './modules/tracks/track-matching.service';

async function main(): Promise<void> {
  const config = loadConfig();

  const spotifyApi = new SpotifyApiClient();
  const spotifyAuth = new SpotifyAuthClient({
    clientId: config.spotify.clientId,
    clientSecret: config.spotify.clientSecret,
    redirectUri: config.spotify.redirectUri,
  });

  const app = buildApp({
    config,
    auth: new AuthService(spotifyAuth, spotifyApi, new SessionStore()),
    setlists: new SetlistService(new SetlistFmClient({ apiKey: config.setlistFmApiKey })),
    tracks: new TrackMatchingService(spotifyApi),
    playlists: new PlaylistService(spotifyApi),
  });

  await app.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
