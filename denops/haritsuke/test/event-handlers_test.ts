/**
 * Tests for event handlers
 */

import { assertEquals, describe, it, spy } from "../deps/test.ts"
import type { Denops } from "../deps/denops.ts"
import { handleCursorMoved, handleStopRounder, handleTextYankPost } from "../events/event-handlers.ts"
import type { PluginState } from "../state/plugin-state.ts"
import { createMockPluginState } from "./test-helpers.ts"

// Mock Denops
const createMockDenops = (evalHandler?: (expr: string) => Promise<unknown>): Denops => {
  return {
    cmd: spy(() => Promise.resolve()),
    eval: spy(evalHandler || (() => Promise.resolve())),
    call: spy(() => Promise.resolve()),
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

describe("event handlers", () => {
  describe("handleTextYankPost", () => {
    it("calls registerMonitor.checkChanges when all components are present", async () => {
      const mockDenops = createMockDenops()
      const mockLogger = createMockLogger()
      const checkChangesSpy = spy((_denops: Denops) => Promise.resolve())

      const state = createMockPluginState({
        logger: mockLogger,
        registerMonitor: {
          checkChanges: checkChangesSpy,
          reset: () => {},
        } as unknown as PluginState["registerMonitor"],
      })

      await handleTextYankPost(mockDenops, state, [])

      // Verify checkChanges was called
      assertEquals(checkChangesSpy.calls.length, 1)
      assertEquals(checkChangesSpy.calls[0]?.args[0], mockDenops)

      // Verify logging
      const logs = mockLogger.getLogs()
      assertEquals(logs.length, 1)
      assertEquals(logs[0].category, "yank")
      assertEquals(logs[0].message, "onTextYankPost called")
    })

    it("returns early when components are missing", async () => {
      const mockDenops = createMockDenops()
      const mockLogger = createMockLogger()
      const checkChangesSpy = spy((_denops: Denops) => Promise.resolve())

      // Test with missing database
      const stateNoDb = createMockPluginState({
        isInitialized: () => false,
        logger: mockLogger,
        database: null,
        registerMonitor: {
          checkChanges: checkChangesSpy,
          reset: () => {},
        } as unknown as PluginState["registerMonitor"],
      })

      await handleTextYankPost(mockDenops, stateNoDb, [])

      // Verify checkChanges was NOT called
      assertEquals(checkChangesSpy.calls.length, 0)

      // But logging should still happen
      const logs = mockLogger.getLogs()
      assertEquals(logs.length, 1)
      assertEquals((logs[0].data as { database?: boolean })?.database, false)
    })
  })

  describe("handleCursorMoved", () => {
    it("skips processing when _haritsuke_applying_history is set", async () => {
      const mockDenops = createMockDenops((expr: string) => {
        if (expr === "get(g:, '_haritsuke_applying_history', 0)") {
          return Promise.resolve(1)
        }
        return Promise.resolve(0)
      })

      const mockLogger = createMockLogger()
      const stopRounderSpy = spy(() => Promise.resolve())
      const clearHighlightSpy = spy(() => Promise.resolve())

      const state = createMockPluginState({
        logger: mockLogger,
      })

      await handleCursorMoved(mockDenops, state, [], {
        stopRounderWithCleanup: stopRounderSpy,
        clearHighlight: clearHighlightSpy,
      })

      // Verify processing was skipped
      const logs = mockLogger.getLogs()
      const skipLog = logs.find(
        (log) => log.category === "cursor" && log.message === "Skipping onCursorMoved - applying history",
      )
      assertEquals(!!skipLog, true)

      // Verify helpers were not called
      assertEquals(stopRounderSpy.calls.length, 0)
      assertEquals(clearHighlightSpy.calls.length, 0)
    })
  })

  describe("handleStopRounder", () => {
    it("skips processing when _haritsuke_applying_history is set", async () => {
      const mockDenops = createMockDenops((expr: string) => {
        if (expr === "get(g:, '_haritsuke_applying_history', 0)") {
          return Promise.resolve(1)
        }
        return Promise.resolve(0)
      })

      const mockLogger = createMockLogger()
      const stopRounderSpy = spy(() => Promise.resolve())
      const isActiveSpy = spy(() => true)
      const getRounderSpy = spy(() => ({ isActive: isActiveSpy }))

      const state = createMockPluginState({
        logger: mockLogger,
        rounderManager: {
          getRounder: getRounderSpy,
        } as unknown as PluginState["rounderManager"],
      })

      await handleStopRounder(mockDenops, state, [], {
        stopRounderWithCleanup: stopRounderSpy,
      })

      // Verify processing was skipped
      const logs = mockLogger.getLogs()
      const skipLog = logs.find(
        (log) => log.category === "event" && log.message === "Skipping onStopRounder - applying history",
      )
      assertEquals(!!skipLog, true)

      // Verify stopRounder was not called
      assertEquals(stopRounderSpy.calls.length, 0)
    })

    it("stops active rounder", async () => {
      const mockDenops = createMockDenops((expr: string) => {
        if (expr === "get(g:, '_haritsuke_applying_history', 0)") {
          return Promise.resolve(0)
        }
        return Promise.resolve(0)
      })

      const mockLogger = createMockLogger()
      const stopRounderSpy = spy(
        (_denops: Denops, _state: PluginState, _rounder: unknown, _reason: string) => Promise.resolve(),
      )
      const isActiveSpy = spy(() => true)
      const mockRounder = { isActive: isActiveSpy }
      const getRounderSpy = spy(() => Promise.resolve(mockRounder))

      const state = createMockPluginState({
        logger: mockLogger,
        rounderManager: {
          getRounder: getRounderSpy,
        } as unknown as PluginState["rounderManager"],
      })

      await handleStopRounder(mockDenops, state, [], {
        stopRounderWithCleanup: stopRounderSpy,
      })

      // Verify rounder check was performed
      assertEquals(getRounderSpy.calls.length, 1)
      assertEquals(isActiveSpy.calls.length, 1)

      // Verify stopRounder was called
      assertEquals(stopRounderSpy.calls.length, 1)
      assertEquals(stopRounderSpy.calls[0]?.args[0], mockDenops)
      assertEquals(stopRounderSpy.calls[0]?.args[1], state)
      assertEquals(stopRounderSpy.calls[0]?.args[2], mockRounder)
      assertEquals(stopRounderSpy.calls[0]?.args[3], "event triggered")
    })
  })
})
