import { describe, expect, it } from 'vitest';
import { makeTrack } from '../../testing/builders';
import { evaluateCandidates, normalizeArtist, normalizeTitle, similarity, type MatchTarget } from './matcher';

const target = (overrides: Partial<MatchTarget> = {}): MatchTarget => ({
  title: 'Karma Police',
  artistName: 'Radiohead',
  coverOf: null,
  withArtist: null,
  ...overrides,
});

describe('normalizeTitle', () => {
  it.each([
    ['Karma Police (Live)', 'karma police'],
    ['Karma Police - 2011 Remaster', 'karma police'],
    ['Karma Police [Remastered]', 'karma police'],
    ['Creep (feat. Someone)', 'creep'],
    ['Don’t Stop Believin’', 'dont stop believin'],
    ['Sit Down. Stand Up.', 'sit down stand up'],
    ['Café del Mar', 'cafe del mar'],
    ['Rock & Roll', 'rock and roll'],
  ])('%s -> %s', (input, expected) => expect(normalizeTitle(input)).toBe(expected));

  it('keeps meaningful parentheticals', () => {
    expect(normalizeTitle('Paranoid Android (Part 2)')).toBe('paranoid android part 2');
    expect(normalizeTitle('Song - Part II')).toBe('song part ii');
  });
});

describe('normalizeArtist / similarity', () => {
  it('ignores leading "the", case and accents', () => {
    expect(normalizeArtist('The Beatles')).toBe(normalizeArtist('beatles'));
    expect(normalizeArtist('Beyoncé')).toBe('beyonce');
  });
  it('scores identical as 1 and different as low', () => {
    expect(similarity('abc', 'abc')).toBe(1);
    expect(similarity('abc', 'xyz')).toBe(0);
    expect(similarity('', '')).toBe(0);
  });
});

describe('evaluateCandidates', () => {
  it('returns not_found with no candidates', () => {
    expect(evaluateCandidates(target(), [])).toEqual({ status: 'not_found', score: 0, selected: null, candidates: [] });
  });

  it('matches an exact title and artist', () => {
    const exact = makeTrack();
    const result = evaluateCandidates(target(), [exact]);
    expect(result.status).toBe('matched');
    expect(result.selected).toBe(exact);
  });

  it('does not blindly pick the first result', () => {
    const karaoke = makeTrack({ name: 'Karma Police (Karaoke Version)', artists: ['Karaoke Hits'], album: 'Karaoke Classics' });
    const wrongSong = makeTrack({ name: 'Karma Chameleon', artists: ['Culture Club'], album: 'Colour by Numbers' });
    const right = makeTrack();
    const result = evaluateCandidates(target(), [karaoke, wrongSong, right]);
    expect(result.status).toBe('matched');
    expect(result.selected).toBe(right);
  });

  it('treats a remaster suffix as the same song', () => {
    const remaster = makeTrack({ name: 'Karma Police - Remastered 2009' });
    expect(evaluateCandidates(target(), [remaster]).status).toBe('matched');
  });

  it('prefers the studio version over a live version', () => {
    const live = makeTrack({ name: 'Karma Police', album: 'Live at Earls Court', albumType: 'album' });
    const studio = makeTrack();
    expect(evaluateCandidates(target(), [live, studio]).selected).toBe(studio);
  });

  it('prefers the album release over a compilation when otherwise equal', () => {
    const compilation = makeTrack({ album: 'Greatest Hits', albumType: 'compilation' });
    const album = makeTrack();
    expect(evaluateCandidates(target(), [compilation, album]).selected).toBe(album);
  });

  it('marks same title by a different artist as uncertain, not matched', () => {
    const other = makeTrack({ artists: ['Some Cover Band'] });
    const result = evaluateCandidates(target(), [other]);
    expect(result.status).toBe('uncertain');
    expect(result.selected).toBe(other);
  });

  it('marks a near-miss title with the right artist as uncertain', () => {
    const near = makeTrack({ name: 'Karma Polices' });
    expect(evaluateCandidates(target(), [near]).status).not.toBe('not_found');
  });

  it('never auto-matches karaoke/tribute versions', () => {
    const karaoke = makeTrack({ artists: ['Radiohead'], album: 'Radiohead Karaoke Tribute' });
    expect(evaluateCandidates(target(), [karaoke]).status).not.toBe('matched');
  });

  it('returns not_found for unrelated results but still offers titled alternatives only', () => {
    const unrelated = makeTrack({ name: 'Completely Different', artists: ['Nobody'] });
    const result = evaluateCandidates(target(), [unrelated]);
    expect(result.status).toBe('not_found');
    expect(result.selected).toBeNull();
    expect(result.candidates).toEqual([]);
  });

  it('accepts the original artist for covers', () => {
    const cover = target({ title: 'Hey Jude', artistName: 'Radiohead', coverOf: 'The Beatles' });
    const original = makeTrack({ name: 'Hey Jude', artists: ['The Beatles'], album: '1' });
    expect(evaluateCandidates(cover, [original]).status).toBe('matched');
  });

  it('limits alternatives to five, best first', () => {
    const tracks = Array.from({ length: 8 }, (_, i) => makeTrack({ name: i === 7 ? 'Karma Police' : `Karma Police ${i}x` }));
    const result = evaluateCandidates(target(), tracks);
    expect(result.candidates).toHaveLength(5);
    expect(result.candidates[0]).toBe(tracks[7]);
  });
});
