import type { DatabaseSync, StatementSync } from "../deps/sqlite.ts"

export type YankDatabaseStatements = {
  insert: StatementSync
  selectRecent: StatementSync
  deleteOld: StatementSync
  upsertRegisterSnapshot: StatementSync
  selectRegisterSnapshots: StatementSync
}

export const createYankHistorySchema = (db: DatabaseSync, maxHistory: number): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS yank_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      regtype TEXT NOT NULL,
      blockwidth INTEGER,
      register TEXT NOT NULL DEFAULT '"',
      timestamp INTEGER NOT NULL,
      size INTEGER NOT NULL,
      source_file TEXT,
      source_line INTEGER,
      source_filetype TEXT,
      created_at INTEGER DEFAULT (unixepoch() * 1000),
      accessed_at INTEGER,
      access_count INTEGER DEFAULT 0,
      CHECK(regtype IN ('v', 'V', 'b'))
    );

    CREATE INDEX IF NOT EXISTS idx_timestamp ON yank_history(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_size ON yank_history(size);
    CREATE INDEX IF NOT EXISTS idx_source_file ON yank_history(source_file);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS register_snapshots (
      register TEXT PRIMARY KEY,
      regcontents_json TEXT NOT NULL,
      regtype TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      source_instance_id TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_register_snapshots_updated_at
      ON register_snapshots(updated_at DESC);

    INSERT OR IGNORE INTO settings (key, value) VALUES
      ('schema_version', '1'),
      ('max_history', '${maxHistory}');
  `)

  const columns = db.prepare(`PRAGMA table_info(yank_history)`).all() as Array<{ name: string }>
  const hasRegisterColumn = columns.some((column) => column.name === "register")
  if (!hasRegisterColumn) {
    db.exec(`ALTER TABLE yank_history ADD COLUMN register TEXT NOT NULL DEFAULT '"'`)
  }
}

export const createYankDatabaseStatements = (db: DatabaseSync): YankDatabaseStatements => {
  return {
    insert: db.prepare(`
      INSERT INTO yank_history
      (content, regtype, blockwidth, timestamp, size, source_file, source_line, source_filetype, register)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    selectRecent: db.prepare(`
      SELECT
        id, content, regtype, blockwidth, timestamp, size,
        source_file, source_line, source_filetype, register
      FROM yank_history
      ORDER BY timestamp DESC
      LIMIT ?
    `),
    deleteOld: db.prepare(`
      DELETE FROM yank_history
      WHERE id NOT IN (
        SELECT id FROM yank_history
        ORDER BY timestamp DESC
        LIMIT ?
      )
    `),
    upsertRegisterSnapshot: db.prepare(`
      INSERT INTO register_snapshots
      (register, regcontents_json, regtype, updated_at, source_instance_id)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(register) DO UPDATE SET
        regcontents_json = excluded.regcontents_json,
        regtype = excluded.regtype,
        updated_at = excluded.updated_at,
        source_instance_id = excluded.source_instance_id
    `),
    selectRegisterSnapshots: db.prepare(`
      SELECT
        register, regcontents_json, regtype, updated_at, source_instance_id
      FROM register_snapshots
      ORDER BY register ASC
    `),
  }
}

export const clearYankDatabaseStatements = (
  statements: Partial<YankDatabaseStatements>,
): void => {
  statements.insert = undefined
  statements.selectRecent = undefined
  statements.deleteOld = undefined
  statements.upsertRegisterSnapshot = undefined
  statements.selectRegisterSnapshots = undefined
}
