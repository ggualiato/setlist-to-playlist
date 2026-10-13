import type { Setlist, TrackCandidate, TrackMatch } from '@setlist/shared';
import type { Api } from './api';

export const uri = (n: number): string => `spotify:track:${String(n).padStart(22, '0')}`;

export const track = (n: number, overrides: Partial<TrackCandidate> = {}): TrackCandidate => ({
  uri: uri(n),
  name: `Track ${n}`,
  artists: ['Radiohead'],
  album: 'Album',
  albumType: 'album',
  imageUrl: null,
  durationMs: 1000,
  externalUrl: `https://open.spotify.com/track/${n}`,
  ...overrides,
});

const song = (position: number, title: string, extra: Partial<Setlist['songs'][number]> = {}) => ({
  position,
  title,
  setName: null,
  encore: null,
  coverOf: null,
  withArtist: null,
  info: null,
  tape: false,
  ...extra,
});

export const setlist: Setlist = {
  id: '63de4613',
  url: 'https://www.setlist.fm/setlist/radiohead/2003/earls-court-london-england-63de4613.html',
  artist: { name: 'Radiohead', mbid: null },
  eventDate: '2003-08-23',
  venue: { name: "Earl's Court", city: 'London', country: 'United Kingdom' },
  tour: null,
  songs: [song(1, 'Karma Police'), song(2, 'Weird Fishes'), song(3, 'Secret Jam'), song(4, 'Karma Police', { encore: 1 })],
};

export const matches: TrackMatch[] = [
  { position: 1, status: 'matched', score: 1, selected: track(1), candidates: [track(1)] },
  { position: 2, status: 'uncertain', score: 0.7, selected: track(2, { name: 'Weird Fishes (Live)' }), candidates: [track(2), track(5, { name: 'Weird Fishes/Arpeggi' })] },
  { position: 3, status: 'not_found', score: 0, selected: null, candidates: [] },
  { position: 4, status: 'matched', score: 1, selected: track(1), candidates: [track(1)] },
];

export function fakeApi(overrides: Partial<Api> = {}): Api {
  return {
    getMe: () => Promise.resolve({ id: 'u1', displayName: 'Fan' }),
    importSetlist: () => Promise.resolve(setlist),
    matchTracks: () => Promise.resolve(matches),
    searchTracks: () => Promise.resolve([track(9, { name: 'Found by search' })]),
    createPlaylist: (request) =>
      Promise.resolve({ id: 'pl1', url: 'https://open.spotify.com/playlist/pl1', trackCount: request.trackUris.length }),
    logout: () => Promise.resolve(),
    ...overrides,
  };
}
