/**
 * Tests for event processing skip during history application
 */

import { assertEquals, describe, it, spy } from "../deps/test.ts"
import { createApi } from "../api/api.ts"
import type { PluginState } from "../state/plugin-state.ts"
import { createMockDenops, createMockLogger, createMockPluginState, type MockLogEntry } from "./test-helpers.ts"

describe("createApi - event processing skip during history application", () => {
  describe("onCursorMoved", () => {
    it("skips processing when _haritsuke_applying_history is set", async () => {
      const mockLogger = createMockLogger()
      const mockDenops = createMockDenops({
        eval: (expr: string) => {
          if (expr === "get(g:, '_haritsuke_applying_history', 0)") {
            return Promise.resolve(1)
          }
          if (expr === "b:changedtick") {
            return Promise.resolve(10)
          }
          return Promise.resolve(0)
        },
      })

      const state = createMockPluginState({
        logger: mockLogger,
        database: {} as unknown as PluginState["database"],
      })

      const api = createApi(mockDenops, state)

      // Call onCursorMoved
      await api.onCursorMoved([])

      // Check that processing was skipped
      const logs = mockLogger.getLogs()
      const skipLog = logs.find(
        (log: MockLogEntry) => log.category === "cursor" && log.message === "Skipping onCursorMoved - applying history",
      )
      assertEquals(!!skipLog, true, "Should log that processing was skipped")

      // Verify eval was called to check the flag
      const evalCalls = (mockDenops.eval as ReturnType<typeof spy>).calls
      const flagCheckCall = evalCalls.find(
        (call) => call.args[0] === "get(g:, '_haritsuke_applying_history', 0)",
      )
      assertEquals(!!flagCheckCall, true, "Should check _haritsuke_applying_history flag")
    })

    it("processes normally when _haritsuke_applying_history is not set", async () => {
      const mockLogger = createMockLogger()
      const mockDenops = createMockDenops({
        eval: (expr: string) => {
          if (expr === "get(g:, '_haritsuke_applying_history', 0)") {
            return Promise.resolve(0)
          }
          if (expr === "b:changedtick") {
            return Promise.resolve(10)
          }
          return Promise.resolve(0)
        },
      })

      const state = createMockPluginState({
        logger: mockLogger,
        database: {} as unknown as PluginState["database"],
        highlightManager: { clear: spy(() => Promise.resolve()) } as unknown as PluginState["highlightManager"],
      })

      const api = createApi(mockDenops, state)

      // Call onCursorMoved
      await api.onCursorMoved([])

      // Check that processing was NOT skipped
      const logs = mockLogger.getLogs()
      const skipLog = logs.find(
        (log: MockLogEntry) => log.category === "cursor" && log.message === "Skipping onCursorMoved - applying history",
      )
      assertEquals(!!skipLog, false, "Should not log skip message")

      // Should have normal cursor moved log
      const normalLog = logs.find(
        (log: MockLogEntry) => log.category === "cursor" && log.message === "onCursorMoved called",
      )
      assertEquals(!!normalLog, true, "Should have normal processing log")
    })
  })

  describe("onStopRounder", () => {
    it("skips processing when _haritsuke_applying_history is set", async () => {
      const mockLogger = createMockLogger()
      const mockDenops = createMockDenops({
        eval: (expr: string) => {
          if (expr === "get(g:, '_haritsuke_applying_history', 0)") {
            return Promise.resolve(1)
          }
          return Promise.resolve(0)
        },
      })

      const state = createMockPluginState({
        logger: mockLogger,
        database: null,
      })

      const api = createApi(mockDenops, state)

      // Call onStopRounder
      await api.onStopRounder([])

      // Check that processing was skipped
      const logs = mockLogger.getLogs()
      const skipLog = logs.find(
        (log: MockLogEntry) => log.category === "event" && log.message === "Skipping onStopRounder - applying history",
      )
      assertEquals(!!skipLog, true, "Should log that processing was skipped")
    })

    it("processes normally when _haritsuke_applying_history is not set", async () => {
      const mockLogger = createMockLogger()
      const mockDenops = createMockDenops({
        eval: (expr: string) => {
          if (expr === "get(g:, '_haritsuke_applying_history', 0)") {
            return Promise.resolve(0)
          }
          return Promise.resolve(0)
        },
      })

      const state = createMockPluginState({
        logger: mockLogger,
        database: null,
        highlightManager: { clear: spy(() => Promise.resolve()) } as unknown as PluginState["highlightManager"],
      })

      const api = createApi(mockDenops, state)

      // Call onStopRounder
      await api.onStopRounder([])

      // Check that processing was NOT skipped
      const logs = mockLogger.getLogs()
      const skipLog = logs.find(
        (log: MockLogEntry) => log.category === "event" && log.message === "Skipping onStopRounder - applying history",
      )
      assertEquals(!!skipLog, false, "Should not log skip message")

      // Should have normal event log
      const normalLog = logs.find(
        (log: MockLogEntry) => log.category === "event" && log.message === "onStopRounder called",
      )
      assertEquals(!!normalLog, true, "Should have normal processing log")
    })
  })
})
