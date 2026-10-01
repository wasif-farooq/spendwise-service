import type { ConnectionRepository } from '../repositories/ConnectionRepository';
import type { ConnectionSyncService } from './ConnectionSyncService';

export interface DueSyncSummary {
  skipped: boolean;
  picked: number;
  synced: number;
  failed: number;
  busy: number;
}

/**
 * The scheduled sync: while the flag is on, takes up to `limit` connections
 * whose next_sync_at has passed and syncs them one at a time (the server is
 * small; providers are rate limited). Failures are stored on the connection
 * by the sync service and never stop the batch.
 */
export const runDueSyncs = async (deps: {
  isEnabled: () => Promise<boolean>;
  connections: Pick<ConnectionRepository, 'findDue'>;
  sync: Pick<ConnectionSyncService, 'syncConnection'>;
  limit?: number;
  now?: () => Date;
}): Promise<DueSyncSummary> => {
  let enabled = false;
  try {
    enabled = await deps.isEnabled();
  } catch {
    enabled = false;
  }
  if (!enabled) return { skipped: true, picked: 0, synced: 0, failed: 0, busy: 0 };

  const due = await deps.connections.findDue(deps.limit ?? 10, deps.now ? deps.now() : new Date());
  const summary: DueSyncSummary = {
    skipped: false,
    picked: due.length,
    synced: 0,
    failed: 0,
    busy: 0,
  };
  for (const conn of due) {
    try {
      await deps.sync.syncConnection(conn.id, { trigger: 'scheduled' });
      summary.synced++;
    } catch (error) {
      if ((error as any)?.code === 'SYNC_IN_PROGRESS') summary.busy++;
      else summary.failed++;
    }
  }
  return summary;
};
