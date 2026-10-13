import type { TrackCandidate } from '@setlist/shared';

let counter = 0;

/** Builds a syntactically valid 22-char Spotify id from a counter. */
export const spotifyUri = (n: number): string => `spotify:track:${String(n).padStart(22, '0')}`;

export function makeTrack(overrides: Partial<TrackCandidate> = {}): TrackCandidate {
  counter += 1;
  return {
    uri: spotifyUri(counter),
    name: 'Karma Police',
    artists: ['Radiohead'],
    album: 'OK Computer',
    albumType: 'album',
    imageUrl: null,
    durationMs: 264_000,
    externalUrl: null,
    ...overrides,
  };
}
