/**
 * Manual check against the real Setlist.fm API:
 *   pnpm --filter @setlist/api import:setlist "https://www.setlist.fm/setlist/.../...-63de4613.html"
 * Requires SETLISTFM_API_KEY (apps/api/.env or the environment).
 */
import { SetlistFmClient } from '../integrations/setlistfm/client';
import { SetlistService } from '../modules/setlist/setlist.service';

async function main(): Promise<void> {
  const url = process.argv[2];
  const apiKey = process.env['SETLISTFM_API_KEY'];
  if (!url || !apiKey) {
    console.error('Usage: SETLISTFM_API_KEY=... pnpm --filter @setlist/api import:setlist <setlist.fm url>');
    process.exitCode = 1;
    return;
  }

  const service = new SetlistService(new SetlistFmClient({ apiKey }));
  const setlist = await service.importFromUrl(url);

  console.log(`${setlist.artist.name} — ${setlist.venue.name}, ${setlist.venue.city ?? '?'} (${setlist.eventDate})`);
  for (const song of setlist.songs) {
    const tags = [
      song.encore ? `encore ${song.encore}` : null,
      song.coverOf ? `cover of ${song.coverOf}` : null,
      song.tape ? 'tape' : null,
    ].filter(Boolean);
    console.log(`${String(song.position).padStart(2)}. ${song.title}${tags.length ? ` [${tags.join(', ')}]` : ''}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
