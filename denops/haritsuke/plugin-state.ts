/**
 * Plugin state management module
 * Centralized management of all global state
 */

import type { YankDatabase } from "./database.ts"
import type { YankCache } from "./cache.ts"
import type { RounderManager } from "./rounder.ts"
import type { DebugLogger } from "./debug-logger.ts"
import type { HighlightManager } from "./highlight.ts"
import type { SyncManager } from "./sync-manager.ts"
import type { RegisterMonitor } from "./register-monitor.ts"
import type { PasteHandler } from "./paste-handler.ts"
import type { HaritsukeConfig } from "./types.ts"
import type { FileSystemApi, VimApi } from "./vim-api.ts"

export type PluginState = {
  database: YankDatabase | null
  cache: YankCache | null
  rounderManager: RounderManager | null
  logger: DebugLogger | null
  highlightManager: HighlightManager | null
  syncManager: SyncManager | null
  registerMonitor: RegisterMonitor | null
  pasteHandler: PasteHandler | null
  config: HaritsukeConfig
  vimApi: VimApi | null
  fileSystemApi: FileSystemApi | null
  isInitialized: () => boolean
  reset: () => void
}

/**
 * Create plugin state management
 */
export const createPluginState = (): PluginState => {
  const state: PluginState = {
    database: null,
    cache: null,
    rounderManager: null,
    logger: null,
    highlightManager: null,
    syncManager: null,
    registerMonitor: null,
    pasteHandler: null,
    config: {
      persist_path: "",
      max_entries: 100,
      max_data_size: 1048576,
      register_keys: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"-=.:%/#*+~_',
      debug: false,
      use_region_hl: true,
      region_hl_groupname: "HaritsukeRegion",
    },
    vimApi: null,
    fileSystemApi: null,
    isInitialized: () => {
      return !!(
        state.database &&
        state.cache &&
        state.rounderManager &&
        state.logger &&
        state.highlightManager &&
        state.syncManager &&
        state.registerMonitor &&
        state.pasteHandler
      )
    },
    reset: () => {
      state.database = null
      state.cache = null
      state.rounderManager = null
      state.logger = null
      state.highlightManager = null
      state.syncManager = null
      state.registerMonitor = null
      state.pasteHandler = null
      state.vimApi = null
      state.fileSystemApi = null
      // Keep config
    },
  }

  return state
}
