/**
 * Tests for api.ts preparePaste function
 * Testing smart indent functionality for initial paste
 */

import { assertEquals, describe, it, spy } from "../deps/test.ts"
import { createApi } from "../api/api.ts"
import type { PluginState } from "../state/plugin-state.ts"
import type { Denops } from "../deps/denops.ts"
import { createMockVimApi } from "../vim/vim-api.ts"
import { createMockPluginState } from "./test-helpers.ts"

// Mock Denops with proper fn module
const createMockDenops = (): Denops => {
  return {
    cmd: spy(() => Promise.resolve()),
    eval: spy((expr: string) => {
      if (expr === "b:changedtick") return Promise.resolve(100)
      return Promise.resolve(1)
    }),
    call: spy((fn: string, ...args: unknown[]) => {
      if (fn === "bufnr" && args[0] === "%") return Promise.resolve(1)
      if (fn === "getpos" && args[0] === ".") return Promise.resolve([0, 10, 5, 0])
      if (fn === "line" && args[0] === ".") return Promise.resolve(10)
      if (fn === "line" && args[0] === "$") return Promise.resolve(100)
      if (fn === "getline" && args[0] === ".") return Promise.resolve("  const result = ")
      if (fn === "getpos") return Promise.resolve([0, 1, 1, 0])
      if (fn === "undotree") return Promise.resolve({ seq_cur: 0, seq_last: 0, entries: [] })
      return Promise.resolve()
    }),
    batch: spy(() => Promise.resolve()),
    dispatch: spy(() => Promise.resolve()),
  } as unknown as Denops
}

describe("api preparePaste", () => {
  describe("smart indent for initial paste", () => {
    it("adjusts indent for line-wise paste based on current line", async () => {
      // Track setreg calls
      const setregCalls: Array<{ register: string; content: string; regtype: string }> = []
      
      const mockVimApi = createMockVimApi({
        getreg: (register: string) => {
          if (register === '"') {
            return Promise.resolve("    function test() {\n      return 42;\n    }")
          }
          return Promise.resolve("")
        },
        getregtype: (register: string) => {
          if (register === '"') {
            return Promise.resolve("V") // Line-wise
          }
          return Promise.resolve("v")
        },
        setreg: spy((register: string, content: string, regtype: string) => {
          setregCalls.push({ register, content, regtype })
          return Promise.resolve()
        }),
        getline: () => Promise.resolve("  const result = "), // Current line has 2 spaces indent
        line: () => Promise.resolve(10),
      })
      
      // Create mock rounder
      const mockRounder = {
        isActive: () => false,
        start: spy(() => Promise.resolve()),
        setBeforePasteCursorPos: spy(() => {}),
        setUndoFilePath: spy(() => {}),
      }
      
      const mockRounderManager = {
        getRounder: () => Promise.resolve(mockRounder),
      }
      
      const state = createMockPluginState({
        config: {
          persist_path: "/tmp",
          max_entries: 100,
          max_data_size: 1024,
          register_keys: "",
          debug: true,
          use_region_hl: false,
          region_hl_groupname: "HaritsukeRegion",
          smart_indent: true, // Enable smart indent
        },
        vimApi: mockVimApi,
        rounderManager: mockRounderManager as any,
        cache: {
          getAll: () => [],
        } as any,
        pasteHandler: {} as any,
      })
      
      const denops = createMockDenops()
      const api = createApi(denops, state)
      
      // Execute preparePaste
      const result = await api.preparePaste({
        mode: "p",
        vmode: "n",
        count: 1,
        register: '"',
      })
      
      // Verify paste command is returned
      assertEquals(result, 'normal! ""1p')
      
      // Verify that setreg was called with adjusted content
      assertEquals(setregCalls.length, 1)
      assertEquals(setregCalls[0].register, '"')
      assertEquals(setregCalls[0].content, "  function test() {\n    return 42;\n  }")
      assertEquals(setregCalls[0].regtype, "V")
    })
    
    it("skips adjustment for character-wise paste", async () => {
      const setregCalls: Array<{ register: string; content: string; regtype: string }> = []
      
      const mockVimApi = createMockVimApi({
        getreg: (register: string) => {
          if (register === '"') {
            return Promise.resolve("test content")
          }
          return Promise.resolve("")
        },
        getregtype: (register: string) => {
          if (register === '"') {
            return Promise.resolve("v") // Character-wise
          }
          return Promise.resolve("v")
        },
        setreg: spy((register: string, content: string, regtype: string) => {
          setregCalls.push({ register, content, regtype })
          return Promise.resolve()
        }),
      })
      
      const mockRounder = {
        isActive: () => false,
        start: spy(() => Promise.resolve()),
        setBeforePasteCursorPos: spy(() => {}),
        setUndoFilePath: spy(() => {}),
      }
      
      const mockRounderManager = {
        getRounder: () => Promise.resolve(mockRounder),
      }
      
      const state = createMockPluginState({
        config: {
          persist_path: "/tmp",
          max_entries: 100,
          max_data_size: 1024,
          register_keys: "",
          debug: true,
          use_region_hl: false,
          region_hl_groupname: "HaritsukeRegion",
          smart_indent: true, // Enable smart indent
        },
        vimApi: mockVimApi,
        rounderManager: mockRounderManager as any,
        cache: {
          getAll: () => [],
        } as any,
        pasteHandler: {} as any,
      })
      
      const denops = createMockDenops()
      const api = createApi(denops, state)
      
      await api.preparePaste({
        mode: "p",
        vmode: "n",
        count: 1,
        register: '"',
      })
      
      // Verify that setreg was NOT called (no adjustment for character-wise)
      assertEquals(setregCalls.length, 0)
    })
    
    it("skips adjustment when smart_indent is disabled", async () => {
      const setregCalls: Array<{ register: string; content: string; regtype: string }> = []
      
      const mockVimApi = createMockVimApi({
        getreg: (register: string) => {
          if (register === '"') {
            return Promise.resolve("    function test() {\n      return 42;\n    }")
          }
          return Promise.resolve("")
        },
        getregtype: (register: string) => {
          if (register === '"') {
            return Promise.resolve("V") // Line-wise
          }
          return Promise.resolve("v")
        },
        setreg: spy((register: string, content: string, regtype: string) => {
          setregCalls.push({ register, content, regtype })
          return Promise.resolve()
        }),
      })
      
      const mockRounder = {
        isActive: () => false,
        start: spy(() => Promise.resolve()),
        setBeforePasteCursorPos: spy(() => {}),
        setUndoFilePath: spy(() => {}),
      }
      
      const mockRounderManager = {
        getRounder: () => Promise.resolve(mockRounder),
      }
      
      const state = createMockPluginState({
        config: {
          persist_path: "/tmp",
          max_entries: 100,
          max_data_size: 1024,
          register_keys: "",
          debug: true,
          use_region_hl: false,
          region_hl_groupname: "HaritsukeRegion",
          smart_indent: false, // Disable smart indent
        },
        vimApi: mockVimApi,
        rounderManager: mockRounderManager as any,
        cache: {
          getAll: () => [],
        } as any,
        pasteHandler: {} as any,
      })
      
      const denops = createMockDenops()
      const api = createApi(denops, state)
      
      await api.preparePaste({
        mode: "p",
        vmode: "n",
        count: 1,
        register: '"',
      })
      
      // Verify that setreg was NOT called (no adjustment when disabled)
      assertEquals(setregCalls.length, 0)
    })
    
    it("handles errors gracefully and continues with original content", async () => {
      const mockVimApi = createMockVimApi({
        getreg: () => Promise.reject(new Error("Test error")),
      })
      
      const mockRounder = {
        isActive: () => false,
        start: spy(() => Promise.resolve()),
        setBeforePasteCursorPos: spy(() => {}),
        setUndoFilePath: spy(() => {}),
      }
      
      const mockRounderManager = {
        getRounder: () => Promise.resolve(mockRounder),
      }
      
      const state = createMockPluginState({
        config: {
          persist_path: "/tmp",
          max_entries: 100,
          max_data_size: 1024,
          register_keys: "",
          debug: true,
          use_region_hl: false,
          region_hl_groupname: "HaritsukeRegion",
          smart_indent: true,
        },
        vimApi: mockVimApi,
        rounderManager: mockRounderManager as any,
        cache: {
          getAll: () => [],
        } as any,
        pasteHandler: {} as any,
      })
      
      const denops = createMockDenops()
      const api = createApi(denops, state)
      
      // Should not throw error
      const result = await api.preparePaste({
        mode: "p",
        vmode: "n",
        count: 1,
        register: '"',
      })
      
      // Verify paste command is returned
      assertEquals(result, 'normal! ""1p')
    })
  })
})