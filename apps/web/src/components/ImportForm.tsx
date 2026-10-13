import { parseSetlistUrl } from '@setlist/shared';
import { useId, useState, type FormEvent } from 'react';

interface Props {
  busy: boolean;
  /** Error from the server for the last submission. */
  error: string | null;
  notice?: string | null;
  onSubmit: (url: string) => void;
}

export function ImportForm({ busy, error, notice, onSubmit }: Props) {
  const inputId = useId();
  const [value, setValue] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseSetlistUrl(value);
    if (!parsed.ok) {
      setLocalError(parsed.reason);
      return;
    }
    setLocalError(null);
    onSubmit(value.trim());
  };

  const message = localError ?? error;

  return (
    <form className="card stack" onSubmit={handleSubmit} noValidate>
      <h2>Import a setlist</h2>
      <label htmlFor={inputId}>Setlist.fm concert URL</label>
      <input
        id={inputId}
        type="url"
        inputMode="url"
        placeholder="https://www.setlist.fm/setlist/…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={message !== null}
        aria-describedby={message ? `${inputId}-msg` : undefined}
        disabled={busy}
        autoComplete="off"
      />
      {message && (
        <p id={`${inputId}-msg`} className="message error" role="alert">
          {message}
        </p>
      )}
      {notice && !message && <p className="message notice">{notice}</p>}
      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Working…' : 'Import setlist'}
      </button>
    </form>
  );
}
