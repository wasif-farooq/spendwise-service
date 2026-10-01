import type { NormalizedTxn } from '../types';

/**
 * Paging for explorers that list a wallet's history newest first (Esplora,
 * TronGrid, Solana signatures). The cursor remembers:
 *   head    the newest movement already scanned; a scan stops there
 *   resume  where an unfinished scan continues (its page token), what it stops
 *           at, and the head it will set when it finishes
 * A scan also stops at the first movement older than `since`. Overlap is
 * harmless: imports are de-duplicated by (link, external id).
 */
export interface NewestFirstCursor {
  head: string | null;
  resume: { token: string; stopAt: string | null; newHead: string | null } | null;
  /** Adapter-specific state (e.g. the Solana token account). */
  extra?: Record<string, unknown>;
}

export interface NewestFirstPage<T> {
  items: T[];
  /** Token for the next (older) page; null at the end of history. */
  next: string | null;
}

export interface NewestFirstOptions<T> {
  cursor: unknown;
  since: Date | null;
  maxPages: number;
  maxRows: number;
  fetchPage(token: string | null): Promise<NewestFirstPage<T>>;
  idOf(item: T): string;
  /** null for unconfirmed items, which are skipped. */
  timeOf(item: T): Date | null;
  map(item: T): Promise<NormalizedTxn[]> | NormalizedTxn[];
}

export const readNewestFirstCursor = (cursor: unknown): NewestFirstCursor => {
  const c = (cursor ?? {}) as Partial<NewestFirstCursor>;
  return {
    head: typeof c.head === 'string' ? c.head : null,
    resume:
      c.resume && typeof c.resume.token === 'string'
        ? {
            token: c.resume.token,
            stopAt: c.resume.stopAt ?? null,
            newHead: c.resume.newHead ?? null,
          }
        : null,
    extra: c.extra && typeof c.extra === 'object' ? c.extra : undefined,
  };
};

/** Drops an unfinished scan: the next run starts from the newest movement again. */
export const skipNewestFirstBackfill = async (cursor: unknown): Promise<NewestFirstCursor> => {
  const c = readNewestFirstCursor(cursor);
  return { head: c.resume ? c.resume.newHead : c.head, resume: null, extra: c.extra };
};

export async function pageNewestFirst<T>(
  options: NewestFirstOptions<T>,
): Promise<{ items: NormalizedTxn[]; nextCursor: NewestFirstCursor; hasMore: boolean }> {
  const cursor = readNewestFirstCursor(options.cursor);
  let token: string | null = cursor.resume?.token ?? null;
  const stopAt = cursor.resume ? cursor.resume.stopAt : cursor.head;
  let newHead: string | null | undefined = cursor.resume ? cursor.resume.newHead : undefined;

  const items: NormalizedTxn[] = [];
  let finished = false;
  let pages = 0;

  while (pages < options.maxPages && !finished) {
    const page = await options.fetchPage(token);
    pages++;
    for (const item of page.items) {
      const id = options.idOf(item);
      if (newHead === undefined) newHead = id;
      if (stopAt && id === stopAt) {
        finished = true;
        break;
      }
      const time = options.timeOf(item);
      if (!time) continue;
      if (options.since && time < options.since) {
        finished = true;
        break;
      }
      items.push(...(await options.map(item)));
    }
    if (finished) break;
    if (!page.next || page.items.length === 0) {
      finished = true;
      break;
    }
    token = page.next;
    if (items.length >= options.maxRows) break;
  }

  if (finished) {
    return {
      items,
      nextCursor: { head: newHead ?? stopAt ?? cursor.head, resume: null, extra: cursor.extra },
      hasMore: false,
    };
  }
  return {
    items,
    nextCursor: {
      head: cursor.head,
      resume: { token: token as string, stopAt, newHead: newHead ?? null },
      extra: cursor.extra,
    },
    hasMore: true,
  };
}
