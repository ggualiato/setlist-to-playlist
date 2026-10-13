import type { CreatePlaylistResponse } from '@setlist/shared';
import { AppError } from '../../errors';
import type { CreatePlaylistInput, CreatedPlaylist } from '../../integrations/spotify/api-client';

export interface PlaylistPort {
  createPlaylist(accessToken: string, input: CreatePlaylistInput): Promise<CreatedPlaylist>;
  addItems(accessToken: string, playlistId: string, uris: readonly string[]): Promise<void>;
}

export interface CreatePlaylistCommand extends CreatePlaylistInput {
  trackUris: readonly string[];
}

export class PlaylistService {
  constructor(private readonly spotify: PlaylistPort) {}

  async create(accessToken: string, command: CreatePlaylistCommand): Promise<CreatePlaylistResponse> {
    const { trackUris, ...playlist } = command;
    const created = await this.spotify.createPlaylist(accessToken, playlist);

    try {
      await this.spotify.addItems(accessToken, created.id, trackUris);
    } catch (error) {
      // The empty playlist already exists on the user's account; tell them where it is.
      const reason = error instanceof AppError ? error.message : 'unexpected error';
      throw new AppError(
        error instanceof AppError && error.code === 'unauthorized' ? 'unauthorized' : 'upstream_error',
        `The playlist was created (${created.url}) but adding tracks failed: ${reason}`,
        error instanceof AppError ? error.statusCode : 502,
        { cause: error },
      );
    }
    return { id: created.id, url: created.url, trackCount: trackUris.length };
  }
}
