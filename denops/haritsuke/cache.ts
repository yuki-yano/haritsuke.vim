import type { YankEntry } from "./types.ts"
import { CACHE_DEFAULTS } from "./constants.ts"

/**
 * In-memory yank history cache management
 *
 * Design philosophy:
 * - Provide fast access
 * - Limit memory usage
 * - LRU (Least Recently Used) behavior
 */

/**
 * YankCache type definition
 */
export type YankCache = {
  add: (entry: YankEntry) => void
  setAll: (entries: YankEntry[]) => void
  get: (index: number) => YankEntry | undefined
  getAll: () => YankEntry[]
  getRecent: (limit: number) => YankEntry[]
  readonly size: number
  clear: () => void
  search: (query: string, limit?: number) => YankEntry[]
  filterByFiletype: (filetype: string) => YankEntry[]
  moveToFront: (entryId: string) => boolean
  getStats: () => {
    totalSize: number
    totalBytes: number
    byFiletype: Record<string, number>
    byRegtype: Record<string, number>
  }
}

/**
 * Function to create YankCache
 */
export const createYankCache = (maxSize: number = 100): YankCache => {
  // Private state
  let entries: YankEntry[] = []

  /**
   * Add history to cache
   * - Always add as new entry (allow duplicates)
   * - Delete old ones if maximum size is exceeded
   */
  const add = (entry: YankEntry): void => {
    // Always add to the front as a new entry
    entries.unshift(entry)

    // Size limit
    if (entries.length > maxSize) {
      entries.splice(maxSize)
    }
  }

  /**
   * Set multiple entries at once (used during initialization)
   */
  const setAll = (newEntries: YankEntry[]): void => {
    entries = newEntries.slice(0, maxSize)
  }

  /**
   * Get entry at specified index
   */
  const get = (index: number): YankEntry | undefined => {
    return entries[index]
  }

  /**
   * Get all entries
   */
  const getAll = (): YankEntry[] => {
    return [...entries]
  }

  /**
   * Get latest N entries
   */
  const getRecent = (limit: number): YankEntry[] => {
    return entries.slice(0, limit)
  }

  /**
   * Clear cache
   */
  const clear = (): void => {
    entries = []
  }

  /**
   * Search functionality (partial content match)
   */
  const search = (query: string, limit: number = CACHE_DEFAULTS.SEARCH_LIMIT): YankEntry[] => {
    const lowerQuery = query.toLowerCase()
    return entries
      .filter((entry) => entry.content.toLowerCase().includes(lowerQuery))
      .slice(0, limit)
  }

  /**
   * Filter by file type
   */
  const filterByFiletype = (filetype: string): YankEntry[] => {
    return entries.filter((entry) => entry.sourceFiletype === filetype)
  }

  /**
   * Move an existing entry to the front
   * Returns true if the entry was found and moved, false otherwise
   */
  const moveToFront = (entryId: string): boolean => {
    const index = entries.findIndex((e) => e.id === entryId)
    if (index === -1) {
      return false
    }

    // Already at front
    if (index === 0) {
      return true
    }

    // Remove from current position and add to front
    const [entry] = entries.splice(index, 1)
    entries.unshift(entry)
    return true
  }

  /**
   * Statistics information
   */
  const getStats = (): {
    totalSize: number
    totalBytes: number
    byFiletype: Record<string, number>
    byRegtype: Record<string, number>
  } => {
    let totalBytes = 0
    const byFiletype: Record<string, number> = {}
    const byRegtype: Record<string, number> = { v: 0, V: 0, b: 0 }

    for (const entry of entries) {
      totalBytes += entry.size || 0

      if (entry.sourceFiletype) {
        byFiletype[entry.sourceFiletype] = (byFiletype[entry.sourceFiletype] || 0) + 1
      }

      byRegtype[entry.regtype]++
    }

    return {
      totalSize: entries.length,
      totalBytes,
      byFiletype,
      byRegtype,
    }
  }

  // Return public API
  return {
    add,
    setAll,
    get,
    getAll,
    getRecent,
    get size() {
      return entries.length
    },
    clear,
    search,
    filterByFiletype,
    moveToFront,
    getStats,
  }
}
