/**
 * Register monitoring module
 * Detects register content changes and records new yanks
 */

import type { Denops } from "../deps/denops.ts"
import type { YankDatabase } from "../data/database.ts"
import type { YankCache } from "../data/cache.ts"
import type { RounderManager } from "../core/rounder.ts"
import type { DebugLogger } from "../utils/debug-logger.ts"
import type { FileSystemApi, VimApi } from "../vim/vim-api.ts"
import { parseRegtype } from "../utils/utils.ts"
import { withErrorHandling } from "../utils/error-handling.ts"
import { SPECIAL_REGISTERS } from "../constants.ts"

export type RegisterMonitorConfig = {
  stopCachingVariable: string
  registerKeys?: string
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
  config: RegisterMonitorConfig,
  vimApi: VimApi,
  fileSystemApi: FileSystemApi,
  callbacks: RegisterMonitorCallbacks,
): RegisterMonitor => {
  const trackedRegisters = (() => {
    const keys = config.registerKeys ?? ""
    const registers = keys.length > 0 ? Array.from(keys) : [SPECIAL_REGISTERS.UNNAMED]
    const set = new Set<string>(registers)
    // Always track unnamed register to maintain backwards compatibility
    set.add(SPECIAL_REGISTERS.UNNAMED)
    return set
  })()

  type RegisterState = {
    initialized: boolean
    lastContent: string
  }

  const registerStates = new Map<string, RegisterState>()

  const getRegisterState = (register: string): RegisterState => {
    if (!registerStates.has(register)) {
      registerStates.set(register, { initialized: false, lastContent: "" })
    }
    return registerStates.get(register)!
  }

  const resolveEventRegister = async (isFromTextYankPost: boolean): Promise<string> => {
    if (!isFromTextYankPost) {
      return SPECIAL_REGISTERS.UNNAMED
    }

    try {
      const regname = await vimApi.eval("get(v:event, 'regname', '\"')") as unknown
      if (typeof regname === "string" && regname.length > 0) {
        return regname
      }
    } catch (error) {
      logger?.error("register", "Failed to resolve yank register from v:event", error)
    }
    return SPECIAL_REGISTERS.UNNAMED
  }

  const stringifyRegisterContent = (content: unknown): string => {
    if (Array.isArray(content)) {
      return content.join("\n")
    }
    if (typeof content === "string") {
      return content
    }
    return ""
  }

  return {
    checkChanges: async (denops: Denops, isFromTextYankPost = false): Promise<void> => {
      if (!database || !cache) {
        logger?.log("register", "checkRegisterChanges: no database or cache")
        return
      }

      await withErrorHandling(
        async () => {
          const register = await resolveEventRegister(isFromTextYankPost)
          if (!trackedRegisters.has(register)) {
            logger?.log("register", "Skipping untracked register", { register })
            return
          }

          const registerState = getRegisterState(register)
          const rawContent = await vimApi.getreg(register)
          const contentStr = stringifyRegisterContent(rawContent)

          if (!contentStr) {
            return
          }

          if (!registerState.initialized) {
            registerState.initialized = true
            if (!isFromTextYankPost) {
              registerState.lastContent = contentStr
              logger?.log("register", "Initialized register content", {
                register,
                content: contentStr.slice(0, 30),
                contentLength: contentStr.length,
              })
              return
            }
          }

          logger?.log("register", "checkRegisterChanges content", {
            register,
            content: contentStr.slice(0, 30),
            lastContent: registerState.lastContent.slice(0, 30),
            isArray: Array.isArray(rawContent),
            contentLength: contentStr.length,
          })

          if (contentStr === registerState.lastContent) {
            return
          }

          registerState.lastContent = contentStr
          const regtype = await vimApi.getregtype(register)

          let rounderWasActive = false
          if (rounderManager) {
            const bufnr = await vimApi.bufnr("%")
            const rounder = await rounderManager.getRounder(denops, bufnr)

            if (rounder.isActive()) {
              rounderWasActive = true
              logger?.log("register", "New yank detected during history cycling", { register })

              const undoFilePath = rounder.getUndoFilePath()
              if (undoFilePath) {
                try {
                  await fileSystemApi.remove(undoFilePath)
                  logger?.log("undo", "Deleted undo file", { undoFilePath })
                } catch (e) {
                  if (e instanceof Deno.errors.NotFound) {
                    logger?.log("undo", "Undo file already removed", { undoFilePath })
                  } else {
                    logger?.error("undo", "Failed to delete undo file", e)
                  }
                }
              }
              rounder.stop()
              await callbacks.clearHighlight(denops)
              logger?.log("rounder", "Rounder stopped due to new yank")
            }
          }

          const timestamp = Date.now()
          logger?.log("register", "Adding new yank to database", {
            register,
            content: contentStr.trim().slice(0, 50).replace(/\n/g, "\\n"),
            regtype,
            timestamp,
            wasHistoryCycling: rounderWasActive,
          })

          const entry = await database.add({
            content: contentStr,
            regtype: parseRegtype(regtype),
            timestamp,
            register,
          })

          cache.add(entry)

          logger?.log("register", "New yank detected and stored", {
            id: entry.id,
            register,
            content: contentStr.trim().slice(0, 50).replace(/\n/g, "\\n"),
            timestamp: entry.timestamp,
            cacheSize: cache.size,
            stoppedRounder: rounderWasActive,
            topCacheEntries: cache.getRecent(5).map((e, i) => ({
              index: i,
              id: e.id,
              register: e.register,
              content: e.content.trim().slice(0, 30).replace(/\n/g, "\\n"),
            })),
          })
        },
        "register checkChanges",
        logger,
      )
    },

    getLastContent: (): string => {
      return registerStates.get(SPECIAL_REGISTERS.UNNAMED)?.lastContent ?? ""
    },

    reset: (): void => {
      registerStates.clear()
    },
  }
}
