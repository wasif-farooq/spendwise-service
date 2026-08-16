/**
 * One-off migration: hash any 2FA backup codes still stored as plaintext.
 *
 * Backup codes are now persisted as bcrypt hashes. Rows written before that
 * change still hold the raw codes, which means a dump of `users.backup_codes`
 * hands over a working second factor. This rewrites them in place, preserving
 * the codes users already wrote down.
 *
 * Usage:
 *   npm run backup-codes:hash -- --dry-run   # report only, no writes
 *   npm run backup-codes:hash                # apply
 */
import { Client } from 'pg';
import { ConfigLoader } from '@config/ConfigLoader';
import { BackupCode } from '@shared/types/BackupCode';

interface UserRow {
  id: string;
  email: string;
  backup_codes: string[] | null;
}

const isDryRun = process.argv.includes('--dry-run');

async function hashBackupCodes() {
  const configLoader = ConfigLoader.getInstance();
  const dbConfig = configLoader.get('database.postgres');

  const client = new Client({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.username,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: dbConfig.ssl,
  });

  await client.connect();
  console.log(`Connected to ${dbConfig.database}${isDryRun ? ' (dry run)' : ''}`);

  try {
    const { rows } = await client.query<UserRow>(
      `SELECT id, email, backup_codes
         FROM users
        WHERE backup_codes IS NOT NULL
          AND cardinality(backup_codes) > 0`,
    );

    console.log(`${rows.length} user(s) have backup codes stored.`);

    let migrated = 0;
    let skipped = 0;

    for (const row of rows) {
      const codes = row.backup_codes ?? [];

      if (BackupCode.allHashed(codes)) {
        skipped++;
        continue;
      }

      const hashed = await BackupCode.hashExisting(codes);

      if (isDryRun) {
        console.log(`  would hash ${codes.length} code(s) for ${row.email}`);
      } else {
        await client.query(`UPDATE users SET backup_codes = $1, updated_at = NOW() WHERE id = $2`, [
          hashed,
          row.id,
        ]);
        console.log(`  hashed ${codes.length} code(s) for ${row.email}`);
      }

      migrated++;
    }

    console.log(
      `\nDone. ${migrated} user(s) ${isDryRun ? 'would be' : ''} migrated, ${skipped} already hashed.`,
    );
  } finally {
    await client.end();
  }
}

hashBackupCodes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
