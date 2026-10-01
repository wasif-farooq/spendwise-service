#!/usr/bin/env ts-node
import { ConfigLoader } from '../config/ConfigLoader';
import { DatabaseFacade } from '../facades/DatabaseFacade';
import { PostgresFactory } from '../database/factories/PostgresFactory';
import {
  buildConnectionServices,
  CONNECTED_ACCOUNTS_FLAG,
} from '../domains/connections/services/buildConnectionServices';
import { runDueSyncs } from '../domains/connections/services/runDueSyncs';

/**
 * Connected accounts CLI (staging runs no worker: a host cron calls sync-due).
 *   sync-due      sync up to 10 due connections, one at a time (only while the
 *                 `connectedAccounts` flag is on)
 *   sync <id>     sync one connection now (ignores the flag and the schedule)
 *   rotate-keys   re-encrypt stored addresses/tokens with CONNECTIONS_ENC_ACTIVE
 * Output never contains addresses or keys.
 */
async function main() {
  const command = process.argv[2] || 'help';
  const db = new DatabaseFacade(new PostgresFactory());
  const config = ConfigLoader.getInstance().get('connections') ?? {};
  const { sync, connections, secretBox } = buildConnectionServices(db, { config });

  switch (command) {
    case 'sync-due': {
      const summary = await runDueSyncs({
        isEnabled: async () => {
          const result = await db.query('SELECT enabled FROM feature_flags WHERE key = $1', [
            CONNECTED_ACCOUNTS_FLAG,
          ]);
          return result.rows[0]?.enabled === true;
        },
        connections,
        sync,
        limit: Number(process.argv[3]) || 10,
      });
      console.log(
        summary.skipped
          ? '[connections] sync-due: flag off, nothing to do'
          : `[connections] sync-due: picked ${summary.picked}, synced ${summary.synced}, failed ${summary.failed}, busy ${summary.busy}`,
      );
      break;
    }
    case 'sync': {
      const id = process.argv[3];
      if (!id) throw new Error('Usage: connections sync <connectionId>');
      const result = await sync.syncConnection(id, { trigger: 'manual' });
      console.log(`[connections] synced ${id}: ${result.imported} new rows`);
      for (const link of result.links) {
        console.log(
          `  link ${link.linkId}: +${link.imported}, provider ${link.providerBalance}, ledger ${link.ledgerBalance}${
            link.adjustment ? `, adjustment ${link.adjustment}` : ''
          }${link.hasMore ? ', more pending' : ''}`,
        );
      }
      break;
    }
    case 'rotate-keys': {
      if (!secretBox) throw new Error('CONNECTIONS_ENC_KEYS is not configured');
      const rows = await connections.listEncrypted();
      let rotated = 0;
      for (const row of rows) {
        if (!secretBox.needsRotation(row.credentialsEnc)) continue;
        await connections.updateCredentials(
          row.id,
          secretBox.encrypt(secretBox.decrypt(row.credentialsEnc)),
        );
        rotated++;
      }
      console.log(
        `[connections] rotate-keys: ${rotated} of ${rows.length} re-encrypted with key ${secretBox.activeVersion}`,
      );
      break;
    }
    default:
      console.log('Usage: connections <sync-due [limit] | sync <id> | rotate-keys>');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[connections] failed:', error?.message ?? error);
    process.exit(1);
  });
