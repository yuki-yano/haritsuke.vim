/**
 * Test helper utilities
 */

import { spy } from "../deps/test.ts"
import type { PluginState } from "../state/plugin-state.ts"
import { createMockFileSystemApi, createMockVimApi } from "../vim/vim-api.ts"
import type { VimApi } from "../vim/vim-api.ts"
import { createYankCache } from "../data/cache.ts"

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
      init: spy(() => Promise.resolve()),
      add: spy(() =>
        Promise.resolve({
          id: "1",
          content: "test",
          regtype: "v" as const,
          timestamp: Date.now(),
          size: 4,
        })
      ),
      getRecent: spy(() => []),
      getSyncStatus: () => ({ lastTimestamp: 0, entryCount: 0 }),
      close: spy(),
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

/**
 * Common mock handlers for VimApi
 */
export type VimApiMockHandlers = {
  commands?: string[]
  evalHandlers?: Record<string, unknown>
  positionHandlers?: Record<string, number[]>
  lineHandlers?: Record<string, number>
  registerContent?: Record<string, string | string[]>
  registerTypes?: Record<string, string>
}

/**
 * Create a VimApi mock with common test patterns
 * This helper simplifies creating VimApi mocks for tests by providing
 * a convenient way to capture commands and define custom behaviors
 */
export const createCommonVimApiMock = (handlers: VimApiMockHandlers = {}): VimApi => {
  const {
    commands = [],
    evalHandlers = {},
    positionHandlers = {},
    lineHandlers = {},
    registerContent = {},
    registerTypes = {},
  } = handlers

  return createMockVimApi({
    cmd: (cmd: string) => {
      commands.push(cmd)
      return Promise.resolve()
    },
    eval: (expr: string) => {
      // Check custom handlers first
      if (expr in evalHandlers) {
        return Promise.resolve(evalHandlers[expr])
      }
      
      // Common eval patterns
      if (expr === "&undolevels") return Promise.resolve(1000)
      if (expr === "b:changedtick") return Promise.resolve(1)
      if (expr.startsWith("strlen(getline(")) {
        const lineMatch = expr.match(/strlen\(getline\((\d+)\)\)/)
        if (lineMatch) {
          const lineNum = parseInt(lineMatch[1])
          return Promise.resolve(lineHandlers[`strlen_${lineNum}`] || 10)
        }
      }
      if (expr.startsWith("getregtype(")) {
        const regMatch = expr.match(/getregtype\(['"](.)['"]\)/)
        if (regMatch) {
          const reg = regMatch[1]
          return Promise.resolve(registerTypes[reg] || "v")
        }
      }
      
      return Promise.resolve(undefined)
    },
    getpos: (expr: string) => {
      if (expr in positionHandlers) {
        return Promise.resolve(positionHandlers[expr])
      }
      return Promise.resolve([0, 1, 1, 0])
    },
    line: (expr: string) => {
      if (expr in lineHandlers) {
        return Promise.resolve(lineHandlers[expr])
      }
      if (expr === "$") return Promise.resolve(1)
      return Promise.resolve(1)
    },
    getreg: (register: string) => {
      if (register in registerContent) {
        return Promise.resolve(registerContent[register])
      }
      return Promise.resolve("")
    },
    getregtype: (register: string) => {
      if (register in registerTypes) {
        return Promise.resolve(registerTypes[register])
      }
      return Promise.resolve("v")
    },
  })
}
