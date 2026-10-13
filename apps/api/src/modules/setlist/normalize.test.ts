import { describe, expect, it } from 'vitest';
import { SetlistFmSetlistSchema } from '../../integrations/setlistfm/schemas';
import { emptySetlistRaw, radioheadRaw } from '../../testing/fixtures/setlistfm';
import { normalizeSetlist, toIsoDate } from './normalize';

const normalize = (raw: unknown) => normalizeSetlist(SetlistFmSetlistSchema.parse(raw));

describe('normalizeSetlist', () => {
  const setlist = normalize(radioheadRaw);

  it('maps header fields', () => {
    expect(setlist).toMatchObject({
      id: '63de4613',
      artist: { name: 'Radiohead', mbid: 'a74b1b7f-71a5-4011-9441-d0b5e4122711' },
      eventDate: '2003-08-23',
      venue: { name: "Earl's Court", city: 'London', country: 'United Kingdom' },
      tour: 'Hail to the Thief Tour',
    });
  });

  it('keeps original order, numbering positions contiguously and dropping unnamed placeholders', () => {
    expect(setlist.songs.map((s) => [s.position, s.title])).toEqual([
      [1, '2 + 2 = 5'],
      [2, 'Sit Down. Stand Up.'],
      [3, 'Karma Police'],
      [4, 'Everything in Its Right Place'],
      [5, 'Karma Police'],
      [6, 'Nude'],
      [7, 'Hey Jude'],
      [8, 'Creep'],
      [9, 'Lucky'],
    ]);
  });

  it('preserves duplicate songs as separate entries', () => {
    expect(setlist.songs.filter((s) => s.title === 'Karma Police')).toHaveLength(2);
  });

  it('records encores and set names', () => {
    const byTitle = (t: string) => setlist.songs.find((s) => s.title === t);
    expect(byTitle('2 + 2 = 5')).toMatchObject({ encore: null, setName: null });
    expect(byTitle('Nude')).toMatchObject({ encore: null, setName: 'Acoustic' });
    expect(byTitle('Creep')?.encore).toBe(1);
    expect(byTitle('Lucky')?.encore).toBe(2);
  });

  it('captures covers, guests, notes and tape flags', () => {
    const hey = setlist.songs.find((s) => s.title === 'Hey Jude');
    expect(hey).toMatchObject({ coverOf: 'The Beatles', withArtist: 'Paul McCartney' });
    expect(setlist.songs.find((s) => s.title === 'Everything in Its Right Place')?.tape).toBe(true);
    expect(setlist.songs[2]?.info).toBe('with extended outro');
    expect(setlist.songs[0]).toMatchObject({ tape: false, coverOf: null, withArtist: null, info: null });
  });

  it('handles a setlist with no songs', () => {
    expect(normalize(emptySetlistRaw).songs).toEqual([]);
  });

  it('tolerates a missing tour and sparse venue', () => {
    const result = normalize({ ...radioheadRaw, tour: undefined, venue: { name: 'Somewhere' } });
    expect(result.tour).toBeNull();
    expect(result.venue).toEqual({ name: 'Somewhere', city: null, country: null });
  });
});

describe('toIsoDate', () => {
  it('converts dd-MM-yyyy', () => expect(toIsoDate('05-01-1999')).toBe('1999-01-05'));
  it('rejects impossible dates', () => expect(() => toIsoDate('31-02-2020')).toThrow(/invalid event date/));
});
