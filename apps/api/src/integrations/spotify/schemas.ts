import { z } from 'zod';

export const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
});

export const CurrentUserSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().nullish(),
});

const RawTrackSchema = z.object({
  uri: z.string(),
  name: z.string(),
  duration_ms: z.number(),
  artists: z.array(z.object({ name: z.string() })),
  album: z.object({
    name: z.string(),
    album_type: z.string().optional(),
    images: z.array(z.object({ url: z.string() })).default([]),
  }),
  external_urls: z.object({ spotify: z.string().optional() }).optional(),
});
export type RawTrack = z.infer<typeof RawTrackSchema>;

// Spotify occasionally returns null entries in search result arrays.
export const SearchResponseSchema = z.object({
  tracks: z.object({ items: z.array(RawTrackSchema.nullable()) }),
});

export const CreatedPlaylistSchema = z.object({
  id: z.string().min(1),
  external_urls: z.object({ spotify: z.string().url() }),
});

export const AddItemsResponseSchema = z.object({ snapshot_id: z.string() });
