import fs from 'fs';
import path from 'path';
import { HttpClient, HttpClientOptions, FetchLike } from '@domains/connections/providers/http';

export const fixture = (adapter: string, name: string) =>
  JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../fixtures/connections', adapter, name), 'utf8'),
  );

export type Route = [(url: string, body: any) => boolean, any | ((url: string, body: any) => any)];

/** A fetch that answers from fixtures; unknown requests fail the test loudly. */
export const fakeFetch = (routes: Route[]) => {
  const calls: Array<{ url: string; body: any; headers: Record<string, string> }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, body, headers: init.headers });
    const route = routes.find(([match]) => match(url, body));
    if (!route) throw new Error(`Unexpected request: ${url} ${init.body ?? ''}`);
    const answer = typeof route[1] === 'function' ? route[1](url, body) : route[1];
    const status = answer?.__status ?? 200;
    const payload = answer?.__status ? answer.body : answer;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      text: async () => JSON.stringify(payload),
    };
  };
  return { fetchImpl, calls };
};

/** makeHttp for adapters: no waiting, the given fetch. */
export const makeHttpWith =
  (fetchImpl: FetchLike) =>
  (options: HttpClientOptions): HttpClient =>
    new HttpClient({ ...options, fetchImpl, sleep: async () => undefined });
