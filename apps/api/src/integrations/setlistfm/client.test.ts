import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../errors';
import { radioheadRaw } from '../../testing/fixtures/setlistfm';
import { SetlistFmClient } from './client';

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init });

const makeClient = (fetchMock: ReturnType<typeof vi.fn>) =>
  new SetlistFmClient({ apiKey: 'test-key', fetch: fetchMock as unknown as typeof fetch, sleep: () => Promise.resolve() });

describe('SetlistFmClient', () => {
  it('requests the setlist with API key and JSON accept headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(radioheadRaw));
    const result = await makeClient(fetchMock).getSetlist('63de4613');

    expect(result.id).toBe('63de4613');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.setlist.fm/rest/1.0/setlist/63de4613');
    expect(init.headers).toMatchObject({ 'x-api-key': 'test-key', Accept: 'application/json' });
  });

  it('rejects malformed ids without calling the network', async () => {
    const fetchMock = vi.fn();
    await expect(makeClient(fetchMock).getSetlist('../admin')).rejects.toMatchObject({ code: 'not_found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [404, 'not_found', 404],
    [401, 'upstream_error', 502],
    [403, 'upstream_error', 502],
    [500, 'upstream_error', 502],
  ])('maps HTTP %i to %s', async (status, code, statusCode) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status }));
    await expect(makeClient(fetchMock).getSetlist('63de4613')).rejects.toMatchObject({ code, statusCode });
  });

  it('retries a short 429 and then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '1' } }))
      .mockResolvedValueOnce(json(radioheadRaw));
    await expect(makeClient(fetchMock).getSetlist('63de4613')).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a long 429 as rate_limited without waiting', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '120' } }));
    await expect(makeClient(fetchMock).getSetlist('63de4613')).rejects.toMatchObject({
      code: 'rate_limited',
      statusCode: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails clearly when the response shape is invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: 'x', unexpected: true }));
    await expect(makeClient(fetchMock).getSetlist('63de4613')).rejects.toMatchObject({
      code: 'upstream_error',
      message: expect.stringContaining('unexpected response') as string,
    });
  });

  it('fails clearly on non-JSON bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(makeClient(fetchMock).getSetlist('63de4613')).rejects.toBeInstanceOf(AppError);
  });

  it('wraps network failures without leaking details', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed: key=test-key'));
    const error = await makeClient(fetchMock).getSetlist('63de4613').catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'upstream_error' });
    expect((error as AppError).message).not.toContain('test-key');
  });
});
