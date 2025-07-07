/**
 * Tests for paste-handler.ts with replace operation and cycle behavior
 * Testing proper handling of undojoin and replace info during cycling
 */

import { assertEquals, describe, it, spy } from "../deps/test.ts"
import type { Denops } from "../deps/denops.ts"
import { createPasteHandler } from "../core/paste-handler.ts"
import { createRounder } from "../core/rounder.ts"
import type { YankEntry } from "../types.ts"
import { createMockVimApi } from "../vim/vim-api.ts"
import type { PasteHandlerCallbacks } from "../core/paste-handler.ts"

// Mock callbacks
const createMockCallbacks = (): PasteHandlerCallbacks => ({
  applyHighlight: spy(() => Promise.resolve()),
  clearHighlight: spy(() => Promise.resolve()),
})

// Helper to create test entries
const _createTestEntry = (id: string, content: string, timestamp?: number): YankEntry => ({
  id,
  content,
  regtype: "v",
  timestamp: timestamp || Date.now(),
})

describe("PasteHandler - Replace Operation Cycling", () => {
  describe("applyHistoryEntry with replace info", () => {
    it("handles replace operation with singleUndo during cycle", async () => {
      const callbacks = createMockCallbacks()
      const commands: string[] = []

      // Mock VimApi to track commands
      const mockVimApi = createMockVimApi({
        cmd: spy((cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        }),
        setreg: spy(() => Promise.resolve()),
        getreg: () => Promise.resolve("test"),
        getpos: (mark: string) => {
          if (mark === "'[") return Promise.resolve([0, 1, 1, 0])
          if (mark === "']") return Promise.resolve([0, 1, 5, 0])
          return Promise.resolve([0, 1, 3, 0])
        },
        setGlobalVar: spy(() => Promise.resolve()),
        line: () => Promise.resolve(1),
        getline: () => Promise.resolve("export type PasteInfo = {"),
        eval: () => Promise.resolve(100),
      })

      const pasteHandler = createPasteHandler(
        null,
        () => ({ useRegionHl: false, smartIndent: false }),
        mockVimApi,
        callbacks,
      )

      const entry: YankEntry = {
        id: "2",
        content: "type",
        regtype: "v",
        timestamp: 200,
      }

      // Create rounder with replace info
      const rounder = createRounder(null)
      rounder.setReplaceInfo({
        isReplace: true,
        singleUndo: true,
        motionWise: "char",
        deletedRange: {
          start: [0, 32, 13, 0],
          end: [0, 32, 16, 0],
        },
      })

      // Start rounder to make it active
      await rounder.start([entry], { mode: "P", count: 1, register: '"' })

      // Apply history entry during cycle
      await pasteHandler.applyHistoryEntry(
        {} as Denops,
        entry,
        1,
        { mode: "P", count: 1, register: '"', actualPasteCommand: "P" },
        undefined,
        rounder,
      )

      // Verify commands executed
      // 1. Flag set
      assertSpyCall(mockVimApi.setGlobalVar as ReturnType<typeof spy>, 0, ["_haritsuke_applying_history", 1])

      // 2. Register set with content
      assertSpyCall(mockVimApi.setreg as ReturnType<typeof spy>, 0, ['"', "type", "v"])

      // 3. Undo executed
      assertEquals(commands.filter((cmd) => cmd === "silent! undo").length, 1, "Should execute undo once")

      // 4. Re-delete with proper visual mode and range
      const deleteCommands = commands.filter((cmd) => cmd.includes('"_d'))
      assertEquals(deleteCommands.length, 1, "Should execute delete once")
      assertEquals(
        deleteCommands[0],
        'silent! normal! 32G13|v32G16|"_d',
        "Should delete the correct range with char-wise visual mode",
      )

      // 5. Paste executed
      const pasteCommands = commands.filter((cmd) => cmd.includes('""P'))
      assertEquals(pasteCommands.length, 1, "Should execute paste once")
      assertEquals(pasteCommands[0], 'silent! normal! 1""P', "Should paste with P command")

      // 6. Flag cleared
      assertSpyCall(mockVimApi.setGlobalVar as ReturnType<typeof spy>, 1, ["_haritsuke_applying_history", 0])
    })

    it("handles line-wise replace operation correctly", async () => {
      const callbacks = createMockCallbacks()
      const commands: string[] = []

      const mockVimApi = createMockVimApi({
        cmd: spy((cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        }),
        setreg: spy(() => Promise.resolve()),
        getreg: () => Promise.resolve("function test() {\n  return 42;\n}\n"),
        getpos: (mark: string) => {
          if (mark === "'[") return Promise.resolve([0, 10, 1, 0])
          if (mark === "']") return Promise.resolve([0, 12, 20, 0])
          return Promise.resolve([0, 11, 1, 0])
        },
        setGlobalVar: spy(() => Promise.resolve()),
        line: () => Promise.resolve(11),
        getline: () => Promise.resolve("  // Old function"),
        eval: () => Promise.resolve(100),
      })

      const pasteHandler = createPasteHandler(
        null,
        () => ({ useRegionHl: false, smartIndent: false }),
        mockVimApi,
        callbacks,
      )

      const entry: YankEntry = {
        id: "3",
        content: "function test() {\n  return 42;\n}\n",
        regtype: "V", // Line-wise
        timestamp: 300,
      }

      // Create rounder with line-wise replace info
      const rounder = createRounder(null)
      rounder.setReplaceInfo({
        isReplace: true,
        singleUndo: true,
        motionWise: "line",
        deletedRange: {
          start: [0, 10, 1, 0],
          end: [0, 12, 20, 0],
        },
      })

      await rounder.start([entry], { mode: "p", count: 1, register: '"' })

      await pasteHandler.applyHistoryEntry(
        {} as Denops,
        entry,
        1,
        { mode: "p", count: 1, register: '"', actualPasteCommand: "p" },
        undefined,
        rounder,
      )

      // Verify line-wise delete (no column positions)
      const deleteCommands = commands.filter((cmd) => cmd.includes('"_d'))
      assertEquals(deleteCommands.length, 1, "Should execute delete once")
      assertEquals(
        deleteCommands[0],
        'silent! normal! 10GV12G"_d',
        "Should delete lines without column positions",
      )
    })

    it("handles block-wise replace operation correctly", async () => {
      const callbacks = createMockCallbacks()
      const commands: string[] = []

      const mockVimApi = createMockVimApi({
        cmd: spy((cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        }),
        setreg: spy(() => Promise.resolve()),
        getreg: () => Promise.resolve("AAA\nBBB\nCCC"),
        getpos: (mark: string) => {
          if (mark === "'[") return Promise.resolve([0, 5, 10, 0])
          if (mark === "']") return Promise.resolve([0, 7, 15, 0])
          return Promise.resolve([0, 6, 10, 0])
        },
        setGlobalVar: spy(() => Promise.resolve()),
        line: () => Promise.resolve(6),
        getline: () => Promise.resolve("    some text here"),
        eval: () => Promise.resolve(100),
      })

      const pasteHandler = createPasteHandler(
        null,
        () => ({ useRegionHl: false, smartIndent: false }),
        mockVimApi,
        callbacks,
      )

      const entry: YankEntry = {
        id: "4",
        content: "AAA\nBBB\nCCC",
        regtype: "b", // Block-wise
        blockwidth: 3,
        timestamp: 400,
      }

      // Create rounder with block-wise replace info
      const rounder = createRounder(null)
      rounder.setReplaceInfo({
        isReplace: true,
        singleUndo: true,
        motionWise: "block",
        deletedRange: {
          start: [0, 5, 10, 0],
          end: [0, 7, 15, 0],
        },
      })

      await rounder.start([entry], { mode: "P", count: 1, register: '"' })

      await pasteHandler.applyHistoryEntry(
        {} as Denops,
        entry,
        1,
        { mode: "P", count: 1, register: '"', actualPasteCommand: "P" },
        undefined,
        rounder,
      )

      // Verify block-wise delete (Ctrl-V)
      const deleteCommands = commands.filter((cmd) => cmd.includes('"_d'))
      assertEquals(deleteCommands.length, 1, "Should execute delete once")
      assertEquals(
        deleteCommands[0],
        'silent! normal! 5G10|\x167G15|"_d',
        "Should delete block with Ctrl-V visual mode",
      )
    })

    it("handles normal cycle without replace info", async () => {
      const callbacks = createMockCallbacks()
      const commands: string[] = []

      const mockVimApi = createMockVimApi({
        cmd: spy((cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        }),
        setreg: spy(() => Promise.resolve()),
        getreg: () => Promise.resolve("normal text"),
        getpos: () => Promise.resolve([0, 1, 1, 0]),
        setGlobalVar: spy(() => Promise.resolve()),
        line: () => Promise.resolve(1),
        getline: () => Promise.resolve("some line"),
        eval: () => Promise.resolve(100),
      })

      const pasteHandler = createPasteHandler(
        null,
        () => ({ useRegionHl: false, smartIndent: false }),
        mockVimApi,
        callbacks,
      )

      const entry: YankEntry = {
        id: "5",
        content: "normal text",
        regtype: "v",
        timestamp: 500,
      }

      // Create rounder WITHOUT replace info
      const rounder = createRounder(null)
      await rounder.start([entry], { mode: "P", count: 1, register: '"' })

      await pasteHandler.applyHistoryEntry(
        {} as Denops,
        entry,
        1,
        { mode: "P", count: 1, register: '"' },
        "/tmp/undo.file",
        rounder,
      )

      // Verify normal behavior (undo + rundo)
      assertEquals(commands.filter((cmd) => cmd === "silent! undo").length, 1, "Should execute undo")
      assertEquals(
        commands.filter((cmd) => cmd.includes("rundo")).length,
        1,
        "Should restore undo file for normal cycle",
      )
      assertEquals(
        commands.filter((cmd) => cmd.includes('"_d')).length,
        0,
        "Should NOT execute delete for normal cycle",
      )
    })

    it("handles replace with singleUndo disabled", async () => {
      const callbacks = createMockCallbacks()
      const commands: string[] = []

      const mockVimApi = createMockVimApi({
        cmd: spy((cmd: string) => {
          commands.push(cmd)
          return Promise.resolve()
        }),
        setreg: spy(() => Promise.resolve()),
        getreg: () => Promise.resolve("text"),
        getpos: () => Promise.resolve([0, 1, 1, 0]),
        setGlobalVar: spy(() => Promise.resolve()),
        line: () => Promise.resolve(1),
        getline: () => Promise.resolve("line"),
        eval: () => Promise.resolve(100),
      })

      const pasteHandler = createPasteHandler(
        null,
        () => ({ useRegionHl: false, smartIndent: false }),
        mockVimApi,
        callbacks,
      )

      const entry: YankEntry = {
        id: "6",
        content: "text",
        regtype: "v",
        timestamp: 600,
      }

      // Create rounder with replace info but singleUndo disabled
      const rounder = createRounder(null)
      rounder.setReplaceInfo({
        isReplace: true,
        singleUndo: false, // Disabled
        motionWise: "char",
        deletedRange: {
          start: [0, 1, 1, 0],
          end: [0, 1, 5, 0],
        },
      })

      await rounder.start([entry], { mode: "P", count: 1, register: '"' })

      await pasteHandler.applyHistoryEntry(
        {} as Denops,
        entry,
        1,
        { mode: "P", count: 1, register: '"' },
        "/tmp/undo.file",
        rounder,
      )

      // Verify normal behavior when singleUndo is disabled
      assertEquals(commands.filter((cmd) => cmd === "silent! undo").length, 1, "Should execute undo")
      assertEquals(
        commands.filter((cmd) => cmd.includes("rundo")).length,
        1,
        "Should restore undo file when singleUndo is disabled",
      )
      assertEquals(
        commands.filter((cmd) => cmd.includes('"_d')).length,
        0,
        "Should NOT re-delete when singleUndo is disabled",
      )
    })
  })
})

// Helper to create spy call assertions
function assertSpyCall(
  spyInstance: ReturnType<typeof spy>,
  callIndex: number,
  expectedArgs: unknown[],
) {
  const calls = spyInstance.calls
  if (calls.length <= callIndex) {
    throw new Error(`Expected at least ${callIndex + 1} calls, but got ${calls.length}`)
  }
  assertEquals(calls[callIndex].args, expectedArgs)
}
