# ADR 0001: Architecture and key decisions

## Status
Accepted

## Decisions

**No database; in-memory sessions.** The audience is a handful of friends (Spotify Development Mode caps at 5 users anyway). Sessions hold the Spotify tokens server-side in a `SessionStore` (7-day TTL). Restart = sign in again. The store is a small class, so a persistent implementation can replace it without touching callers.

**Server-side OAuth Authorization Code Flow with client secret.** Tokens never reach the browser; it only holds a random 256-bit opaque `sid` (httpOnly, SameSite=Lax). The OAuth `state` is a random value kept in a short-lived httpOnly cookie and compared in constant time on callback. Scopes: `playlist-modify-private` and `playlist-modify-public` (the public one only because the UI offers a public toggle). Playlists default to private. Refresh is lazy, with concurrent refreshes deduplicated per session.

**Same-origin via Vite proxy.** The dev server proxies `/api`, so cookies are first-party and no CORS is needed. Because Spotify rejects `localhost`, everything uses `127.0.0.1`. CSRF defence: SameSite=Lax, JSON bodies, and an `Origin` check on non-GET requests.

**SSRF prevention by construction.** The user's URL is never fetched. `parseSetlistUrl` (shared) extracts a hex ID from an allow-listed host/path; the Setlist.fm client builds the request URL from a fixed base and re-validates the ID.

**Shared Zod schemas** (`packages/shared`) define the API contract. The server validates every request; the web client validates every response. The package exports TypeScript source directly; Vite/Vitest/tsx consume it as-is and `tsup` inlines it into the API bundle.

**Layering.** `integrations/*` talk HTTP and validate raw payloads; `modules/*` hold business logic against small ports (`TrackSearchPort`, `PlaylistPort`, ...) and know nothing about Fastify; `*.routes.ts` is a thin HTTP layer. `buildApp(deps)` takes all collaborators, so tests use `app.inject` with fakes.

**Current Spotify endpoints only** (verified Feb–Jul 2026 docs): `POST /me/playlists`, `POST /playlists/{id}/items`, `GET /search` with `limit ≤ 10`. Deprecated `/users/{id}/playlists` and `/tracks` are not used. Fields removed in Development Mode (`popularity`, `available_markets`, ...) are not relied on.

**Error model.** `AppError(code, message, status)` is the only error type whose message reaches the client; everything else becomes a generic 500. Upstream response bodies and request details are never forwarded or logged. Request logs contain method and path only (OAuth callback query strings carry `code`/`state`).

## Matching strategy (ADR-level summary)
Score = 0.7·titleSimilarity + 0.3·artistSimilarity ± small album-type adjustments − penalties (karaoke/tribute: 0.4, live/remix/acoustic/demo: 0.08 unless the setlist title includes the word). `matched` needs title ≥ 0.9, artist ≥ 0.8, total ≥ 0.85; `uncertain` needs title ≥ 0.6, total ≥ 0.5. Uncertain tracks are included by default but flagged. Thresholds live at the top of `modules/tracks/matcher.ts` and are covered by tests.
