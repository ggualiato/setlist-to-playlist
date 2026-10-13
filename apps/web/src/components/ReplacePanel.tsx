import type { TrackCandidate } from '@setlist/shared';
import { useId, useState, type FormEvent } from 'react';

interface Props {
  initialQuery: string;
  initialResults: readonly TrackCandidate[];
  search: (query: string) => Promise<TrackCandidate[]>;
  onSelect: (track: TrackCandidate) => void;
  onClose: () => void;
}

export function ReplacePanel({ initialQuery, initialResults, search, onSelect, onClose }: Props) {
  const inputId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<readonly TrackCandidate[]>(initialResults);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [searched, setSearched] = useState(initialResults.length > 0);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setState('loading');
    try {
      setResults(await search(query.trim()));
      setSearched(true);
      setState('idle');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="replace-panel stack">
      <form className="row" onSubmit={(e) => void handleSearch(e)} role="search">
        <label htmlFor={inputId} className="visually-hidden">
          Search Spotify
        </label>
        <input id={inputId} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Spotify" />
        <button type="submit" disabled={state === 'loading'}>
          {state === 'loading' ? 'Searching…' : 'Search'}
        </button>
        <button type="button" className="ghost" onClick={onClose}>
          Cancel
        </button>
      </form>
      {state === 'error' && (
        <p className="message error" role="alert">
          Search failed. Try again.
        </p>
      )}
      {searched && results.length === 0 && state !== 'error' && <p className="muted">No tracks found.</p>}
      <ul className="candidates">
        {results.map((track) => (
          <li key={track.uri}>
            <button type="button" className="candidate" onClick={() => onSelect(track)}>
              <span className="candidate-title">{track.name}</span>
              <span className="muted">
                {track.artists.join(', ')} · {track.album}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
