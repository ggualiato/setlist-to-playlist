import type { Setlist, SetlistSong, TrackCandidate, TrackMatch } from '@setlist/shared';

/** One setlist song plus the user's current decision about it. */
export interface ReviewItem {
  song: SetlistSong;
  match: TrackMatch;
  /** Track that will be added unless `skipped`. */
  selected: TrackCandidate | null;
  skipped: boolean;
  /** The user picked `selected` themselves. */
  manual: boolean;
}

export type DisplayStatus = 'matched' | 'uncertain' | 'not_found' | 'manual' | 'skipped';

export interface ReviewSummary {
  matched: number;
  uncertain: number;
  notFound: number;
  skipped: number;
  included: number;
}

export function buildReviewItems(setlist: Setlist, matches: readonly TrackMatch[]): ReviewItem[] {
  const byPosition = new Map(matches.map((m) => [m.position, m]));
  return setlist.songs.map((song) => {
    const match: TrackMatch = byPosition.get(song.position) ?? {
      position: song.position,
      status: 'not_found',
      score: 0,
      selected: null,
      candidates: [],
    };
    return {
      song,
      match,
      selected: match.selected,
      // Nothing to add without a track; tape/intro recordings are rarely wanted in a playlist.
      skipped: match.selected === null || song.tape,
      manual: false,
    };
  });
}

const update = (items: readonly ReviewItem[], position: number, change: (item: ReviewItem) => ReviewItem) =>
  items.map((item) => (item.song.position === position ? change(item) : item));

export const replaceTrack = (items: readonly ReviewItem[], position: number, track: TrackCandidate): ReviewItem[] =>
  update(items, position, (item) => ({ ...item, selected: track, skipped: false, manual: true }));

export const setSkipped = (items: readonly ReviewItem[], position: number, skipped: boolean): ReviewItem[] =>
  update(items, position, (item) => (item.selected ? { ...item, skipped } : item));

export function displayStatus(item: ReviewItem): DisplayStatus {
  if (!item.selected) return 'not_found';
  if (item.skipped) return 'skipped';
  if (item.manual) return 'manual';
  return item.match.status;
}

/** URIs in original concert order; duplicates are kept on purpose. */
export function includedUris(items: readonly ReviewItem[]): string[] {
  return items.flatMap((item) => (!item.skipped && item.selected ? [item.selected.uri] : []));
}

export function summarize(items: readonly ReviewItem[]): ReviewSummary {
  const summary: ReviewSummary = { matched: 0, uncertain: 0, notFound: 0, skipped: 0, included: 0 };
  for (const item of items) {
    if (item.selected) {
      if (item.skipped) summary.skipped++;
      else summary.included++;
    }
    if (item.match.status === 'matched') summary.matched++;
    else if (item.match.status === 'uncertain') summary.uncertain++;
    else summary.notFound++;
  }
  return summary;
}

export function defaultPlaylistName(setlist: Setlist): string {
  const place = [setlist.venue.name, setlist.venue.city].filter(Boolean).join(', ');
  return `${setlist.artist.name} – ${place} (${setlist.eventDate})`.slice(0, 100);
}
