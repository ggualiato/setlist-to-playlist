/**
 * Hand-written fixtures that follow the documented Setlist.fm JSON shape
 * (https://api.setlist.fm/docs/1.0/json_Setlist.html). They are NOT captured from the live API.
 * Use `pnpm --filter @setlist/api import:setlist <url>` to compare against a real response.
 */

export const radioheadRaw = {
  id: '63de4613',
  versionId: '7b1c9e2',
  eventDate: '23-08-2003',
  lastUpdated: '2013-10-20T05:18:08.000+0000',
  artist: { mbid: 'a74b1b7f-71a5-4011-9441-d0b5e4122711', name: 'Radiohead', sortName: 'Radiohead', url: 'https://www.setlist.fm/setlists/radiohead-bd6b4a2.html' },
  venue: {
    id: '6bd6ca6e',
    name: "Earl's Court",
    city: { id: '2643743', name: 'London', state: 'England', stateCode: 'ENG', country: { code: 'GB', name: 'United Kingdom' } },
    url: 'https://www.setlist.fm/venue/earls-court.html',
  },
  tour: { name: 'Hail to the Thief Tour' },
  sets: {
    set: [
      {
        song: [
          { name: '2 + 2 = 5' },
          { name: 'Sit Down. Stand Up.' },
          { name: '' },
          { name: 'Karma Police', info: 'with extended outro' },
          { name: 'Everything in Its Right Place', tape: true },
          { name: 'Karma Police' },
        ],
      },
      {
        name: 'Acoustic',
        song: [{ name: 'Nude' }],
      },
      {
        encore: 1,
        song: [
          { name: 'Hey Jude', cover: { mbid: 'b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d', name: 'The Beatles' }, with: { name: 'Paul McCartney' } },
          { name: 'Creep' },
        ],
      },
      { encore: 2, song: [{ name: 'Lucky' }] },
    ],
  },
  url: 'https://www.setlist.fm/setlist/radiohead/2003/earls-court-london-england-63de4613.html',
};

export const emptySetlistRaw = {
  ...radioheadRaw,
  id: '1a2b3c4d',
  url: 'https://www.setlist.fm/setlist/radiohead/2003/earls-court-london-england-1a2b3c4d.html',
  sets: { set: [] },
};
