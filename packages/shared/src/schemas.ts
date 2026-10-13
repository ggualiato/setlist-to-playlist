import { z } from 'zod';

/** Spotify track URI, e.g. spotify:track:4iV5W9uYEdYUVa79Axb7Rh */
export const SpotifyTrackUriSchema = z.string().regex(/^spotify:track:[A-Za-z0-9]{22}$/);

// ---------- Setlist ----------

export const SetlistSongSchema = z.object({
  /** 1-based position in the whole concert, across sets and encores. */
  position: z.number().int().positive(),
  title: z.string().min(1),
  /** Name of the containing set when the source provides one (e.g. "Acoustic"). */
  setName: z.string().nullable(),
  /** Encore number (1 = first encore) or null for main-set songs. */
  encore: z.number().int().positive().nullable(),
  /** Original artist when the song is a cover. */
  coverOf: z.string().nullable(),
  /** Guest artist who performed the song with the main act. */
  withArtist: z.string().nullable(),
  info: z.string().nullable(),
  /** Played from tape / recording rather than performed live. */
  tape: z.boolean(),
});
export type SetlistSong = z.infer<typeof SetlistSongSchema>;

export const SetlistSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  artist: z.object({ name: z.string(), mbid: z.string().nullable() }),
  /** ISO date (YYYY-MM-DD). */
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  venue: z.object({
    name: z.string(),
    city: z.string().nullable(),
    country: z.string().nullable(),
  }),
  tour: z.string().nullable(),
  songs: z.array(SetlistSongSchema),
});
export type Setlist = z.infer<typeof SetlistSchema>;

// ---------- Tracks ----------

export const TrackCandidateSchema = z.object({
  uri: SpotifyTrackUriSchema,
  name: z.string(),
  artists: z.array(z.string()),
  album: z.string(),
  albumType: z.string().nullable(),
  imageUrl: z.string().nullable(),
  durationMs: z.number().int().nonnegative(),
  externalUrl: z.string().nullable(),
});
export type TrackCandidate = z.infer<typeof TrackCandidateSchema>;

export const MatchStatusSchema = z.enum(['matched', 'uncertain', 'not_found']);
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

export const TrackMatchSchema = z.object({
  position: z.number().int().positive(),
  status: MatchStatusSchema,
  /** 0..1 confidence of `selected`. */
  score: z.number().min(0).max(1),
  selected: TrackCandidateSchema.nullable(),
  /** Best alternatives, best first. Includes `selected` when present. */
  candidates: z.array(TrackCandidateSchema),
});
export type TrackMatch = z.infer<typeof TrackMatchSchema>;

export const MAX_SONGS = 200;

// ---------- API contracts ----------

export const ImportSetlistRequestSchema = z.object({ url: z.string().min(1).max(300) });
export type ImportSetlistRequest = z.infer<typeof ImportSetlistRequestSchema>;
export const ImportSetlistResponseSchema = z.object({ setlist: SetlistSchema });
export type ImportSetlistResponse = z.infer<typeof ImportSetlistResponseSchema>;

export const MatchTracksRequestSchema = z.object({
  artistName: z.string().min(1).max(200),
  songs: z
    .array(
      z.object({
        position: z.number().int().positive(),
        title: z.string().min(1).max(300),
        coverOf: z.string().max(200).nullable(),
        withArtist: z.string().max(200).nullable(),
      }),
    )
    .min(1)
    .max(MAX_SONGS),
});
export type MatchTracksRequest = z.infer<typeof MatchTracksRequestSchema>;
export const MatchTracksResponseSchema = z.object({ matches: z.array(TrackMatchSchema) });
export type MatchTracksResponse = z.infer<typeof MatchTracksResponseSchema>;

export const SearchTracksQuerySchema = z.object({ q: z.string().trim().min(1).max(200) });
export const SearchTracksResponseSchema = z.object({ tracks: z.array(TrackCandidateSchema) });
export type SearchTracksResponse = z.infer<typeof SearchTracksResponseSchema>;

export const CreatePlaylistRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(300).default(''),
  isPublic: z.boolean().default(false),
  /** Order is preserved; duplicates are allowed. */
  trackUris: z.array(SpotifyTrackUriSchema).min(1).max(500),
});
export type CreatePlaylistRequest = z.input<typeof CreatePlaylistRequestSchema>;
export const CreatePlaylistResponseSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  trackCount: z.number().int().nonnegative(),
});
export type CreatePlaylistResponse = z.infer<typeof CreatePlaylistResponseSchema>;

// ---------- Auth ----------

export const SessionUserSchema = z.object({ id: z.string(), displayName: z.string() });
export type SessionUser = z.infer<typeof SessionUserSchema>;
export const MeResponseSchema = z.object({ user: SessionUserSchema.nullable() });
export type MeResponse = z.infer<typeof MeResponseSchema>;

// ---------- Errors ----------

export const ErrorCodeSchema = z.enum([
  'invalid_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'rate_limited',
  'upstream_error',
  'internal_error',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorResponseSchema = z.object({
  error: z.object({ code: ErrorCodeSchema, message: z.string() }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
