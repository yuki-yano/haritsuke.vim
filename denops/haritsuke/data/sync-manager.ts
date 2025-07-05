/**
 * Synchronization management module
 * Manages yank history synchronization between multiple Neovim instances
 */

import type { SyncStatus, YankDatabase } from "./database.ts"
import type { YankCache } from "./cache.ts"
import type { DebugLogger } from "../utils/debug-logger.ts"

export type SyncConfig = {
  maxEntries: number
}

export type SyncManager = {
  syncIfNeeded: () => Promise<boolean>
  getLastStatus: () => SyncStatus | null
  updateStatus: () => void
}

/**
 * Create synchronization management functionality
 * Implements efficient synchronization with hybrid approach
 */
export const createSyncManager = (
  database: YankDatabase,
  cache: YankCache,
  config: SyncConfig,
  logger: DebugLogger | null = null,
): SyncManager => {
  let lastSyncStatus: SyncStatus | null = null

  return {
    /**
     * Synchronize database and cache as needed
     * @returns true if sync was performed, false otherwise
     */
    syncIfNeeded: (): Promise<boolean> => {
      return Promise.resolve().then(() => {
        const currentStatus = database.getSyncStatus()

        // Fast check: do nothing if no changes
        if (
          lastSyncStatus &&
          currentStatus.lastTimestamp === lastSyncStatus.lastTimestamp &&
          currentStatus.entryCount === lastSyncStatus.entryCount
        ) {
          logger?.log("sync", "No changes detected")
          return false // No sync needed
        }

        logger?.log("sync", "Changes detected, syncing...", {
          lastStatus: lastSyncStatus,
          currentStatus: currentStatus,
        })

        // Get all data only if there are changes
        const entries = database.getRecent(config.maxEntries)
        cache.setAll(entries)
        lastSyncStatus = currentStatus

        logger?.log("sync", `Synced ${entries.length} entries`)

        return true // Sync executed
      })
    },

    /**
     * Get last sync status
     */
    getLastStatus: (): SyncStatus | null => {
      return lastSyncStatus
    },

    /**
     * Update sync status with current database status
     */
    updateStatus: (): void => {
      lastSyncStatus = database.getSyncStatus()
      logger?.log("sync", "Status updated", lastSyncStatus)
    },
  }
}
