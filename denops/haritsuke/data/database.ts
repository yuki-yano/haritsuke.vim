import type { DatabaseSync } from "../deps/sqlite.ts"
import type { YankEntry } from "../types.ts"
import type { DebugLogger } from "../utils/debug-logger.ts"
import { DATABASE } from "../constants.ts"
import { calculateContentSize, validateContentSize } from "../utils/validation.ts"
import { withErrorHandling, withErrorHandlingSync } from "../utils/error-handling.ts"
import { applyPragmaSettings, openDatabaseWithRecovery } from "./database-connection.ts"
import {
  clearYankDatabaseStatements,
  createYankDatabaseStatements,
  createYankHistorySchema,
  type YankDatabaseStatements,
} from "./database-schema.ts"
import { mapYankHistoryRowToEntry, toInsertParams, type YankHistoryRow } from "./database-records.ts"

export type SyncStatus = {
  lastTimestamp: number
  entryCount: number
}

export type RegisterSnapshot = {
  register: string
  regcontents: string[]
  regtype: string
  updatedAt: number
  sourceInstanceId: string
}

export type YankDatabase = {
  init: () => Promise<void>
  add: (entry: Omit<YankEntry, "id" | "size">) => Promise<YankEntry>
  getRecent: (limit?: number) => YankEntry[]
  clear: () => Promise<void>
  getSyncStatus: () => SyncStatus
  upsertRegisterSnapshot: (snapshot: RegisterSnapshot) => Promise<void>
  getRegisterSnapshots: () => RegisterSnapshot[]
  getDataVersion: () => number
  close: () => void
}

export type YankDatabaseOptions = {
  maxHistory?: number
  maxDataSize?: number
}

const createEmptySyncStatus = (): SyncStatus => ({
  lastTimestamp: 0,
  entryCount: 0,
})

export const createYankDatabase = (
  dataDir: string,
  options: YankDatabaseOptions = {},
  logger: DebugLogger | null = null,
): YankDatabase => {
  const maxHistory = options.maxHistory ?? 100
  const maxDataSize = options.maxDataSize ?? DATABASE.MAX_CONTENT_SIZE

  let db: DatabaseSync | undefined
  const statements: Partial<YankDatabaseStatements> = {}

  const cleanup = (): void => {
    withErrorHandlingSync(
      () => statements.deleteOld!.run(maxHistory),
      "database cleanup",
      logger,
    )
  }

  const init = async (): Promise<void> => {
    try {
      db = await openDatabaseWithRecovery(dataDir, logger)
      applyPragmaSettings(db, logger)
      createYankHistorySchema(db, maxHistory)
      Object.assign(statements, createYankDatabaseStatements(db))
      cleanup()
    } catch (error) {
      throw new Error(`Failed to initialize database: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const add = (entry: Omit<YankEntry, "id" | "size">): Promise<YankEntry> => {
    return Promise.resolve().then(() => {
      const size = calculateContentSize(entry.content)
      if (!validateContentSize(entry.content, maxDataSize)) {
        throw new Error(`Content too large: ${size} bytes (max: ${maxDataSize})`)
      }

      try {
        const result = statements.insert!.run(...toInsertParams(entry, size))
        cleanup()

        return {
          ...entry,
          id: (result as { lastInsertRowid: number }).lastInsertRowid.toString(),
          size,
        }
      } catch (error) {
        throw new Error(`Failed to add yank entry: ${error instanceof Error ? error.message : String(error)}`)
      }
    })
  }

  const getRecent = (limit: number = 100): YankEntry[] => {
    return withErrorHandlingSync(
      () => {
        const rows = statements.selectRecent!.all(Math.min(limit, maxHistory))
        return rows.map((row) => mapYankHistoryRowToEntry(row as YankHistoryRow))
      },
      "database getRecent",
      logger,
      [],
    )
  }

  const getSyncStatus = (): SyncStatus => {
    if (!db) {
      return createEmptySyncStatus()
    }

    return withErrorHandlingSync(
      () => {
        const result = db!.prepare(`
          SELECT
            MAX(timestamp) as last_timestamp,
            COUNT(*) as entry_count
          FROM yank_history
        `).get() as { last_timestamp: number | null; entry_count: number }

        return {
          lastTimestamp: result.last_timestamp || 0,
          entryCount: result.entry_count,
        }
      },
      "database getSyncStatus",
      logger,
      createEmptySyncStatus(),
    )
  }

  const upsertRegisterSnapshot = (snapshot: RegisterSnapshot): Promise<void> => {
    return Promise.resolve().then(() => {
      const content = snapshot.regcontents.join("\n")
      const size = calculateContentSize(content)
      if (!validateContentSize(content, maxDataSize)) {
        throw new Error(`Register snapshot too large: ${size} bytes (max: ${maxDataSize})`)
      }

      try {
        statements.upsertRegisterSnapshot!.run(
          snapshot.register,
          JSON.stringify(snapshot.regcontents),
          snapshot.regtype,
          snapshot.updatedAt,
          snapshot.sourceInstanceId,
        )
      } catch (error) {
        throw new Error(
          `Failed to upsert register snapshot: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    })
  }

  const getRegisterSnapshots = (): RegisterSnapshot[] => {
    return withErrorHandlingSync(
      () => {
        const rows = statements.selectRegisterSnapshots!.all() as Array<{
          register: string
          regcontents_json: string
          regtype: string
          updated_at: number
          source_instance_id: string
        }>

        return rows.map((row) => ({
          register: row.register,
          regcontents: JSON.parse(row.regcontents_json) as string[],
          regtype: row.regtype,
          updatedAt: row.updated_at,
          sourceInstanceId: row.source_instance_id,
        }))
      },
      "database getRegisterSnapshots",
      logger,
      [],
    )
  }

  const getDataVersion = (): number => {
    if (!db) {
      return 0
    }

    return withErrorHandlingSync(
      () => {
        const result = db!.prepare("PRAGMA data_version").get() as { data_version: number }
        return result.data_version ?? 0
      },
      "database getDataVersion",
      logger,
      0,
    )
  }

  const clear = (): Promise<void> => {
    return withErrorHandling(
      () => {
        if (!db) {
          throw new Error("Database not initialized")
        }

        db.exec("DELETE FROM yank_history")
        db.exec("DELETE FROM register_snapshots")
        logger?.log("database", "Cleared all entries from database")
        return Promise.resolve()
      },
      "database clear",
      logger,
    )
  }

  const close = (): void => {
    try {
      clearYankDatabaseStatements(statements)
      db?.close()
      db = undefined
    } catch (error) {
      logger?.error("database", "Failed to close database", error)
    }
  }

  return {
    init,
    add,
    getRecent,
    clear,
    getSyncStatus,
    upsertRegisterSnapshot,
    getRegisterSnapshots,
    getDataVersion,
    close,
  }
}
