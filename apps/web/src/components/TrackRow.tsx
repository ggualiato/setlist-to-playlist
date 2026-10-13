import type { TrackCandidate } from '@setlist/shared';
import { useState } from 'react';
import { displayStatus, type DisplayStatus, type ReviewItem } from '../review';
import { ReplacePanel } from './ReplacePanel';

const STATUS_LABEL: Record<DisplayStatus, string> = {
  matched: 'Matched',
  uncertain: 'Check match',
  not_found: 'Not found',
  manual: 'Chosen by you',
  skipped: 'Skipped',
};

interface Props {
  item: ReviewItem;
  artistName: string;
  search: (query: string) => Promise<TrackCandidate[]>;
  onReplace: (position: number, track: TrackCandidate) => void;
  onToggleSkip: (position: number, skipped: boolean) => void;
}

function songTags({ song }: ReviewItem): string[] {
  return [
    song.encore ? `Encore ${song.encore}` : null,
    song.setName,
    song.coverOf ? `Cover of ${song.coverOf}` : null,
    song.withArtist ? `with ${song.withArtist}` : null,
    song.tape ? 'Tape' : null,
  ].filter((tag): tag is string => tag !== null);
}

export function TrackRow({ item, artistName, search, onReplace, onToggleSkip }: Props) {
  const [replacing, setReplacing] = useState(false);
  const { song, selected } = item;
  const status = displayStatus(item);

  return (
    <li className={`track status-${status}`} aria-label={`${song.position}. ${song.title}`}>
      <div className="track-main">
        <span className="track-pos" aria-hidden="true">
          {song.position}
        </span>
        <div className="track-body">
          <p className="track-title">{song.title}</p>
          {songTags(item).length > 0 && <p className="tags">{songTags(item).join(' · ')}</p>}
          {selected ? (
            <p className="muted track-match">
              {selected.name} — {selected.artists.join(', ')} · {selected.album}
              {selected.externalUrl && (
                <>
                  {' '}
                  <a href={selected.externalUrl} target="_blank" rel="noreferrer noopener">
                    Preview on Spotify
                  </a>
                </>
              )}
            </p>
          ) : (
            <p className="muted track-match">No track found on Spotify.</p>
          )}
        </div>
        <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>
      </div>
      <div className="track-actions">
        <button type="button" className="link" onClick={() => setReplacing((open) => !open)} aria-expanded={replacing}>
          {selected ? 'Replace' : 'Search manually'}
        </button>
        {selected && (
          <button type="button" className="link" onClick={() => onToggleSkip(song.position, !item.skipped)}>
            {item.skipped ? 'Include' : 'Skip'}
          </button>
        )}
      </div>
      {replacing && (
        <ReplacePanel
          initialQuery={`${song.title} ${artistName}`}
          initialResults={item.match.candidates}
          search={search}
          onClose={() => setReplacing(false)}
          onSelect={(track) => {
            onReplace(song.position, track);
            setReplacing(false);
          }}
        />
      )}
    </li>
  );
}
