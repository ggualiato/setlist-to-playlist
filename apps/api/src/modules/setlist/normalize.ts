import type { Setlist, SetlistSong } from '@setlist/shared';
import { upstreamError } from '../../errors';
import type { SetlistFmSetlist } from '../../integrations/setlistfm/schemas';

const blankToNull = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** dd-MM-yyyy -> yyyy-MM-dd, rejecting impossible dates. */
export function toIsoDate(ddMMyyyy: string): string {
  const [dd, mm, yyyy] = ddMMyyyy.split('-');
  const iso = `${yyyy}-${mm}-${dd}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    throw upstreamError(`Setlist.fm returned an invalid event date "${ddMMyyyy}".`);
  }
  return iso;
}

/**
 * Converts the raw Setlist.fm payload into our internal model.
 * - Preserves order across sets/encores and keeps duplicate songs.
 * - Drops unnamed placeholder songs ("unknown song" entries) without leaving gaps in `position`.
 */
export function normalizeSetlist(raw: SetlistFmSetlist): Setlist {
  const songs: SetlistSong[] = [];

  for (const set of raw.sets.set) {
    for (const song of set.song) {
      const title = song.name.trim();
      if (title.length === 0) continue;
      songs.push({
        position: songs.length + 1,
        title,
        setName: blankToNull(set.name),
        encore: set.encore ?? null,
        coverOf: blankToNull(song.cover?.name),
        withArtist: blankToNull(song.with?.name),
        info: blankToNull(song.info),
        tape: song.tape ?? false,
      });
    }
  }

  return {
    id: raw.id,
    url: raw.url,
    artist: { name: raw.artist.name.trim(), mbid: raw.artist.mbid ?? null },
    eventDate: toIsoDate(raw.eventDate),
    venue: {
      name: raw.venue.name.trim(),
      city: blankToNull(raw.venue.city?.name),
      country: blankToNull(raw.venue.city?.country?.name),
    },
    tour: blankToNull(raw.tour?.name),
    songs,
  };
}
