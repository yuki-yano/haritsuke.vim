/**
 * Test helper utilities
 */

import { spy } from "../deps/test.ts"
import type { Denops } from "../deps/denops.ts"
import type { PluginState } from "../state/plugin-state.ts"
import type { YankEntry } from "../types.ts"
import type { PasteHandlerCallbacks } from "../core/paste-handler.ts"
import { createMockFileSystemApi, createMockVimApi, type VimApi } from "../vim/vim-api.ts"
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
          register: '"',
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
          start: spy(() => Promise.resolve()),
          next: spy(() => Promise.resolve(null)),
          previous: spy(() => Promise.resolve(null)),
          stop: spy(),
          isActive: spy(() => false),
          getPasteInfo: spy(() => null),
          setUndoSeq: spy(),
          setUndoFilePath: spy(),
          getUndoFilePath: spy(() => null),
          setCursorPos: spy(),
          getCursorPos: spy(() => null),
          setChangedTick: spy(),
          getChangedTick: spy(() => 0),
          getCurrentEntry: spy(() => null),
          setPasteRange: spy(),
          getPasteRange: spy(() => null),
          setBeforePasteCursorPos: spy(),
          getBeforePasteCursorPos: spy(() => null),
          isFirstCycle: spy(() => true),
        })
      ),
      deleteRounder: spy(),
      clear: spy(),
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

export type MockLogEntry = {
  category: string
  message: string
  data?: unknown
}

export const createMockLogger = () => {
  const logs: MockLogEntry[] = []
  return {
    log: spy((category: string, message: string, data?: unknown) => {
      logs.push({ category, message, data })
    }),
    error: spy(() => {}),
    time: spy(() => {}),
    timeEnd: spy(() => {}),
    getLogs: () => logs,
  }
}

export type DenopsMockHandlers = {
  cmd?: (cmd: string) => Promise<unknown> | unknown
  eval?: (expr: string) => Promise<unknown> | unknown
  call?: (fn: string, ...args: unknown[]) => Promise<unknown> | unknown
  batch?: (...args: unknown[]) => Promise<unknown> | unknown
  dispatch?: (...args: unknown[]) => Promise<unknown> | unknown
}

export const createMockDenops = (handlers: DenopsMockHandlers = {}): Denops => {
  return {
    cmd: spy((cmd: string) => Promise.resolve(handlers.cmd ? handlers.cmd(cmd) : undefined)),
    eval: spy((expr: string) => {
      if (handlers.eval) {
        return Promise.resolve(handlers.eval(expr))
      }
      if (expr === "get(g:, '_haritsuke_applying_history', 0)") return Promise.resolve(0)
      if (expr === "b:changedtick") return Promise.resolve(1)
      return Promise.resolve(1)
    }),
    call: spy((fn: string, ...args: unknown[]) => {
      if (handlers.call) {
        return Promise.resolve(handlers.call(fn, ...args))
      }
      if (fn === "bufnr" && args[0] === "%") return Promise.resolve(1)
      if (fn === "getpos") return Promise.resolve([0, 1, 1, 0])
      if (fn === "line") return Promise.resolve(1)
      if (fn === "getline") return Promise.resolve("")
      if (fn === "undotree") return Promise.resolve({ seq_cur: 0, seq_last: 0, entries: [] })
      return Promise.resolve(undefined)
    }),
    batch: spy((...args: unknown[]) => Promise.resolve(handlers.batch ? handlers.batch(...args) : undefined)),
    dispatch: spy((...args: unknown[]) => Promise.resolve(handlers.dispatch ? handlers.dispatch(...args) : undefined)),
  } as unknown as Denops
}

export const createTestYankEntry = (overrides: Partial<YankEntry> = {}): YankEntry => {
  return {
    id: "1",
    content: "test",
    regtype: "v",
    timestamp: Date.now(),
    register: '"',
    ...overrides,
  }
}

export const createMockPasteHandlerCallbacks = (): PasteHandlerCallbacks => {
  return {
    applyHighlight: spy(() => Promise.resolve()),
    clearHighlight: spy(() => Promise.resolve()),
  }
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
          const lineNum = parseInt(lineMatch[1], 10)
          return Promise.resolve(lineHandlers[`strlen_${lineNum}`] || 10)
        }
      }
      if (expr.startsWith("getregtype(")) {
        // Note: This regex only matches single-character register names
        // This is intentional as Vim registers are single characters (a-z, A-Z, 0-9, ", etc.)
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
