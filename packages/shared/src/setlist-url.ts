/**
 * Setlist.fm URL parsing. The URL is only ever used to extract an ID; the backend
 * never fetches the user-supplied URL, which rules out SSRF by construction.
 *
 * Expected shape: https://www.setlist.fm/setlist/<artist-slug>/<year>/<slug>-<hexId>.html
 */

const ALLOWED_HOSTS = new Set(['www.setlist.fm', 'setlist.fm']);
const PATH_PATTERN = /^\/setlist\/[^/]+\/\d{4}\/[^/]*-([0-9a-f]{4,12})\.html$/i;
const MAX_URL_LENGTH = 300;

export type SetlistUrlParseResult =
  | { ok: true; setlistId: string }
  | { ok: false; reason: string };

export function parseSetlistUrl(input: string): SetlistUrlParseResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'Paste a Setlist.fm URL.' };
  if (trimmed.length > MAX_URL_LENGTH) return { ok: false, reason: 'That URL is too long.' };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'That does not look like a valid URL.' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'Only http(s) URLs are supported.' };
  }
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password) {
    return { ok: false, reason: 'Only setlist.fm URLs are supported.' };
  }

  const id = PATH_PATTERN.exec(url.pathname)?.[1];
  if (!id) {
    return {
      ok: false,
      reason:
        'Expected a setlist page URL like https://www.setlist.fm/setlist/artist/2024/venue-1a2b3c4d.html',
    };
  }
  return { ok: true, setlistId: id.toLowerCase() };
}
