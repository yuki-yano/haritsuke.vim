/**
 * Register monitoring module
 * Detects register content changes and records new yanks
 */

import type { Denops } from "./deps/denops.ts"
import type { YankDatabase } from "./database.ts"
import type { YankCache } from "./cache.ts"
import type { RounderManager } from "./rounder.ts"
import type { DebugLogger } from "./debug-logger.ts"
import type { FileSystemApi, VimApi } from "./vim-api.ts"
import { parseRegtype } from "./utils.ts"

export type RegisterMonitorConfig = {
  stopCachingVariable: string
}

export type RegisterMonitor = {
  checkChanges: (denops: Denops, isFromTextYankPost?: boolean) => Promise<void>
  getLastContent: () => string
  reset: () => void
}

export type RegisterMonitorCallbacks = {
  clearHighlight: (denops: Denops) => Promise<void>
}

/**
 * Create register monitoring functionality with dependency injection
 */
export const createRegisterMonitor = (
  database: YankDatabase,
  cache: YankCache,
  rounderManager: RounderManager,
  logger: DebugLogger | null,
  _config: RegisterMonitorConfig,
  vimApi: VimApi,
  fileSystemApi: FileSystemApi,
  callbacks: RegisterMonitorCallbacks,
): RegisterMonitor => {
  let lastRegisterContent = ""
  let isInitialized = false

  return {
    checkChanges: async (denops: Denops, isFromTextYankPost = false): Promise<void> => {
      if (!database || !cache) {
        logger?.log("register", "checkRegisterChanges: no database or cache")
        return
      }

      try {
        // Get current register content
        const content = await vimApi.getreg('"')
        const contentStr = Array.isArray(content) ? content.join("\n") : content || ""

        // Skip empty content
        if (!contentStr) {
          return
        }

        // Handle initialization
        if (!isInitialized) {
          isInitialized = true

          if (isFromTextYankPost) {
            // If called from TextYankPost, this is a real yank that should be saved
            logger?.log("register", "First yank detected via TextYankPost", {
              content: contentStr.slice(0, 30),
              contentLength: contentStr.length,
            })
            // Don't update lastRegisterContent yet - let it be updated after saving
            // Continue to save this yank
          } else {
            // If called from other events (e.g., initialization), skip saving
            lastRegisterContent = contentStr
            logger?.log("register", "Initialized with current register content", {
              content: contentStr.slice(0, 30),
              contentLength: contentStr.length,
            })
            return
          }
        }

        logger?.log("register", "checkRegisterChanges content", {
          content: contentStr.slice(0, 30),
          lastContent: lastRegisterContent.slice(0, 30),
          isArray: Array.isArray(content),
          contentLength: contentStr.length,
        })

        // Check if content has changed
        if (contentStr === lastRegisterContent) {
          return
        }

        // Update last content
        lastRegisterContent = contentStr

        // Get register type
        const regtype = await vimApi.getregtype('"')

        // Check if rounder is active and stop it if new yank detected
        let rounderWasActive = false
        if (rounderManager) {
          const bufnr = await vimApi.bufnr("%")
          const rounder = await rounderManager.getRounder(denops, bufnr)

          if (rounder.isActive()) {
            rounderWasActive = true
            logger?.log("register", "New yank detected during history cycling")

            // Delete undo file if exists
            const undoFilePath = rounder.getUndoFilePath()
            if (undoFilePath) {
              try {
                await fileSystemApi.remove(undoFilePath)
                logger?.log("undo", "Deleted undo file", { undoFilePath })
              } catch (e) {
                // File might already be deleted
                logger?.error("undo", "Failed to delete undo file", e)
              }
            }
            rounder.stop()
            // Clear highlight when rounder stops
            await callbacks.clearHighlight(denops)
            logger?.log("rounder", "Rounder stopped due to new yank")
          }
        }

        // Add to database and cache
        logger?.log("register", "Adding new yank to database", {
          content: contentStr.trim().slice(0, 50).replace(/\n/g, "\\n"),
          regtype,
          timestamp: Date.now(),
          wasHistoryCycling: rounderWasActive,
        })

        const entry = await database.add({
          content: contentStr,
          regtype: parseRegtype(regtype),
          timestamp: Date.now(),
          register: '"',
        })

        cache.add(entry)

        logger?.log("register", "New yank detected and stored", {
          id: entry.id,
          content: contentStr.trim().slice(0, 50).replace(/\n/g, "\\n"),
          timestamp: entry.timestamp,
          cacheSize: cache.size,
          stoppedRounder: rounderWasActive,
          topCacheEntries: cache.getRecent(5).map((e, i) => ({
            index: i,
            id: e.id,
            content: e.content.trim().slice(0, 30).replace(/\n/g, "\\n"),
          })),
        })
      } catch (e) {
        logger?.error("register", "Failed to check register changes", e)
      }
    },

    getLastContent: (): string => {
      return lastRegisterContent
    },

    reset: (): void => {
      lastRegisterContent = ""
      isInitialized = false
    },
  }
}
