import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from './api';
import { App } from './App';
import { fakeApi, setlist, uri } from './testing';

const URL_INPUT = /setlist\.fm concert url/i;
const VALID = setlist.url;

async function importSetlist() {
  await userEvent.type(await screen.findByLabelText(URL_INPUT), VALID);
  await userEvent.click(screen.getByRole('button', { name: /import setlist/i }));
}

const row = (name: RegExp | string) => screen.getByRole('listitem', { name });

describe('App', () => {
  it('shows the sign-in screen with a Connect Spotify link when signed out', async () => {
    render(<App api={fakeApi({ getMe: () => Promise.resolve(null) })} />);
    expect(await screen.findByRole('link', { name: /connect spotify/i })).toHaveAttribute('href', '/api/auth/login');
  });

  it('shows a loading state, then an error if the session check fails', async () => {
    const getMe = vi.fn().mockRejectedValue(new ApiClientError('network', 'Could not reach the server.', 0));
    render(<App api={fakeApi({ getMe })} />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
  });

  it('runs the full flow: import, review, replace, skip, create, open playlist', async () => {
    const createPlaylist = vi.fn().mockResolvedValue({ id: 'pl1', url: 'https://open.spotify.com/playlist/pl1', trackCount: 3 });
    render(<App api={fakeApi({ createPlaylist })} />);
    await importSetlist();

    // Review: statuses for matched / uncertain / not found.
    const first = await screen.findByRole('listitem', { name: '1. Karma Police' });
    expect(within(first).getByText('Matched')).toBeInTheDocument();
    expect(within(row('2. Weird Fishes')).getByText('Check match')).toBeInTheDocument();
    expect(within(row('3. Secret Jam')).getByText('Not found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create playlist \(3 tracks\)/i })).toBeInTheDocument();

    // Skip the uncertain one.
    await userEvent.click(within(row('2. Weird Fishes')).getByRole('button', { name: 'Skip' }));
    expect(within(row('2. Weird Fishes')).getByText('Skipped')).toBeInTheDocument();

    // Manually find a track for the unmatched one.
    await userEvent.click(within(row('3. Secret Jam')).getByRole('button', { name: /search manually/i }));
    await userEvent.click(within(row('3. Secret Jam')).getByRole('button', { name: 'Search' }));
    await userEvent.click(await screen.findByRole('button', { name: /found by search/i }));
    expect(within(row('3. Secret Jam')).getByText('Chosen by you')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /create playlist \(3 tracks\)/i }));

    expect(await screen.findByText(/playlist created/i)).toBeInTheDocument();
    expect(createPlaylist).toHaveBeenCalledWith(
      expect.objectContaining({ isPublic: false, trackUris: [uri(1), uri(9), uri(1)] }),
    );
    expect(screen.getByRole('link', { name: /open in spotify/i })).toHaveAttribute('href', 'https://open.spotify.com/playlist/pl1');
  });

  it('shows a loading indicator while matching', async () => {
    let resolve!: (v: never[]) => void;
    const matchTracks = vi.fn().mockReturnValue(new Promise<never[]>((r) => (resolve = r)));
    render(<App api={fakeApi({ matchTracks })} />);
    await importSetlist();
    expect(await screen.findByText(/finding 4 songs on spotify/i)).toBeInTheDocument();
    resolve([]);
    expect(await screen.findByText('Review tracks')).toBeInTheDocument();
  });

  it('shows the server error and returns to the form when import fails', async () => {
    const importSetlistFn = vi.fn().mockRejectedValue(new ApiClientError('not_found', 'Setlist not found on Setlist.fm.', 404));
    render(<App api={fakeApi({ importSetlist: importSetlistFn })} />);
    await importSetlist();
    expect(await screen.findByRole('alert')).toHaveTextContent('Setlist not found on Setlist.fm.');
    expect(screen.getByLabelText(URL_INPUT)).toBeEnabled();
  });

  it('shows an empty state when the setlist has no songs', async () => {
    render(<App api={fakeApi({ importSetlist: () => Promise.resolve({ ...setlist, songs: [] }) })} />);
    await importSetlist();
    expect(await screen.findByText(/has no songs on setlist\.fm yet/i)).toBeInTheDocument();
  });

  it('returns to sign-in when the session has expired', async () => {
    const importFn = vi.fn().mockRejectedValue(new ApiClientError('unauthorized', 'Please sign in with Spotify.', 401));
    render(<App api={fakeApi({ importSetlist: importFn })} />);
    await importSetlist();
    expect(await screen.findByRole('link', { name: /connect spotify/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Please sign in with Spotify.');
  });

  it('keeps the review and shows the error when playlist creation fails, allowing retry', async () => {
    const createPlaylist = vi
      .fn()
      .mockRejectedValueOnce(new ApiClientError('rate_limited', 'Spotify rate limit reached.', 429))
      .mockResolvedValueOnce({ id: 'pl1', url: 'https://open.spotify.com/playlist/pl1', trackCount: 3 });
    render(<App api={fakeApi({ createPlaylist })} />);
    await importSetlist();

    await userEvent.click(await screen.findByRole('button', { name: /create playlist/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Spotify rate limit reached.');
    expect(screen.getByRole('button', { name: /create playlist/i })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: /create playlist/i }));
    await waitFor(() => expect(screen.getByText(/playlist created/i)).toBeInTheDocument());
  });

  it('prevents creating an empty playlist', async () => {
    render(<App api={fakeApi()} />);
    await importSetlist();
    for (const name of ['1. Karma Police', '2. Weird Fishes', '4. Karma Police']) {
      await userEvent.click(within(await screen.findByRole('listitem', { name })).getByRole('button', { name: 'Skip' }));
    }
    expect(screen.getByRole('button', { name: /create playlist/i })).toBeDisabled();
    expect(screen.getByText(/include at least one track/i)).toBeInTheDocument();
  });
});
