/**
 * Plugin state management module
 * Centralized management of all global state
 */

import type { YankDatabase } from "../data/database.ts"
import type { YankCache } from "../data/cache.ts"
import type { RounderManager } from "../core/rounder.ts"
import type { DebugLogger } from "../utils/debug-logger.ts"
import type { HighlightManager } from "../vim/highlight.ts"
import type { SyncManager } from "../data/sync-manager.ts"
import type { RegisterMonitor } from "../events/register-monitor.ts"
import type { PasteHandler } from "../core/paste-handler.ts"
import type { HaritsukeConfig } from "../types.ts"
import type { FileSystemApi, VimApi } from "../vim/vim-api.ts"
import { CONFIG_DEFAULTS } from "../constants.ts"

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
      persist_path: CONFIG_DEFAULTS.PERSIST_PATH,
      max_entries: CONFIG_DEFAULTS.MAX_ENTRIES,
      max_data_size: CONFIG_DEFAULTS.MAX_DATA_SIZE,
      register_keys: CONFIG_DEFAULTS.REGISTER_KEYS,
      debug: CONFIG_DEFAULTS.DEBUG,
      use_region_hl: CONFIG_DEFAULTS.USE_REGION_HL,
      region_hl_groupname: CONFIG_DEFAULTS.REGION_HL_GROUPNAME,
      smart_indent: CONFIG_DEFAULTS.SMART_INDENT,
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
