/**
 * Tests for toggleSmartIndent API function
 */

import { assertEquals, assertSpyCall, describe, it, spy } from "../deps/test.ts"
import { createApi } from "../api/api.ts"
import type { PluginState } from "../state/plugin-state.ts"
import type { Denops } from "../deps/denops.ts"
import { createMockPluginState } from "./test-helpers.ts"
import type { YankEntry } from "../types.ts"

// Mock Denops
const createMockDenops = (): Denops => {
  return {
    cmd: spy(() => Promise.resolve()),
    eval: spy((expr: string) => {
      if (expr === "b:changedtick") return Promise.resolve(100)
      return Promise.resolve(1)
    }),
    call: spy((fn: string, ...args: unknown[]) => {
      if (fn === "bufnr" && args[0] === "%") return Promise.resolve(1)
      return Promise.resolve()
    }),
    batch: spy(() => Promise.resolve()),
    dispatch: spy(() => Promise.resolve()),
  } as unknown as Denops
}

describe("api toggleSmartIndent", () => {
  it("toggles smart_indent setting when rounder is active", async () => {
    // Track applyHistoryEntry calls
    const applyHistoryEntrySpy = spy(() => Promise.resolve())

    // Create mock rounder
    const mockRounder = {
      isActive: () => true,
      getCurrentEntry: () => ({
        id: "1",
        content: "    test content\n    second line",
        regtype: "V",
        timestamp: 1000,
      } as YankEntry),
      getPasteInfo: () => ({
        mode: "p" as const,
        count: 1,
        register: '"' as const,
        visualMode: false,
      }),
      isFirstCycle: () => false,
      getUndoFilePath: () => "/tmp/undo.txt",
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
        smart_indent: true, // Initial state: enabled
      },
      rounderManager: mockRounderManager as unknown as PluginState["rounderManager"],
      pasteHandler: {
        applyHistoryEntry: applyHistoryEntrySpy,
      } as unknown as PluginState["pasteHandler"],
    })

    const denops = createMockDenops()
    const api = createApi(denops, state)

    // Initial state should be true
    assertEquals(state.config.smart_indent, true)

    // Toggle smart indent
    await api.toggleSmartIndent({})

    // Should toggle to false
    assertEquals(state.config.smart_indent, false)

    // Should call applyHistoryEntry with correct parameters
    assertSpyCall(applyHistoryEntrySpy, 0, {
      args: [
        denops,
        {
          id: "1",
          content: "    test content\n    second line",
          regtype: "V",
          timestamp: 1000,
        },
        1, // undoSeq (not first cycle)
        {
          mode: "p",
          count: 1,
          register: '"' as const,
          visualMode: false,
        },
        "/tmp/undo.txt",
        mockRounder,
      ],
    })

    // Toggle again
    await api.toggleSmartIndent({})

    // Should toggle back to true
    assertEquals(state.config.smart_indent, true)

    // Should call applyHistoryEntry again
    assertEquals(applyHistoryEntrySpy.calls.length, 2)
  })

  it("does nothing when rounder is not active", async () => {
    const applyHistoryEntrySpy = spy(() => Promise.resolve())

    // Create mock rounder that is not active
    const mockRounder = {
      isActive: () => false,
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
      rounderManager: mockRounderManager as unknown as PluginState["rounderManager"],
      pasteHandler: {
        applyHistoryEntry: applyHistoryEntrySpy,
      } as unknown as PluginState["pasteHandler"],
    })

    const denops = createMockDenops()
    const api = createApi(denops, state)

    // Initial state
    const initialState = state.config.smart_indent

    // Toggle smart indent
    await api.toggleSmartIndent({})

    // Should not change state
    assertEquals(state.config.smart_indent, initialState)

    // Should not call applyHistoryEntry
    assertEquals(applyHistoryEntrySpy.calls.length, 0)
  })

  it("handles missing rounderManager gracefully", async () => {
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
      rounderManager: null as unknown as PluginState["rounderManager"],
      pasteHandler: {} as unknown as PluginState["pasteHandler"],
    })

    const denops = createMockDenops()
    const api = createApi(denops, state)

    // Should not throw error
    await api.toggleSmartIndent({})

    // State should remain unchanged
    assertEquals(state.config.smart_indent, true)
  })

  it("handles missing current entry gracefully", async () => {
    const applyHistoryEntrySpy = spy(() => Promise.resolve())

    // Create mock rounder with no current entry
    const mockRounder = {
      isActive: () => true,
      getCurrentEntry: () => null,
      getPasteInfo: () => ({
        mode: "p" as const,
        count: 1,
        register: '"' as const,
        visualMode: false,
      }),
      isFirstCycle: () => false,
      getUndoFilePath: () => null,
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
      rounderManager: mockRounderManager as unknown as PluginState["rounderManager"],
      pasteHandler: {
        applyHistoryEntry: applyHistoryEntrySpy,
      } as unknown as PluginState["pasteHandler"],
    })

    const denops = createMockDenops()
    const api = createApi(denops, state)

    // Initial state
    const initialState = state.config.smart_indent

    // Toggle smart indent
    await api.toggleSmartIndent({})

    // Should toggle the setting even though no entry to re-apply
    assertEquals(state.config.smart_indent, !initialState)

    // Should not call applyHistoryEntry due to missing entry
    assertEquals(applyHistoryEntrySpy.calls.length, 0)
  })

  it("correctly handles first cycle (undoSeq = 0)", async () => {
    const applyHistoryEntrySpy = spy(() => Promise.resolve())

    // Create mock rounder on first cycle
    const mockRounder = {
      isActive: () => true,
      getCurrentEntry: () => ({
        id: "1",
        content: "test",
        regtype: "V",
        timestamp: 1000,
      } as YankEntry),
      getPasteInfo: () => ({
        mode: "p" as const,
        count: 1,
        register: '"' as const,
        visualMode: false,
      }),
      isFirstCycle: () => true, // First cycle
      getUndoFilePath: () => null,
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
      rounderManager: mockRounderManager as unknown as PluginState["rounderManager"],
      pasteHandler: {
        applyHistoryEntry: applyHistoryEntrySpy,
      } as unknown as PluginState["pasteHandler"],
    })

    const denops = createMockDenops()
    const api = createApi(denops, state)

    // Toggle smart indent
    await api.toggleSmartIndent({})

    // Should call applyHistoryEntry with undoSeq = 0
    assertSpyCall(applyHistoryEntrySpy, 0, {
      args: [
        denops,
        {
          id: "1",
          content: "test",
          regtype: "V",
          timestamp: 1000,
        },
        0, // undoSeq should be 0 for first cycle
        {
          mode: "p",
          count: 1,
          register: '"' as const,
          visualMode: false,
        },
        null,
        mockRounder,
      ],
    })
  })
})
