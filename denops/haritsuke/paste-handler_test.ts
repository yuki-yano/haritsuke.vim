/**
 * Tests for paste-handler.ts
 * Testing paste functionality with dependency injection
 */

import { assert, assertEquals, assertSpyCall, spy } from "./deps/test.ts"
import type { Denops } from "./deps/denops.ts"
import { createPasteHandler } from "./paste-handler.ts"
import { createRounder } from "./rounder.ts"
import type { YankEntry } from "./types.ts"
import type { VimApi } from "./vim-api.ts"
import { createMockVimApi } from "./vim-api.ts"
import type { PasteHandlerCallbacks } from "./paste-handler.ts"

// Mock callbacks
const createMockCallbacks = (): PasteHandlerCallbacks => ({
  applyHighlight: spy(() => Promise.resolve()),
  clearHighlight: spy(() => Promise.resolve()),
})

// Helper to create test entries
const createTestEntry = (id: string, content: string, timestamp?: number): YankEntry => ({
  id,
  content,
  regtype: "v",
  timestamp: timestamp || Date.now(),
})

Deno.test("createPasteHandler - applyHistoryEntry undoes and applies new entry", async () => {
  // Mock VimApi with spies
  let changedtick = 100
  let undoExecuted = false
  const mockVimApi = createMockVimApi({
    cmd: spy((cmd: string) => {
      if (cmd.includes("undo") && !undoExecuted) {
        undoExecuted = true
        changedtick++
      }
      return Promise.resolve()
    }),
    setreg: spy(() => Promise.resolve()),
    getreg: () => Promise.resolve("new content"),
    bufnr: () => Promise.resolve(1),
    getpos: () => Promise.resolve([0, 2, 1, 0]),
    eval: (expr: string) => {
      if (expr === "b:changedtick") {
        return Promise.resolve(changedtick)
      }
      return Promise.resolve(101)
    },
    setGlobalVar: spy(() => Promise.resolve()),
    line: () => Promise.resolve(1),
  })

  const mockCallbacks: PasteHandlerCallbacks = {
    applyHighlight: spy(() => Promise.resolve()),
    clearHighlight: spy(() => Promise.resolve()),
  }

  const pasteHandler = createPasteHandler(
    null,
    { useRegionHl: false },
    mockVimApi,
    mockCallbacks,
  )

  // Create rounder for test
  const rounder = createRounder(null)

  // Apply history entry
  const entry = createTestEntry("2", "new content", 2000)
  await pasteHandler.applyHistoryEntry(
    {} as Denops,
    entry,
    11,
    { mode: "p", count: 1, register: '"' },
    "/tmp/undo.txt",
    rounder,
  )

  // Verify single undo was performed
  const cmdCalls = (mockVimApi.cmd as ReturnType<typeof spy>).calls
  const undoCalls = cmdCalls.filter((call) => (call.args[0] as string).includes("silent! undo"))
  assertEquals(undoCalls.length, 1, "Should execute 1 undo")

  // Verify undo file was restored
  const rundoCalls = cmdCalls.filter((call) => (call.args[0] as string).includes("rundo"))
  assertEquals(rundoCalls.length, 1, "Should restore undo file")

  // Verify register was set
  assertSpyCall(mockVimApi.setreg as ReturnType<typeof spy>, 0, {
    args: ['"', "new content", "v"],
  })

  // Verify paste was executed
  const pasteCalls = cmdCalls.filter((call) => (call.args[0] as string).includes("normal!"))
  assertEquals(pasteCalls.length, 1, "Should execute paste command")
  assertEquals(pasteCalls[0].args[0], 'silent! normal! 1""P')

  // Verify that setGlobalVar was called for flag management
  const setGlobalVarCalls = (mockVimApi.setGlobalVar as ReturnType<typeof spy>).calls
  assertEquals(setGlobalVarCalls.length, 2, "Should call setGlobalVar twice for flag management")
  assertEquals(setGlobalVarCalls[0].args, ["_haritsuke_applying_history", 1])
  assertEquals(setGlobalVarCalls[1].args, ["_haritsuke_applying_history", 0])
})

Deno.test("createPasteHandler - applyHistoryEntry: manages _haritsuke_applying_history flag", async () => {
  const callbacks = createMockCallbacks()

  // Track setGlobalVar calls
  const globalVarCalls: Array<{ name: string; value: unknown }> = []
  const mockVimApi: VimApi = {
    ...createMockVimApi(),
    setGlobalVar: spy((name: string, value: unknown) => {
      globalVarCalls.push({ name, value })
      return Promise.resolve()
    }),
  }

  const pasteHandler = createPasteHandler(
    null,
    { useRegionHl: false },
    mockVimApi,
    callbacks,
  )

  const entry: YankEntry = {
    id: "1",
    content: "test",
    regtype: "v",
    timestamp: 100,
    size: 4,
  }

  // Create rounder for test
  const rounder = createRounder(null)

  // Apply history entry
  await pasteHandler.applyHistoryEntry(
    {} as Denops,
    entry,
    10,
    { mode: "p", count: 1, register: '"' },
    undefined,
    rounder,
  )

  // Check flag was set to 1 at start
  const setToCalls = globalVarCalls.filter(
    (call) => call.name === "_haritsuke_applying_history" && call.value === 1,
  )
  assertEquals(setToCalls.length, 1, "Should set flag to 1 at start")

  // Check flag was set to 0 at end
  const clearCalls = globalVarCalls.filter(
    (call) => call.name === "_haritsuke_applying_history" && call.value === 0,
  )
  assertEquals(clearCalls.length, 1, "Should set flag to 0 at end")

  // Check order: set to 1 before clear to 0
  const setIndex = globalVarCalls.findIndex(
    (call) => call.name === "_haritsuke_applying_history" && call.value === 1,
  )
  const clearIndex = globalVarCalls.findIndex(
    (call) => call.name === "_haritsuke_applying_history" && call.value === 0,
  )
  assert(setIndex < clearIndex, "Should set flag before clearing it")
})

Deno.test("createPasteHandler - applyHistoryEntry: clears flag on error", async () => {
  const callbacks = createMockCallbacks()

  // Track setGlobalVar calls
  const globalVarCalls: Array<{ name: string; value: unknown }> = []
  const mockVimApi: VimApi = {
    ...createMockVimApi(),
    setGlobalVar: spy((name: string, value: unknown) => {
      globalVarCalls.push({ name, value })
      return Promise.resolve()
    }),
    // Make setreg throw error
    setreg: spy(() => Promise.reject(new Error("Test error"))),
  }

  const pasteHandler = createPasteHandler(
    null,
    { useRegionHl: false },
    mockVimApi,
    callbacks,
  )

  const entry: YankEntry = {
    id: "1",
    content: "test",
    regtype: "v",
    timestamp: 100,
    size: 4,
  }

  // Create rounder for test
  const rounder = createRounder(null)

  // Apply history entry - should throw error
  try {
    await pasteHandler.applyHistoryEntry(
      {} as Denops,
      entry,
      10,
      { mode: "p", count: 1, register: '"' },
      undefined,
      rounder,
    )
    assert(false, "Should have thrown error")
  } catch {
    // Expected error
  }

  // Check flag was set to 1 at start
  const setToCalls = globalVarCalls.filter(
    (call) => call.name === "_haritsuke_applying_history" && call.value === 1,
  )
  assertEquals(setToCalls.length, 1, "Should set flag to 1 at start")

  // Check flag was cleared even on error
  const clearCalls = globalVarCalls.filter(
    (call) => call.name === "_haritsuke_applying_history" && call.value === 0,
  )
  assertEquals(clearCalls.length, 1, "Should clear flag even on error")
})
