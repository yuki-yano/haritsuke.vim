/**
 * Tests for paste preparation module
 */

import { assertEquals, spy } from "./deps/test.ts"
import type { Denops } from "./deps/denops.ts"
import type { PluginState } from "./plugin-state.ts"
import { generatePasteCommand, initializeRounderForPaste, saveUndoFile } from "./paste-preparation.ts"
import type { PreparePasteData } from "./paste-preparation.ts"
import type { Rounder } from "./rounder.ts"
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

Deno.test("generatePasteCommand - visual mode with default register", () => {
  const data: PreparePasteData = {
    mode: "p",
    vmode: "v",
    count: 1,
    register: '"',
  }
  const cmd = generatePasteCommand(data)
  assertEquals(cmd, "normal! gvp")
})

Deno.test("generatePasteCommand - normal mode with named register", () => {
  const data: PreparePasteData = {
    mode: "P",
    vmode: "n",
    count: 3,
    register: "a",
  }
  const cmd = generatePasteCommand(data)
  assertEquals(cmd, 'normal! "a3P')
})

Deno.test("generatePasteCommand - visual mode with named register", () => {
  const data: PreparePasteData = {
    mode: "gp",
    vmode: "v",
    count: 1,
    register: "b",
  }
  const cmd = generatePasteCommand(data)
  assertEquals(cmd, 'normal! gv"b1gp')
})

Deno.test("saveUndoFile - creates temp file when undo tree has entries", async () => {
  const mockDenops = createMockDenops((fn: string) => {
    if (fn === "undotree") {
      return Promise.resolve({
        seq_cur: 5,
        seq_last: 5,
        entries: [1, 2, 3, 4, 5],
      })
    }
    return Promise.resolve()
  })
  const mockLogger = createMockLogger()

  // Mock Deno.makeTempFile
  const originalMakeTempFile = Deno.makeTempFile
  let tempFileCalled = false
  Deno.makeTempFile = spy((options) => {
    tempFileCalled = true
    assertEquals(options?.prefix, "haritsuke_undo_")
    assertEquals(options?.suffix, ".txt")
    return Promise.resolve("/tmp/haritsuke_undo_12345.txt")
  })

  try {
    const result = await saveUndoFile(mockDenops, mockLogger)
    assertEquals(result, "/tmp/haritsuke_undo_12345.txt")
    assertEquals(tempFileCalled, true)

    // Verify wundo command was called
    const cmdCalls = (mockDenops.cmd as ReturnType<typeof spy>).calls
    assertEquals(cmdCalls.length, 1)
    assertEquals(cmdCalls[0]?.args[0], "silent! wundo /tmp/haritsuke_undo_12345.txt")
  } finally {
    Deno.makeTempFile = originalMakeTempFile
  }
})

Deno.test("saveUndoFile - returns undefined when undo tree is empty", async () => {
  const mockDenops = createMockDenops((fn: string) => {
    if (fn === "undotree") {
      return Promise.resolve({
        seq_cur: 0,
        seq_last: 0,
        entries: [],
      })
    }
    return Promise.resolve()
  })
  const mockLogger = createMockLogger()

  const result = await saveUndoFile(mockDenops, mockLogger)
  assertEquals(result, undefined)

  // Verify no commands were executed
  const cmdCalls = (mockDenops.cmd as ReturnType<typeof spy>).calls
  assertEquals(cmdCalls.length, 0)
})

Deno.test("initializeRounderForPaste - stops active rounder and initializes new one", async () => {
  const mockLogger = createMockLogger()

  // Mock functions
  const isActiveSpy = spy(() => true)
  const stopSpy = spy()
  const startSpy = spy()
  const setBeforePasteCursorPosSpy = spy()

  const mockRounder = {
    isActive: isActiveSpy,
    stop: stopSpy,
    start: startSpy,
    setBeforePasteCursorPos: setBeforePasteCursorPosSpy,
  }

  const clearHighlightSpy = spy(() => Promise.resolve())

  // Mock cache entries
  const mockEntries = [
    { id: "1", content: "test1", regtype: "v" as const, timestamp: 1 },
    { id: "2", content: "test2", regtype: "V" as const, timestamp: 2 },
  ]

  const state = createMockPluginState({
    logger: mockLogger,
    database: null,
    cache: {
      getAll: () => mockEntries,
    } as unknown as PluginState["cache"],
  })

  // Create mockDenops with handler for bufnr and getpos
  const mockDenopsWithHandler = createMockDenops((fn: string) => {
    if (fn === "bufnr") {
      return Promise.resolve(1)
    } else if (fn === "getpos") {
      return Promise.resolve([0, 10, 5, 0])
    }
    return Promise.resolve()
  })

  const data: PreparePasteData = {
    mode: "p",
    vmode: "n",
    count: 1,
    register: '"',
  }

  await initializeRounderForPaste(
    mockDenopsWithHandler,
    mockRounder as unknown as Rounder,
    state,
    data,
    { clearHighlight: clearHighlightSpy },
  )

  // Verify rounder was stopped and reinitialized
  assertEquals(isActiveSpy.calls.length, 1)
  assertEquals(stopSpy.calls.length, 1)
  assertEquals(clearHighlightSpy.calls.length, 1)
  assertEquals(startSpy.calls.length, 1)
  assertEquals(startSpy.calls[0]?.args[0], mockEntries)
  assertEquals(startSpy.calls[0]?.args[1], {
    mode: "p",
    count: 1,
    register: '"',
    visualMode: false,
    actualPasteCommand: "p",
  })
  assertEquals(setBeforePasteCursorPosSpy.calls.length, 1)
  assertEquals(setBeforePasteCursorPosSpy.calls[0]?.args[0], [0, 10, 5, 0])
})
