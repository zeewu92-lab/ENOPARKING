import { baozhengSchema, huoquSql } from './db.js';
import migration001 from './migrations/001_event_store_auth.js';

const migrations = [migration001];

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
      ...statements,
      sql`INSERT INTO eng_schema_migrations(version) VALUES (${migration.version})`
    ]);
    console.log(`[migrations] applied ${migration.version}`);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runMigrations().then(() => {
    console.log('[migrations] complete');
    process.exitCode = 0;
  }).catch(error => {
    console.error('[migrations] failed', error);
    process.exitCode = 1;
  });
}
