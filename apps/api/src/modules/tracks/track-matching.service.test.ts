import { describe, expect, it, vi } from 'vitest';
import { makeTrack } from '../../testing/builders';
import { TrackMatchingService, buildQueries, type TrackSearchPort } from './track-matching.service';

const songs = (...titles: string[]) =>
  titles.map((title, i) => ({ position: i + 1, title, coverOf: null, withArtist: null }));

describe('buildQueries', () => {
  it('uses field filters first, strips quotes, and adds the original artist for covers', () => {
    expect(buildQueries({ title: 'Say "Hello"', artistName: 'A', coverOf: 'B', withArtist: null })).toEqual([
      'track:"Say Hello" artist:"A"',
      'Say Hello A',
      'track:"Say Hello" artist:"B"',
    ]);
  });
});

describe('TrackMatchingService', () => {
  it('matches songs in order and stops querying once a confident match is found', async () => {
    const karma = makeTrack();
    const search = vi.fn<TrackSearchPort['searchTracks']>().mockResolvedValue([karma]);
    const service = new TrackMatchingService({ searchTracks: search });

    const matches = await service.matchSongs('tok', { artistName: 'Radiohead', songs: songs('Karma Police', 'Karma Police') });

    expect(matches.map((m) => [m.position, m.status, m.selected])).toEqual([
      [1, 'matched', karma],
      [2, 'matched', karma],
    ]);
    expect(search).toHaveBeenCalledTimes(2); // one query per song
    expect(search).toHaveBeenCalledWith('tok', 'track:"Karma Police" artist:"Radiohead"');
  });

  it('falls back to the plain query when the filtered query finds nothing', async () => {
    const creep = makeTrack({ name: 'Creep' });
    const search = vi
      .fn<TrackSearchPort['searchTracks']>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([creep]);
    const [match] = await new TrackMatchingService({ searchTracks: search }).matchSongs('tok', {
      artistName: 'Radiohead',
      songs: songs('Creep'),
    });
    expect(match?.status).toBe('matched');
    expect(search).toHaveBeenNthCalledWith(2, 'tok', 'Creep Radiohead');
  });

  it('reports not_found when nothing is returned', async () => {
    const search = vi.fn<TrackSearchPort['searchTracks']>().mockResolvedValue([]);
    const [match] = await new TrackMatchingService({ searchTracks: search }).matchSongs('tok', {
      artistName: 'Radiohead',
      songs: songs('Unreleased Jam'),
    });
    expect(match).toMatchObject({ position: 1, status: 'not_found', selected: null, candidates: [] });
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('propagates upstream failures instead of hiding them', async () => {
    const search = vi.fn<TrackSearchPort['searchTracks']>().mockRejectedValue(new Error('boom'));
    await expect(
      new TrackMatchingService({ searchTracks: search }).matchSongs('tok', { artistName: 'R', songs: songs('x') }),
    ).rejects.toThrow('boom');
  });

  it('respects the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const search = vi.fn<TrackSearchPort['searchTracks']>().mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return [];
    });
    await new TrackMatchingService({ searchTracks: search }, { concurrency: 2 }).matchSongs('tok', {
      artistName: 'R',
      songs: songs('a', 'b', 'c', 'd', 'e'),
    });
    expect(peak).toBe(2);
  });
});
