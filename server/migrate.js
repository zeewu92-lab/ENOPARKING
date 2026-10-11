import { pathToFileURL } from 'node:url';
import { baozhengSchema, huoquSql } from './db.js';
import * as migration001 from './migrations/001_event_store_auth.js';
import * as migration002 from './migrations/002_atomic_event_sync.js';
import * as migration003 from './migrations/003_refresh_rotation.js';
import * as migration004 from './migrations/004_account_deletion_tombstones.js';
import * as migration005 from './migrations/005_event_download.js';
import * as migration006 from './migrations/006_preserve_revoked_token_families.js';

const migrations = [migration001, migration002, migration003, migration004, migration005, migration006];

export async function runMigrations() {
  await baozhengSchema();
  const sql = huoquSql();
  await sql`CREATE TABLE IF NOT EXISTS eng_schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  for (const migration of migrations) {
    const existing = await sql`SELECT version FROM eng_schema_migrations WHERE version = ${migration.version} LIMIT 1`;
    if (existing.length) {
      console.log(`[migrations] skip ${migration.version}: already applied`);
      continue;
    }

    const statements = migration.up(sql);
    await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(947201, 1)`,
      ...statements,
      sql`INSERT INTO eng_schema_migrations(version) VALUES (${migration.version}) ON CONFLICT (version) DO NOTHING`
    ]);
    console.log(`[migrations] applied/check complete ${migration.version}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations().then(() => {
    console.log('[migrations] complete');
    process.exitCode = 0;
  }).catch(error => {
    console.error('[migrations] failed', error);
    process.exitCode = 1;
  });
}
