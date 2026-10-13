# Setlist to Spotify

Paste a [Setlist.fm](https://www.setlist.fm) concert URL, review the Spotify matches, and create a playlist in your own Spotify account with the songs in the original concert order.

Monorepo (pnpm workspaces): `apps/web` (React + Vite), `apps/api` (Fastify), `packages/shared` (Zod schemas + URL parser shared by both).

## Prerequisites

- Node.js 20+ and pnpm 10+
- A Setlist.fm API key
- A Spotify developer app (see below)

## Configure credentials (manual steps)

### Setlist.fm
1. Sign in at <https://www.setlist.fm> and request a key at <https://www.setlist.fm/settings/api>.
2. Put it in `SETLISTFM_API_KEY`. The API is free for **non-commercial** use only.

### Spotify
1. Open <https://developer.spotify.com/dashboard> → **Create app**.
2. **Redirect URI**: `http://127.0.0.1:5173/api/auth/callback` (exactly; `localhost` is rejected by Spotify). Select **Web API**.
3. Copy the **Client ID** and **Client secret** (Settings) into `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET`.
4. **Development Mode limits** (as of the Feb 2026 changes): the app owner needs **Spotify Premium**, and only **allow-listed users (max 5)** can use the app. Add yourself and each friend under *Settings → User Management* (name + the email of their Spotify account). Non-listed users can sign in but every API call returns 403.

### Environment file
```bash
cp .env.example apps/api/.env   # then fill in the values
```
Always browse the app at **http://127.0.0.1:5173** (not `localhost`), otherwise the OAuth cookies will not match.

## Run

```bash
pnpm install
pnpm dev          # API on :3001, web on http://127.0.0.1:5173 (proxies /api to the API)
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | API (tsx watch) + web (Vite) |
| `pnpm test` | Vitest in all packages (no credentials needed; integrations are mocked) |
| `pnpm lint` | ESLint (type-aware) |
| `pnpm typecheck` | `tsc --noEmit` everywhere |
| `pnpm build` | API bundle (`apps/api/dist`) + web bundle (`apps/web/dist`) |
| `pnpm check` | lint + typecheck + test + build |

## Verifying against the real services

Tests use hand-written fixtures that follow the documented API shapes, **not** recorded live responses. To check the real thing:

```bash
# 1. Setlist.fm only (needs SETLISTFM_API_KEY in apps/api/.env)
pnpm --filter @setlist/api import:setlist "https://www.setlist.fm/setlist/<artist>/<year>/<slug>-<id>.html"

# 2. Full flow: pnpm dev → open http://127.0.0.1:5173 → Connect Spotify → paste a URL → review → Create playlist
```
If the Setlist.fm script reports "unexpected response shape", the Zod schema in `apps/api/src/integrations/setlistfm/schemas.ts` needs adjusting to what the live API returns.

## How it works

1. Browser → `GET /api/auth/login` → Spotify consent → `/api/auth/callback` (verifies the `state` cookie, exchanges the code with the client secret on the server). The browser only receives an opaque, httpOnly `sid` cookie; Spotify tokens stay in server memory.
2. `POST /api/setlists/import` – the URL is parsed to an ID (host/path allow-list); only `api.setlist.fm` is ever contacted.
3. `POST /api/tracks/match` – per song: Spotify search (field-filtered query, then plain fallback), candidates scored on normalized title + artist similarity with penalties for karaoke/live/remix versions → `matched` / `uncertain` / `not_found`.
4. Review UI: replace (search Spotify), skip/include, then `POST /api/playlists` → `POST /me/playlists` + `POST /playlists/{id}/items` in batches of 100, order preserved.

Architecture decisions are in [`docs/adr`](docs/adr).

## Known limitations

- Sessions live in memory: restarting the API signs everyone out.
- Medley entries like "Song A / Song B" are searched as one title and usually need manual replacement.
- Spotify Development Mode quotas can return 429 on large setlists; the API retries short `Retry-After` waits and otherwise shows a "rate limit" error.
- No built-in rate limiting of our own API (audience is a few friends). Add `@fastify/rate-limit` before wider use.
- Production hosting must serve web and API on the same origin (reverse proxy `/api`) and set `WEB_ORIGIN`/`SPOTIFY_REDIRECT_URI` to https URLs.
