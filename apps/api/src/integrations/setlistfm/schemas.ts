import { z } from 'zod';

/**
 * Raw Setlist.fm payload (https://api.setlist.fm/docs/1.0/json_Setlist.html).
 * Only fields we use are declared; unknown fields are ignored, but the ones we rely on
 * must be present and well-typed so upstream changes fail loudly instead of silently.
 */

const ArtistRefSchema = z.object({ name: z.string() });

const SongSchema = z.object({
  // Setlist.fm uses an empty name for "unknown song" placeholders.
  name: z.string().default(''),
  info: z.string().optional(),
  tape: z.boolean().optional(),
  with: ArtistRefSchema.optional(),
  cover: ArtistRefSchema.optional(),
});

const SetSchema = z.object({
  name: z.string().optional(),
  encore: z.number().int().positive().optional(),
  song: z.array(SongSchema).default([]),
});

export const SetlistFmSetlistSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  /** dd-MM-yyyy */
  eventDate: z.string().regex(/^\d{2}-\d{2}-\d{4}$/),
  artist: z.object({ name: z.string().min(1), mbid: z.string().optional() }),
  venue: z.object({
    name: z.string().min(1),
    city: z
      .object({
        name: z.string().optional(),
        country: z.object({ name: z.string().optional() }).optional(),
      })
      .optional(),
  }),
  tour: z.object({ name: z.string() }).optional(),
  sets: z.object({ set: z.array(SetSchema).default([]) }),
});

export type SetlistFmSetlist = z.infer<typeof SetlistFmSetlistSchema>;
export type SetlistFmSet = z.infer<typeof SetlistFmSetlistSchema>['sets']['set'][number];
