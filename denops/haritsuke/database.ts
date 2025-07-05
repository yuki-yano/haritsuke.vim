import { DatabaseSync } from "./deps/sqlite.ts"
import type { StatementSync } from "./deps/sqlite.ts"
import { join } from "./deps/std.ts"
import { ensureDir } from "./deps/std.ts"
import type { RegisterType, YankEntry } from "./types.ts"
import type { DebugLogger } from "./debug-logger.ts"

/**
 * Type definition for row data returned from SQLite
 */
type YankHistoryRow = {
  id: number
  content: string
  regtype: string
  blockwidth: number | null
  timestamp: number
  size: number
  source_file: string | null
  source_line: number | null
  source_filetype: string | null
  created_at?: number
  accessed_at?: number | null
  access_count?: number
}

/**
 * Type definition for count results
 */
type CountResult = {
  count: number
}

/**
 * Type definition for sync state
 */
export type SyncStatus = {
  lastTimestamp: number
  entryCount: number
}

/**
 * Type definition for YankDatabase
 */
export type YankDatabase = {
  init: () => Promise<void>
  add: (entry: Omit<YankEntry, "id" | "hash" | "size">) => Promise<YankEntry>
  getRecent: (limit?: number) => YankEntry[]
  getStats: () => { totalCount: number; maxHistory: number }
  getSyncStatus: () => SyncStatus
  close: () => void
}

/**
 * Yank history persistence management using SQLite
 *
 * Design philosophy:
 * - Simple but extensible structure
 * - Index design considering performance
 */
export const createYankDatabase = (
  dataDir: string,
  maxHistory: number = 100,
  logger: DebugLogger | null = null,
): YankDatabase => {
  // Private state
  let db: DatabaseSync | undefined
  const statements: {
    insert?: StatementSync
    selectRecent?: StatementSync
    deleteOld?: StatementSync
    getCount?: StatementSync
  } = {}

  /**
   * Create schema
   */
  const createSchema = (): void => {
    db!.exec(`
      -- Main table
      CREATE TABLE IF NOT EXISTS yank_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        
        -- Content information
        content TEXT NOT NULL,              -- Yanked content
        regtype TEXT NOT NULL,              -- Register type (v, V, b)
        blockwidth INTEGER,                 -- Width for block selection
        
        -- Metadata
        timestamp INTEGER NOT NULL,         -- Yank timestamp (milliseconds)
        size INTEGER NOT NULL,              -- Content size in bytes
        
        -- Source information
        source_file TEXT,                   -- Source file path
        source_line INTEGER,                -- Source line number
        source_filetype TEXT,               -- Source file type
        
        -- System information
        created_at INTEGER DEFAULT (unixepoch() * 1000),
        accessed_at INTEGER,
        access_count INTEGER DEFAULT 0,
        
        -- Constraints
        CHECK(regtype IN ('v', 'V', 'b'))
      );
      
      -- Indexes for performance improvement
      CREATE INDEX IF NOT EXISTS idx_timestamp ON yank_history(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_size ON yank_history(size);
      CREATE INDEX IF NOT EXISTS idx_source_file ON yank_history(source_file);
      
      -- Settings table
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch() * 1000)
      );
      
      -- Default settings
      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('schema_version', '1'),
        ('max_history', '${maxHistory}');
    `)
  }

  /**
   * Prepare prepared statements
   * Pre-prepare frequently used queries to improve performance
   */
  const prepareStatements = (): void => {
    // Insert new entry (allow duplicates)
    statements.insert = db!.prepare(`
      INSERT INTO yank_history 
      (content, regtype, blockwidth, timestamp, size, source_file, source_line, source_filetype)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    // Get latest N records
    statements.selectRecent = db!.prepare(`
      SELECT 
        id, content, regtype, blockwidth, timestamp, size,
        source_file, source_line, source_filetype
      FROM yank_history
      ORDER BY timestamp DESC
      LIMIT ?
    `)

    // Delete old entries
    statements.deleteOld = db!.prepare(`
      DELETE FROM yank_history
      WHERE id NOT IN (
        SELECT id FROM yank_history
        ORDER BY timestamp DESC
        LIMIT ?
      )
    `)

    // Get total count
    statements.getCount = db!.prepare(`
      SELECT COUNT(*) as count FROM yank_history
    `)
  }

  /**
   * Database cleanup
   * - Delete old entries exceeding maximum history count
   */
  const cleanup = (): void => {
    try {
      statements.deleteOld!.run(maxHistory)
    } catch (error) {
      logger?.error("database", "Failed to cleanup database", error)
    }
  }

  /**
   * Convert database row to YankEntry type
   */
  const rowToEntry = (row: YankHistoryRow): YankEntry => {
    return {
      id: row.id.toString(),
      content: row.content,
      regtype: row.regtype as RegisterType,
      blockwidth: row.blockwidth ?? undefined,
      timestamp: row.timestamp,
      size: row.size,
      sourceFile: row.source_file ?? undefined,
      sourceLine: row.source_line ?? undefined,
      sourceFiletype: row.source_filetype ?? undefined,
    }
  }

  /**
   * Initialize database
   * - Create directory
   * - Database connection
   * - Create schema
   * - Prepare prepared statements
   */
  const init = async (): Promise<void> => {
    try {
      await ensureDir(dataDir)
      const dbPath = join(dataDir, "history.db")

      // Try database connection
      try {
        db = new DatabaseSync(dbPath)
      } catch (error) {
        // If disk I/O error, database file may be corrupted
        if (error instanceof Error && error.message.includes("disk I/O error")) {
          logger?.error("database", "Database appears to be corrupted", error)

          // Backup corrupted DB
          const backupPath = `${dbPath}.corrupted.${Date.now()}`
          try {
            await Deno.rename(dbPath, backupPath)
            logger?.log("database", `Corrupted database backed up to: ${backupPath}`)
          } catch {
            // If backup also fails, delete it
            try {
              await Deno.remove(dbPath)
            } catch {
              // If deletion also fails, re-throw error
              throw error
            }
          }

          // Retry with new DB
          db = new DatabaseSync(dbPath)
        } else {
          throw error
        }
      }

      // Performance optimization settings (multi-process support)
      try {
        // WAL mode supports concurrent access from multiple processes
        db.exec(`
          PRAGMA journal_mode = WAL;          -- Write-Ahead Logging (multi-process support)
          PRAGMA synchronous = NORMAL;        -- Balanced synchronous mode
          PRAGMA cache_size = -2000;          -- 2MB cache
          PRAGMA temp_store = MEMORY;         -- Temporary data in memory
          PRAGMA busy_timeout = 5000;         -- 5 second timeout (lock wait)
          PRAGMA wal_checkpoint = TRUNCATE;   -- Periodic WAL file cleanup
        `)
      } catch (error) {
        logger?.log(
          "database",
          `Failed to set optimal PRAGMA settings: ${error instanceof Error ? error.message : String(error)}`,
        )
        // Apply only basic settings
        db.exec(`
          PRAGMA journal_mode = DELETE;       -- Safe mode
          PRAGMA synchronous = FULL;          -- Safest synchronous mode
          PRAGMA busy_timeout = 5000;         -- 5 second timeout
        `)
      }

      createSchema()
      prepareStatements()

      // Cleanup on startup
      cleanup()
    } catch (error) {
      throw new Error(`Failed to initialize database: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Add yank history
   * - Maximum history count management
   * - Automatic metadata setting
   */
  const add = (entry: Omit<YankEntry, "id" | "size">): Promise<YankEntry> => {
    return Promise.resolve().then(() => {
      const size = new TextEncoder().encode(entry.content).length

      // Size limit check (512KB)
      if (size > 512000) {
        throw new Error(`Content too large: ${size} bytes (max: 512000)`)
      }

      try {
        const result = statements.insert!.run(
          entry.content,
          entry.regtype,
          entry.blockwidth || null,
          entry.timestamp,
          size,
          entry.sourceFile || null,
          entry.sourceLine || null,
          entry.sourceFiletype || null,
        )

        // Delete old entries if max entries exceeded
        cleanup()

        // Return added entry with generated ID
        const addedId = (result as { lastInsertRowid: number }).lastInsertRowid
        return {
          ...entry,
          id: addedId.toString(),
          size,
        }
      } catch (error) {
        throw new Error(`Failed to add yank entry: ${error instanceof Error ? error.message : String(error)}`)
      }
    })
  }

  /**
   * Get latest history
   */
  const getRecent = (limit: number = 100): YankEntry[] => {
    try {
      const rows = statements.selectRecent!.all(Math.min(limit, maxHistory))
      return rows.map((row) => rowToEntry(row as YankHistoryRow))
    } catch (error) {
      logger?.error("database", "Failed to get recent entries", error)
      return []
    }
  }

  /**
   * Get statistics
   */
  const getStats = (): { totalCount: number; maxHistory: number } => {
    try {
      const result = statements.getCount!.get() as CountResult
      return {
        totalCount: result.count,
        maxHistory: maxHistory,
      }
    } catch (_error) {
      return { totalCount: 0, maxHistory: maxHistory }
    }
  }

  /**
   * Get sync status
   * Used for change detection with fast metadata queries
   */
  const getSyncStatus = (): SyncStatus => {
    try {
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
    } catch (error) {
      logger?.error("database", "Failed to get sync status", error)
      return {
        lastTimestamp: 0,
        entryCount: 0,
      }
    }
  }

  /**
   * Close database
   */
  const close = (): void => {
    try {
      db?.close()
    } catch (error) {
      logger?.error("database", "Failed to close database", error)
    }
  }

  // Return public API
  return {
    init,
    add,
    getRecent,
    getStats,
    getSyncStatus,
    close,
  }
}
