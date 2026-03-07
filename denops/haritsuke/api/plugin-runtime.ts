import type { Denops } from "../deps/denops.ts"
import { autocmd, fn } from "../deps/denops.ts"
import { join } from "../deps/std.ts"
import { createYankDatabase } from "../data/database.ts"
import { createYankCache } from "../data/cache.ts"
import { createSyncManager } from "../data/sync-manager.ts"
import { createRounderManager, type Rounder } from "../core/rounder.ts"
import { createRounderSessionService, type RounderSessionService } from "../core/rounder-session.ts"
import { createDebugLogger } from "../utils/debug-logger.ts"
import { createHighlightManager } from "../vim/highlight.ts"
import { createRegisterMonitor } from "../events/register-monitor.ts"
import { createPasteHandler } from "../core/paste-handler.ts"
import { createFileSystemApi, createVimApi } from "../vim/vim-api.ts"
import { withErrorHandling } from "../utils/error-handling.ts"
import type { PluginState } from "../state/plugin-state.ts"
import { assignConfigFromArgs } from "./args.ts"

export type PluginRuntime = {
  initialize: (args: unknown) => Promise<void>
  syncIfNeeded: () => Promise<boolean>
  clearHighlight: () => Promise<void>
  applyHighlight: (register: string) => Promise<void>
  stopRounder: (rounder: Rounder, reason: string) => Promise<void>
  getRounderSession: () => RounderSessionService | null
}

export const createPluginRuntime = (
  denops: Denops,
  state: PluginState,
): PluginRuntime => {
  let rounderSession: RounderSessionService | null = null

  const clearHighlight = async (): Promise<void> => {
    if (!state.highlightManager) {
      return
    }
    await state.highlightManager.clear(denops)
  }

  const applyHighlight = async (register: string): Promise<void> => {
    if (!state.highlightManager) {
      return
    }
    await state.highlightManager.apply(denops, register)
  }

  const getRounderSession = (): RounderSessionService | null => {
    if (!state.cache || !state.vimApi || !state.fileSystemApi) {
      return null
    }

    if (!rounderSession) {
      rounderSession = createRounderSessionService({
        cache: state.cache,
        vimApi: state.vimApi,
        fileSystemApi: state.fileSystemApi,
        logger: state.logger,
        shouldUseRegionHighlight: () => state.config.use_region_hl ?? false,
        callbacks: {
          clearHighlight: async () => await clearHighlight(),
          applyHighlight: async (_denops, register) => await applyHighlight(register),
        },
      })
    }

    return rounderSession
  }

  const stopRounder = async (rounder: Rounder, reason: string): Promise<void> => {
    const session = getRounderSession()
    if (!session) {
      throw new Error("Rounder session service is not available")
    }
    await session.stop(denops, rounder, reason)
  }

  const teardownPlugin = async (): Promise<void> => {
    if (state.rounderManager) {
      state.rounderManager.clear()
    }

    if (state.registerMonitor) {
      state.registerMonitor.reset()
    }

    if (state.highlightManager) {
      await withErrorHandling(
        async () => {
          await state.highlightManager!.clear(denops)
        },
        "teardown highlight clear",
        state.logger,
      )
    }

    if (state.database) {
      state.database.close()
    }

    rounderSession = null
  }

  const setupAutocmds = async (): Promise<void> => {
    const isNvim = await fn.has(denops, "nvim")

    await autocmd.group(denops, "Haritsuke", (helper) => {
      helper.define("CursorMoved", "*", `call haritsuke#notify('onCursorMoved')`)
      helper.define("InsertEnter", "*", `call haritsuke#notify('onStopRounder')`)
      helper.define("WinLeave", "*", `call haritsuke#notify('onStopRounder')`)
      helper.define("BufLeave", "*", `call haritsuke#notify('onStopRounder')`)
      helper.define("CmdlineEnter", "*", `call haritsuke#notify('onStopRounder')`)
      helper.define("FocusLost", "*", `call haritsuke#notify('onStopRounder')`)

      if (isNvim) {
        helper.define("TermEnter", "*", `call haritsuke#notify('onStopRounder')`)
      }
    })
  }

  const initializePlugin = async (): Promise<void> => {
    state.logger = createDebugLogger(state.config.debug)

    const dataDir = state.config.persist_path || join(
      await denops.eval('stdpath("data")') as string,
      "haritsuke",
    )

    state.database = createYankDatabase(
      dataDir,
      {
        maxHistory: state.config.max_entries,
        maxDataSize: state.config.max_data_size,
      },
      state.logger,
    )
    await state.database.init()

    state.cache = createYankCache(state.config.max_entries)
    state.cache.setAll(state.database.getRecent(state.config.max_entries))

    state.highlightManager = createHighlightManager({
      regionHlGroupname: state.config.region_hl_groupname,
    }, state.logger)

    state.syncManager = createSyncManager(state.database, state.cache, {
      maxEntries: state.config.max_entries,
    }, state.logger)
    state.syncManager.updateStatus()

    state.rounderManager = createRounderManager(state.config, state.logger)
    state.vimApi = createVimApi(denops)
    state.fileSystemApi = createFileSystemApi()
    rounderSession = null

    state.registerMonitor = createRegisterMonitor(
      state.database,
      state.cache,
      state.rounderManager,
      state.logger,
      {
        stopCachingVariable: "_haritsuke_stop_caching",
        registerKeys: state.config.register_keys,
      },
      state.vimApi,
      {
        stopRounder: async (_denops, rounder, reason) => await stopRounder(rounder, reason),
      },
    )

    state.pasteHandler = createPasteHandler(
      state.logger,
      () => ({
        useRegionHl: state.config.use_region_hl ?? false,
        smartIndent: state.config.smart_indent ?? true,
      }),
      state.vimApi,
      {
        applyHighlight: async (_denops, register) => await applyHighlight(register),
        clearHighlight: async () => await clearHighlight(),
      },
    )

    await setupAutocmds()
    state.logger.log("init", `Initialized with ${state.cache.size} entries`)
  }

  const initialize = async (args: unknown): Promise<void> => {
    assignConfigFromArgs(state.config, args)

    const hadDatabase = !!state.database
    if (hadDatabase) {
      state.logger?.log(
        "init",
        "Reinitializing plugin with updated config",
        state.config,
      )
      await teardownPlugin()
      state.reset()
    }

    await initializePlugin()

    state.logger?.log(
      "init",
      hadDatabase ? "Plugin reinitialized with config" : "Plugin initialized with config",
      state.config,
    )
  }

  const syncIfNeeded = async (): Promise<boolean> => {
    if (!state.syncManager) {
      return false
    }
    return await state.syncManager.syncIfNeeded()
  }

  return {
    initialize,
    syncIfNeeded,
    clearHighlight,
    applyHighlight,
    stopRounder,
    getRounderSession,
  }
}
