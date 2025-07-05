/**
 * Test helper utilities
 */

import { spy } from "./deps/test.ts"
import type { PluginState } from "./plugin-state.ts"
import { createMockFileSystemApi, createMockVimApi } from "./vim-api.ts"
import { createYankCache } from "./cache.ts"

/**
 * Create a mock PluginState with sensible defaults
 */
export const createMockPluginState = (overrides?: Partial<PluginState>): PluginState => {
  const base: PluginState = {
    config: {
      persist_path: "",
      max_entries: 100,
      max_data_size: 1048576,
      register_keys: "",
      debug: false,
      use_region_hl: false,
      region_hl_groupname: "HaritsukePasteRegion",
    },
    database: {
      getStats: () => ({ entryCount: 0, totalSize: 0, oldestTimestamp: 0, newestTimestamp: 0 }),
      addEntry: spy(() => Promise.resolve()),
      getAllEntries: spy(() => Promise.resolve([])),
      vacuum: spy(() => Promise.resolve()),
      close: spy(() => Promise.resolve()),
    } as unknown as PluginState["database"],
    cache: createYankCache(100),
    rounderManager: {
      getRounder: spy(() =>
        Promise.resolve({
          isActive: () => false,
          stop: spy(),
        })
      ),
    } as unknown as PluginState["rounderManager"],
    syncManager: null,
    pasteHandler: null,
    registerMonitor: null,
    logger: null,
    highlightManager: null,
    vimApi: createMockVimApi(),
    fileSystemApi: createMockFileSystemApi(),
    isInitialized: () => true,
    reset: () => {},
  }

  return { ...base, ...overrides } as PluginState
}
