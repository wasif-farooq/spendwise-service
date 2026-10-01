import { runDueSyncs } from '@domains/connections/services/runDueSyncs';

jest.mock('@config/ConfigLoader', () => ({
  ConfigLoader: { getInstance: () => ({ get: () => undefined }) },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { CronScheduler } = require('../../../src/workers/scheduler');
/* eslint-enable @typescript-eslint/no-var-requires */

const conn = (id: string) => ({ id }) as any;

describe('runDueSyncs', () => {
  it('skips everything while the flag is off', async () => {
    const findDue = jest.fn();
    const syncConnection = jest.fn();
    const summary = await runDueSyncs({
      isEnabled: async () => false,
      connections: { findDue },
      sync: { syncConnection },
    });
    expect(summary.skipped).toBe(true);
    expect(findDue).not.toHaveBeenCalled();
    expect(syncConnection).not.toHaveBeenCalled();
  });

  it('syncs up to 10 due connections one at a time; failures do not stop the batch', async () => {
    const order: string[] = [];
    let running = 0;
    const findDue = jest.fn(async () => [conn('a'), conn('b'), conn('c')]);
    const summary = await runDueSyncs({
      isEnabled: async () => true,
      connections: { findDue },
      sync: {
        syncConnection: jest.fn(async (id: string) => {
          running++;
          expect(running).toBe(1);
          order.push(id);
          await Promise.resolve();
          running--;
          if (id === 'b') throw Object.assign(new Error('busy'), { code: 'SYNC_IN_PROGRESS' });
          if (id === 'c') throw new Error('down');
          return { connectionId: id, imported: 0, links: [] };
        }) as any,
      },
    });
    expect(findDue).toHaveBeenCalledWith(10, expect.any(Date));
    expect(order).toEqual(['a', 'b', 'c']);
    expect(summary).toEqual({ skipped: false, picked: 3, synced: 1, failed: 1, busy: 1 });
  });
});

describe('connectionSync cron job', () => {
  it('runs every 15 minutes', async () => {
    let now = new Date('2026-10-01T10:00:00Z');
    const syncDueConnections = jest.fn(async () => ({ skipped: true, picked: 0, synced: 0, failed: 0, busy: 0 }));
    const scheduler = new CronScheduler({ syncDueConnections, now: () => now });
    await scheduler.checkConnectionSync();
    now = new Date('2026-10-01T10:10:00Z');
    await scheduler.checkConnectionSync();
    expect(syncDueConnections).toHaveBeenCalledTimes(1);
    now = new Date('2026-10-01T10:15:00Z');
    await scheduler.checkConnectionSync();
    expect(syncDueConnections).toHaveBeenCalledTimes(2);
  });
});
