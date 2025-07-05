/**
 * Tests for event processing skip during history application
 */

import { assertEquals, spy } from "../deps/test.ts"
import type { Denops } from "../deps/denops.ts"
import { createApi } from "../api/api.ts"
import type { PluginState } from "../state/plugin-state.ts"
import { createMockPluginState } from "./test-helpers.ts"

type LogEntry = { category: string; message: string }

// Mock logger to track log calls
const createMockLogger = () => {
  const logs: LogEntry[] = []
  return {
    log: (category: string, message: string) => {
      logs.push({ category, message })
    },
    error: () => {},
    time: () => {},
    timeEnd: () => {},
    getLogs: () => logs,
  }
}

// Mock Denops
const createMockDenops = (applyingHistory: number = 0): Denops => {
  return {
    cmd: spy(() => Promise.resolve()),
    eval: spy((expr: string) => {
      if (expr === "get(g:, '_haritsuke_applying_history', 0)") {
        return Promise.resolve(applyingHistory)
      }
      if (expr === "b:changedtick") {
        return Promise.resolve(10)
      }
      return Promise.resolve(0)
    }),
    call: spy(() => Promise.resolve()),
  } as unknown as Denops
}

Deno.test("createApi - onCursorMoved: skips processing when _haritsuke_applying_history is set", async () => {
  const mockLogger = createMockLogger()
  const mockDenops = createMockDenops(1) // _haritsuke_applying_history = 1

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
    (log: LogEntry) => log.category === "cursor" && log.message === "Skipping onCursorMoved - applying history",
  )
  assertEquals(!!skipLog, true, "Should log that processing was skipped")

  // Verify eval was called to check the flag
  const evalCalls = (mockDenops.eval as ReturnType<typeof spy>).calls
  const flagCheckCall = evalCalls.find(
    (call) => call.args[0] === "get(g:, '_haritsuke_applying_history', 0)",
  )
  assertEquals(!!flagCheckCall, true, "Should check _haritsuke_applying_history flag")
})

Deno.test("createApi - onCursorMoved: processes normally when _haritsuke_applying_history is not set", async () => {
  const mockLogger = createMockLogger()
  const mockDenops = createMockDenops(0) // _haritsuke_applying_history = 0

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
    (log: LogEntry) => log.category === "cursor" && log.message === "Skipping onCursorMoved - applying history",
  )
  assertEquals(!!skipLog, false, "Should not log skip message")

  // Should have normal cursor moved log
  const normalLog = logs.find(
    (log: LogEntry) => log.category === "cursor" && log.message === "onCursorMoved called",
  )
  assertEquals(!!normalLog, true, "Should have normal processing log")
})

Deno.test("createApi - onStopRounder: skips processing when _haritsuke_applying_history is set", async () => {
  const mockLogger = createMockLogger()
  const mockDenops = createMockDenops(1) // _haritsuke_applying_history = 1

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
    (log: LogEntry) => log.category === "event" && log.message === "Skipping onStopRounder - applying history",
  )
  assertEquals(!!skipLog, true, "Should log that processing was skipped")
})

Deno.test("createApi - onStopRounder: processes normally when _haritsuke_applying_history is not set", async () => {
  const mockLogger = createMockLogger()
  const mockDenops = createMockDenops(0) // _haritsuke_applying_history = 0

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
    (log: LogEntry) => log.category === "event" && log.message === "Skipping onStopRounder - applying history",
  )
  assertEquals(!!skipLog, false, "Should not log skip message")

  // Should have normal event log
  const normalLog = logs.find(
    (log: LogEntry) => log.category === "event" && log.message === "onStopRounder called",
  )
  assertEquals(!!normalLog, true, "Should have normal processing log")
})
