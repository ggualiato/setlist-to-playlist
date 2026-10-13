import type { Setlist, TrackCandidate } from '@setlist/shared';
import { useId, useState, type FormEvent } from 'react';
import { defaultPlaylistName, summarize, type ReviewItem } from '../review';
import { TrackRow } from './TrackRow';

interface Props {
  setlist: Setlist;
  items: readonly ReviewItem[];
  creating: boolean;
  error: string | null;
  search: (query: string) => Promise<TrackCandidate[]>;
  onReplace: (position: number, track: TrackCandidate) => void;
  onToggleSkip: (position: number, skipped: boolean) => void;
  onCreate: (options: { name: string; isPublic: boolean }) => void;
  onBack: () => void;
}

export function ReviewPanel({ setlist, items, creating, error, search, onReplace, onToggleSkip, onCreate, onBack }: Props) {
  const nameId = useId();
  const [name, setName] = useState(() => defaultPlaylistName(setlist));
  const [isPublic, setIsPublic] = useState(false);
  const summary = summarize(items);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() && summary.included > 0) onCreate({ name: name.trim(), isPublic });
  };

  return (
    <>
      <section className="card stack" aria-labelledby="summary-heading">
        <h2 id="summary-heading">Review tracks</h2>
        <ul className="stats" aria-label="Match summary">
          <li><strong>{summary.matched}</strong> matched</li>
          <li><strong>{summary.uncertain}</strong> to check</li>
          <li><strong>{summary.notFound}</strong> not found</li>
          <li><strong>{summary.skipped}</strong> skipped</li>
        </ul>
        {summary.uncertain > 0 && (
          <p className="message notice">
            “Check match” tracks are included by default. Use Replace or Skip if one looks wrong.
          </p>
        )}
        <ol className="tracks">
          {items.map((item) => (
            <TrackRow
              key={item.song.position}
              item={item}
              artistName={setlist.artist.name}
              search={search}
              onReplace={onReplace}
              onToggleSkip={onToggleSkip}
            />
          ))}
        </ol>
      </section>

      <form className="card stack sticky" onSubmit={handleSubmit}>
        <label htmlFor={nameId}>Playlist name</label>
        <input id={nameId} value={name} maxLength={100} onChange={(e) => setName(e.target.value)} disabled={creating} />
        <label className="check">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} disabled={creating} />
          Make playlist public
        </label>
        {error && (
          <p className="message error" role="alert">
            {error}
          </p>
        )}
        {summary.included === 0 && <p className="message notice">Include at least one track to create a playlist.</p>}
        <div className="row">
          <button type="button" className="ghost" onClick={onBack} disabled={creating}>
            Start over
          </button>
          <button type="submit" className="primary" disabled={creating || summary.included === 0 || !name.trim()}>
            {creating ? 'Creating playlist…' : `Create playlist (${summary.included} tracks)`}
          </button>
        </div>
      </form>
    </>
  );
}
