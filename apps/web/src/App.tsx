import type { CreatePlaylistResponse, SessionUser, Setlist, TrackCandidate } from '@setlist/shared';
import { useEffect, useState } from 'react';
import { ApiClientError, type Api } from './api';
import { ImportForm } from './components/ImportForm';
import { ReviewPanel } from './components/ReviewPanel';
import {
  buildReviewItems,
  includedUris,
  replaceTrack,
  setSkipped,
  type ReviewItem,
} from './review';

type Stage =
  | { kind: 'loading-session' }
  | { kind: 'signed-out' }
  | { kind: 'import' }
  | { kind: 'working'; step: 'importing' | 'matching'; songCount: number | null }
  | { kind: 'review'; setlist: Setlist; items: ReviewItem[]; creating: boolean }
  | { kind: 'done'; setlist: Setlist; result: CreatePlaylistResponse };

const AUTH_ERRORS: Record<string, string> = {
  access_denied: 'Spotify sign-in was cancelled.',
  state_mismatch: 'Sign-in could not be verified. Please try again.',
  login_failed: 'Spotify sign-in failed. Please try again.',
  invalid_callback: 'Sign-in could not be completed. Please try again.',
};

function readAuthError(): string | null {
  const code = new URLSearchParams(window.location.search).get('auth_error');
  if (!code) return null;
  window.history.replaceState(null, '', window.location.pathname);
  return AUTH_ERRORS[code] ?? 'Spotify sign-in failed. Please try again.';
}

const errorMessage = (error: unknown): string =>
  error instanceof ApiClientError ? error.message : 'Something went wrong. Please try again.';

export function App({ api }: { api: Api }) {
  const [stage, setStage] = useState<Stage>({ kind: 'loading-session' });
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(() => readAuthError());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getMe()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStage(me ? { kind: 'import' } : { kind: 'signed-out' });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(errorMessage(e));
        setStage({ kind: 'signed-out' });
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  /** Handles failures from any authenticated call; an expired session returns to sign-in. */
  const fail = (e: unknown, backTo: Stage): void => {
    if (e instanceof ApiClientError && e.code === 'unauthorized') {
      setUser(null);
      setError(e.message);
      setStage({ kind: 'signed-out' });
      return;
    }
    setError(errorMessage(e));
    setStage(backTo);
  };

  const handleImport = async (url: string) => {
    setError(null);
    setNotice(null);
    setStage({ kind: 'working', step: 'importing', songCount: null });
    let setlist: Setlist;
    try {
      setlist = await api.importSetlist(url);
    } catch (e) {
      return fail(e, { kind: 'import' });
    }
    if (setlist.songs.length === 0) {
      setNotice(`${setlist.artist.name}'s setlist has no songs on Setlist.fm yet. Try another concert.`);
      return setStage({ kind: 'import' });
    }

    setStage({ kind: 'working', step: 'matching', songCount: setlist.songs.length });
    try {
      const matches = await api.matchTracks(setlist);
      setStage({ kind: 'review', setlist, items: buildReviewItems(setlist, matches), creating: false });
    } catch (e) {
      fail(e, { kind: 'import' });
    }
  };

  const updateItems = (change: (items: ReviewItem[]) => ReviewItem[]) =>
    setStage((current) => (current.kind === 'review' ? { ...current, items: change(current.items) } : current));

  const handleCreate = async (options: { name: string; isPublic: boolean }) => {
    if (stage.kind !== 'review') return;
    const review = stage;
    setError(null);
    setStage({ ...review, creating: true });
    try {
      const result = await api.createPlaylist({
        name: options.name,
        isPublic: options.isPublic,
        description: `Setlist from ${review.setlist.url}`.slice(0, 300),
        trackUris: includedUris(review.items),
      });
      setStage({ kind: 'done', setlist: review.setlist, result });
    } catch (e) {
      fail(e, { ...review, creating: false });
    }
  };

  const reset = () => {
    setError(null);
    setNotice(null);
    setStage({ kind: 'import' });
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // Cookie may already be gone; either way the UI returns to signed-out.
    }
    setUser(null);
    setStage({ kind: 'signed-out' });
  };

  const search = (query: string): Promise<TrackCandidate[]> => api.searchTracks(query);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Setlist to Spotify</h1>
        {user && (
          <div className="user">
            <span className="muted">{user.displayName}</span>
            <button type="button" className="link" onClick={() => void handleLogout()}>
              Sign out
            </button>
          </div>
        )}
      </header>

      <main>
        {stage.kind === 'loading-session' && <p role="status" className="card muted">Loading…</p>}

        {stage.kind === 'signed-out' && (
          <section className="card stack">
            <h2>Turn a concert into a playlist</h2>
            <p>Paste a Setlist.fm link and get a Spotify playlist with the songs in the original order.</p>
            {error && <p className="message error" role="alert">{error}</p>}
            <a className="button primary" href="/api/auth/login">
              Connect Spotify
            </a>
            <p className="muted small">
              We only ask to create playlists on your account. Spotify Development Mode apps are limited to
              allow-listed users.
            </p>
          </section>
        )}

        {stage.kind === 'import' && <ImportForm busy={false} error={error} notice={notice} onSubmit={(url) => void handleImport(url)} />}

        {stage.kind === 'working' && (
          <section className="card stack" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true" />
            <p>
              {stage.step === 'importing'
                ? 'Importing setlist from Setlist.fm…'
                : `Finding ${stage.songCount ?? ''} songs on Spotify…`}
            </p>
          </section>
        )}

        {stage.kind === 'review' && (
          <>
            <SetlistHeader setlist={stage.setlist} />
            <ReviewPanel
              setlist={stage.setlist}
              items={stage.items}
              creating={stage.creating}
              error={error}
              search={search}
              onReplace={(position, track) => updateItems((items) => replaceTrack(items, position, track))}
              onToggleSkip={(position, skipped) => updateItems((items) => setSkipped(items, position, skipped))}
              onCreate={(options) => void handleCreate(options)}
              onBack={reset}
            />
          </>
        )}

        {stage.kind === 'done' && (
          <section className="card stack" role="status">
            <h2>Playlist created 🎉</h2>
            <p>
              Added {stage.result.trackCount} tracks from {stage.setlist.artist.name} in concert order.
            </p>
            <a className="button primary" href={stage.result.url} target="_blank" rel="noreferrer noopener">
              Open in Spotify
            </a>
            <button type="button" className="ghost" onClick={reset}>
              Import another setlist
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

function SetlistHeader({ setlist }: { setlist: Setlist }) {
  const place = [setlist.venue.name, setlist.venue.city, setlist.venue.country].filter(Boolean).join(', ');
  return (
    <section className="card setlist-header">
      <h2>{setlist.artist.name}</h2>
      <p className="muted">
        {place} · {setlist.eventDate}
        {setlist.tour && ` · ${setlist.tour}`}
      </p>
      <p className="muted small">{setlist.songs.length} songs</p>
    </section>
  );
}
