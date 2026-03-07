import { DatabaseSync } from "../deps/sqlite.ts"
import { ensureDir, join } from "../deps/std.ts"
import type { DebugLogger } from "../utils/debug-logger.ts"
import { DATABASE, SQLITE_PRAGMA } from "../constants.ts"

export const openDatabaseWithRecovery = async (
  dataDir: string,
  logger: DebugLogger | null,
): Promise<DatabaseSync> => {
  await ensureDir(dataDir)
  const dbPath = join(dataDir, DATABASE.FILE_NAME)

  try {
    return new DatabaseSync(dbPath)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("disk I/O error")) {
      throw error
    }

    logger?.error("database", "Database appears to be corrupted", error)

    const backupPath = `${dbPath}.corrupted.${Date.now()}`
    try {
      await Deno.rename(dbPath, backupPath)
      logger?.log("database", `Corrupted database backed up to: ${backupPath}`)
    } catch {
      try {
        await Deno.remove(dbPath)
      } catch {
        throw error
      }
    }

    return new DatabaseSync(dbPath)
  }
}

export const applyPragmaSettings = (
  db: DatabaseSync,
  logger: DebugLogger | null,
): void => {
  try {
    db.exec(`
      PRAGMA journal_mode = ${SQLITE_PRAGMA.OPTIMAL.JOURNAL_MODE};
      PRAGMA synchronous = ${SQLITE_PRAGMA.OPTIMAL.SYNCHRONOUS};
      PRAGMA cache_size = ${SQLITE_PRAGMA.OPTIMAL.CACHE_SIZE};
      PRAGMA temp_store = ${SQLITE_PRAGMA.OPTIMAL.TEMP_STORE};
      PRAGMA busy_timeout = ${SQLITE_PRAGMA.OPTIMAL.BUSY_TIMEOUT};
      PRAGMA wal_checkpoint = ${SQLITE_PRAGMA.OPTIMAL.WAL_CHECKPOINT};
    `)
  } catch (error) {
    logger?.log(
      "database",
      `Failed to set optimal PRAGMA settings: ${error instanceof Error ? error.message : String(error)}`,
    )
    db.exec(`
      PRAGMA journal_mode = ${SQLITE_PRAGMA.FALLBACK.JOURNAL_MODE};
      PRAGMA synchronous = ${SQLITE_PRAGMA.FALLBACK.SYNCHRONOUS};
      PRAGMA busy_timeout = ${SQLITE_PRAGMA.FALLBACK.BUSY_TIMEOUT};
    `)
  }
}
