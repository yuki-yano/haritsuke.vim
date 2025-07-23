/**
 * Tests for history navigation
 */

import { assertEquals, describe, it, spy } from "../deps/test.ts"
import type { Denops } from "../deps/denops.ts"
import { navigateNext, navigatePrev } from "../core/history-navigation.ts"
import type { PluginState } from "../state/plugin-state.ts"
import type { YankEntry } from "../types.ts"
import { createMockPluginState } from "./test-helpers.ts"

// Mock Denops
const createMockDenops = (callHandler?: (fn: string, ...args: unknown[]) => Promise<unknown>): Denops => {
  return {
    cmd: spy(() => Promise.resolve()),
    eval: spy(() => Promise.resolve()),
    call: spy(callHandler || (() => Promise.resolve())),
  } as unknown as Denops
}

// Mock logger
const createMockLogger = () => {
  const logs: Array<{ category: string; message: string; data?: unknown }> = []
  return {
    log: (category: string, message: string, data?: unknown) => {
      logs.push({ category, message, data })
    },
    error: () => {},
    time: () => {},
    timeEnd: () => {},
    getLogs: () => logs,
  }
}

describe("history navigation", () => {
  describe("navigatePrev", () => {
    it("returns early when components are missing", async () => {
      const mockDenops = createMockDenops()
      const mockLogger = createMockLogger()
      const syncIfNeededSpy = spy(() => Promise.resolve(false))

      const state = createMockPluginState({
        isInitialized: () => false,
        logger: mockLogger,
        database: null,
        cache: null,
      })

      await navigatePrev(mockDenops, state, [], {
        syncIfNeeded: syncIfNeededSpy,
      })

      // Verify sync was not called
      assertEquals(syncIfNeededSpy.calls.length, 0)

      // Verify logging
      const logs = mockLogger.getLogs()
      const notReadyLog = logs.find(
        (log) => log.category === "cycle" && log.message === "cyclePrev: not ready",
      )
      assertEquals(!!notReadyLog, true)
    })

    it("applies previous entry when rounder is active", async () => {
      const mockDenops = createMockDenops((fn: string) => {
        if (fn === "bufnr") {
          return Promise.resolve(1)
        }
        return Promise.resolve()
      })
      const mockLogger = createMockLogger()
      const syncIfNeededSpy = spy(() => Promise.resolve(false))

      const mockEntry: YankEntry = {
        id: "test-id",
        content: "test content",
        regtype: "v",
        timestamp: Date.now(),
      }

      const applyHistoryEntrySpy = spy(
        (
          _denops: Denops,
          _entry: YankEntry,
          _undoSeq: number,
          _pasteInfo: { mode: string; count: number; register: string },
          _undoFilePath?: string | null,
          _rounder?: unknown,
        ) => Promise.resolve(),
      )
      const previousSpy = spy(() => Promise.resolve({ entry: mockEntry, undoSeq: 10 }))
      const isActiveSpy = spy(() => true)
      const getPasteInfoSpy = spy(() => ({ mode: "p", count: 1, register: '"' }))
      const getUndoFilePathSpy = spy(() => "/tmp/undo.txt")

      const mockRounder = {
        isActive: isActiveSpy,
        previous: previousSpy,
        getPasteInfo: getPasteInfoSpy,
        getUndoFilePath: getUndoFilePathSpy,
        getCurrentEntry: spy(() => mockEntry),
        getPositionInfo: spy(() => ({ currentIndex: 1, totalCount: 3 })),
      }

      const getRounderSpy = spy(() => Promise.resolve(mockRounder))

      const state = createMockPluginState({
        logger: mockLogger,
        rounderManager: {
          getRounder: getRounderSpy,
        } as unknown as PluginState["rounderManager"],
        pasteHandler: {
          applyHistoryEntry: applyHistoryEntrySpy,
        } as unknown as PluginState["pasteHandler"],
      })

      await navigatePrev(mockDenops, state, [], {
        syncIfNeeded: syncIfNeededSpy,
      })

      // Verify sync was called
      assertEquals(syncIfNeededSpy.calls.length, 1)

      // Verify rounder operations
      assertEquals(getRounderSpy.calls.length, 1)
      assertEquals(isActiveSpy.calls.length, 2) // Called twice: once for check, once for logging
      assertEquals(previousSpy.calls.length, 1)

      // Verify applyHistoryEntry was called with correct arguments
      assertEquals(applyHistoryEntrySpy.calls.length, 1)
      assertEquals(applyHistoryEntrySpy.calls[0]?.args[0], mockDenops)
      assertEquals(applyHistoryEntrySpy.calls[0]?.args[1], mockEntry)
      assertEquals(applyHistoryEntrySpy.calls[0]?.args[2], 10)
      const pasteInfo = applyHistoryEntrySpy.calls[0]?.args[3]
      assertEquals(pasteInfo.mode, "p")
      assertEquals(pasteInfo.count, 1)
      assertEquals(pasteInfo.register, '"')
      assertEquals(applyHistoryEntrySpy.calls[0]?.args[4], "/tmp/undo.txt")
      assertEquals(applyHistoryEntrySpy.calls[0]?.args[5], mockRounder)
    })
  })

  describe("navigateNext", () => {
    it("applies next entry when rounder is active", async () => {
      const mockDenops = createMockDenops((fn: string) => {
        if (fn === "bufnr") {
          return Promise.resolve(1)
        }
        return Promise.resolve()
      })
      const mockLogger = createMockLogger()
      const syncIfNeededSpy = spy(() => Promise.resolve(false))

      const mockEntry: YankEntry = {
        id: "test-id-2",
        content: "test content 2",
        regtype: "V",
        timestamp: Date.now(),
      }

      const applyHistoryEntrySpy = spy(
        (
          _denops: Denops,
          _entry: YankEntry,
          _undoSeq: number,
          _pasteInfo: { mode: string; count: number; register: string },
          _undoFilePath?: string | null,
          _rounder?: unknown,
        ) => Promise.resolve(),
      )
      const nextSpy = spy(() => Promise.resolve({ entry: mockEntry, undoSeq: 15 }))
      const isActiveSpy = spy(() => true)
      const getPasteInfoSpy = spy(() => ({ mode: "P", count: 1, register: '"' }))
      const getUndoFilePathSpy = spy(() => null)

      const mockRounder = {
        isActive: isActiveSpy,
        next: nextSpy,
        getPasteInfo: getPasteInfoSpy,
        getUndoFilePath: getUndoFilePathSpy,
        getPositionInfo: spy(() => ({ currentIndex: 2, totalCount: 3 })),
      }

      const getRounderSpy = spy(() => Promise.resolve(mockRounder))

      const state = createMockPluginState({
        logger: mockLogger,
        rounderManager: {
          getRounder: getRounderSpy,
        } as unknown as PluginState["rounderManager"],
        pasteHandler: {
          applyHistoryEntry: applyHistoryEntrySpy,
        } as unknown as PluginState["pasteHandler"],
      })

      await navigateNext(mockDenops, state, [], {
        syncIfNeeded: syncIfNeededSpy,
      })

      // Verify sync was called
      assertEquals(syncIfNeededSpy.calls.length, 1)

      // Verify rounder operations
      assertEquals(getRounderSpy.calls.length, 1)
      assertEquals(isActiveSpy.calls.length, 1)
      assertEquals(nextSpy.calls.length, 1)

      // Verify applyHistoryEntry was called with correct arguments
      assertEquals(applyHistoryEntrySpy.calls.length, 1)
      assertEquals(applyHistoryEntrySpy.calls[0]?.args[0], mockDenops)
      assertEquals(applyHistoryEntrySpy.calls[0]?.args[1], mockEntry)
      assertEquals(applyHistoryEntrySpy.calls[0]?.args[2], 15)
      assertEquals(applyHistoryEntrySpy.calls[0]?.args[3], { mode: "P", count: 1, register: '"' })
      assertEquals(applyHistoryEntrySpy.calls[0]?.args[4], null)
      assertEquals(applyHistoryEntrySpy.calls[0]?.args[5], mockRounder)
    })
  })
})
