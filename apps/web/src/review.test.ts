import { describe, expect, it } from 'vitest';
import { buildReviewItems, defaultPlaylistName, displayStatus, includedUris, replaceTrack, setSkipped, summarize } from './review';
import { matches, setlist, track, uri } from './testing';

describe('review model', () => {
  const items = buildReviewItems(setlist, matches);

  it('skips songs without a track by default and includes the rest', () => {
    expect(items.map((i) => i.skipped)).toEqual([false, false, true, false]);
  });

  it('skips tape songs by default', () => {
    const taped = buildReviewItems({ ...setlist, songs: [{ ...setlist.songs[0]!, tape: true }] }, [matches[0]!]);
    expect(taped[0]?.skipped).toBe(true);
  });

  it('treats songs with no match response as not found', () => {
    const [item] = buildReviewItems(setlist, []);
    expect(item?.match.status).toBe('not_found');
    expect(item?.skipped).toBe(true);
  });

  it('keeps concert order and duplicates in the URI list', () => {
    expect(includedUris(items)).toEqual([uri(1), uri(2), uri(1)]);
  });

  it('removes skipped tracks and restores them on include', () => {
    const skipped = setSkipped(items, 2, true);
    expect(includedUris(skipped)).toEqual([uri(1), uri(1)]);
    expect(includedUris(setSkipped(skipped, 2, false))).toEqual([uri(1), uri(2), uri(1)]);
  });

  it('cannot include a song that has no track', () => {
    expect(setSkipped(items, 3, false)[2]?.skipped).toBe(true);
  });

  it('replaces a track in place, un-skips it and marks it as chosen by the user', () => {
    const replaced = replaceTrack(items, 3, track(7));
    expect(replaced[2]).toMatchObject({ skipped: false, manual: true });
    expect(displayStatus(replaced[2]!)).toBe('manual');
    expect(includedUris(replaced)).toEqual([uri(1), uri(2), uri(7), uri(1)]);
  });

  it('summarizes statuses', () => {
    expect(summarize(items)).toEqual({ matched: 2, uncertain: 1, notFound: 1, skipped: 0, included: 3 });
    expect(summarize(setSkipped(items, 2, true))).toMatchObject({ skipped: 1, included: 2 });
  });

  it('builds a default playlist name within Spotify-friendly length', () => {
    expect(defaultPlaylistName(setlist)).toBe("Radiohead – Earl's Court, London (2003-08-23)");
    expect(defaultPlaylistName({ ...setlist, artist: { name: 'x'.repeat(200), mbid: null } })).toHaveLength(100);
  });
});
