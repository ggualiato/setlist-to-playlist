import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ImportForm } from './ImportForm';

const VALID = 'https://www.setlist.fm/setlist/radiohead/2003/earls-court-london-england-63de4613.html';

describe('ImportForm', () => {
  it('shows a validation error and does not submit for a non-Setlist.fm URL', async () => {
    const onSubmit = vi.fn();
    render(<ImportForm busy={false} error={null} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/setlist\.fm concert url/i), 'https://evil.example/x');
    await userEvent.click(screen.getByRole('button', { name: /import setlist/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/only setlist\.fm/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a trimmed valid URL', async () => {
    const onSubmit = vi.fn();
    render(<ImportForm busy={false} error={null} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/setlist\.fm concert url/i), `  ${VALID} `);
    await userEvent.click(screen.getByRole('button', { name: /import setlist/i }));

    expect(onSubmit).toHaveBeenCalledWith(VALID);
  });

  it('shows server errors and notices', () => {
    const { rerender } = render(<ImportForm busy={false} error="Setlist not found." onSubmit={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Setlist not found.');
    rerender(<ImportForm busy={false} error={null} notice="No songs yet." onSubmit={vi.fn()} />);
    expect(screen.getByText('No songs yet.')).toBeInTheDocument();
  });

  it('disables the form while busy', () => {
    render(<ImportForm busy error={null} onSubmit={vi.fn()} />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByLabelText(/setlist\.fm concert url/i)).toBeDisabled();
  });
});
