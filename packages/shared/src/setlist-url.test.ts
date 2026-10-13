import { describe, expect, it } from 'vitest';
import { parseSetlistUrl } from './setlist-url';

describe('parseSetlistUrl', () => {
  it.each([
    ['https://www.setlist.fm/setlist/radiohead/2003/earls-court-london-england-63de4613.html', '63de4613'],
    ['  https://setlist.fm/setlist/the-beatles/1964/some-venue-3bd6cd3.html?ref=x#top  ', '3bd6cd3'],
    ['http://www.setlist.fm/setlist/a/2020/b-1A2B3C4D.html', '1a2b3c4d'],
  ])('extracts id from %s', (input, id) => {
    expect(parseSetlistUrl(input)).toEqual({ ok: true, setlistId: id });
  });

  it.each([
    ['', 'empty'],
    ['not a url', 'garbage'],
    ['ftp://www.setlist.fm/setlist/a/2020/b-1a2b3c4d.html', 'bad scheme'],
    ['https://evil.com/setlist/a/2020/b-1a2b3c4d.html', 'other host'],
    ['https://www.setlist.fm.evil.com/setlist/a/2020/b-1a2b3c4d.html', 'suffix host'],
    ['https://evil.com@www.setlist.fm/setlist/a/2020/b-1a2b3c4d.html', 'userinfo'],
    ['https://www.setlist.fm/artist/radiohead/1.html', 'not a setlist page'],
    ['https://www.setlist.fm/setlist/a/2020/b-zzzz.html', 'non-hex id'],
    [`https://www.setlist.fm/setlist/a/2020/${'x'.repeat(400)}-1a2b3c4d.html`, 'too long'],
  ])('rejects %s (%s)', (input) => {
    expect(parseSetlistUrl(input).ok).toBe(false);
  });
});
