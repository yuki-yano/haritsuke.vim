/**
 * Constants used throughout the application
 */

// Database constants
export const DATABASE = {
  FILE_NAME: "history.db",
  MAX_CONTENT_SIZE: 512000, // 512KB limit for content size
  CACHE_SIZE: -2000, // 2MB cache for SQLite
  BUSY_TIMEOUT: 5000, // 5 second timeout for SQLite locks
} as const

// SQLite PRAGMA settings
export const SQLITE_PRAGMA = {
  OPTIMAL: {
    JOURNAL_MODE: "WAL", // Write-Ahead Logging for multi-process support
    SYNCHRONOUS: "NORMAL", // Balanced synchronous mode
    CACHE_SIZE: DATABASE.CACHE_SIZE,
    TEMP_STORE: "MEMORY", // Temporary data in memory
    BUSY_TIMEOUT: DATABASE.BUSY_TIMEOUT,
    WAL_CHECKPOINT: "TRUNCATE", // Periodic WAL file cleanup
  },
  FALLBACK: {
    JOURNAL_MODE: "DELETE", // Safe mode
    SYNCHRONOUS: "FULL", // Safest synchronous mode
    BUSY_TIMEOUT: DATABASE.BUSY_TIMEOUT,
  },
} as const

// File system constants
export const FILE_SYSTEM = {
  UNDO_FILE_PREFIX: "haritsuke-undo-",
  UNDO_FILE_SUFFIX: ".txt",
} as const

// Visual mode constants
export const VISUAL_MODE = {
  CHAR: "v",
  LINE: "V",
  BLOCK: "\x16", // Ctrl-V
} as const

// Register type constants
export const REGISTER_TYPE = {
  CHAR: "v" as const,
  LINE: "V" as const,
  BLOCK: "b" as const,
} as const

// Special registers
export const SPECIAL_REGISTERS = {
  BLACK_HOLE: "_",
  UNNAMED: '"',
} as const

// Cache defaults
export const CACHE_DEFAULTS = {
  SEARCH_LIMIT: 20,
} as const

// Timer constants
export const TIMER = {
  CURSOR_MOVED_DELAY: 100, // milliseconds
} as const

// Configuration defaults
export const CONFIG_DEFAULTS = {
  PERSIST_PATH: "", // Will be set to stdpath("data")/haritsuke
  MAX_ENTRIES: 100,
  MAX_DATA_SIZE: 1048576, // 1MB
  REGISTER_KEYS: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"-=.:%/#*+~_',
  DEBUG: false,
  USE_REGION_HL: true,
  REGION_HL_GROUPNAME: "HaritsukeRegion",
  SMART_INDENT: true,
} as const
