import { HttpClient, HttpStatusError } from '@domains/connections/providers/http';
import { fakeFetch } from './helpers';

describe('connections HTTP client', () => {
  const statuses = (codes: number[]) => {
    let i = 0;
    return fakeFetch([[() => true, () => ({ __status: codes[Math.min(i++, codes.length - 1)], body: { ok: true } })]]);
  };

  it('sends an explicit User-Agent and retries 429/5xx with growing waits', async () => {
    const { fetchImpl, calls } = statuses([429, 503, 200]);
    const waits: number[] = [];
    const http = new HttpClient({ name: 'Test', fetchImpl, sleep: async (ms) => void waits.push(ms) });
    await expect(http.getJson('https://x.test/a')).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(3);
    expect(calls[0].headers['User-Agent']).toMatch(/^TrackMyPocket\/1\.0/);
    expect(waits).toEqual([500, 1000]);
  });

  it('gives up after 3 retries with a typed error', async () => {
    const { fetchImpl, calls } = statuses([429]);
    const http = new HttpClient({ name: 'Test', fetchImpl, sleep: async () => undefined });
    await expect(http.getJson('https://x.test/a')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(calls).toHaveLength(4);
    const down = new HttpClient({ name: 'Test', fetchImpl: statuses([502]).fetchImpl, sleep: async () => undefined });
    await expect(down.getJson('https://x.test/a')).rejects.toMatchObject({ code: 'PROVIDER_DOWN' });
  });

  it('does not retry other 4xx answers', async () => {
    const { fetchImpl, calls } = statuses([400]);
    const http = new HttpClient({ name: 'Test', fetchImpl, sleep: async () => undefined });
    await expect(http.getJson('https://x.test/a')).rejects.toBeInstanceOf(HttpStatusError);
    expect(calls).toHaveLength(1);
  });

  it('turns network errors and timeouts into PROVIDER_DOWN after retrying', async () => {
    let n = 0;
    const http = new HttpClient({
      name: 'Test',
      fetchImpl: async () => {
        n++;
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      },
      sleep: async () => undefined,
    });
    await expect(http.getJson('https://x.test/a')).rejects.toMatchObject({ code: 'PROVIDER_DOWN', message: 'Test timed out' });
    expect(n).toBe(4);
  });

  it('spaces requests to the provider rate cap', async () => {
    const clock = 0;
    const waits: number[] = [];
    const { fetchImpl } = statuses([200]);
    const http = new HttpClient({
      name: 'Test',
      maxPerSecond: 4,
      fetchImpl,
      now: () => clock,
      sleep: async (ms) => void waits.push(ms),
    });
    await Promise.all([http.getJson('https://x.test/1'), http.getJson('https://x.test/2'), http.getJson('https://x.test/3')]);
    expect(waits).toEqual([250, 500]);
  });
});
