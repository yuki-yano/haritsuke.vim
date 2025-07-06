/**
 * Tests for highlight.ts
 * Testing highlight management functionality
 */

import { assertEquals, assertRejects, describe, it, spy } from "../deps/test.ts"
import type { Denops } from "../deps/denops.ts"
import { createHighlightManager } from "../vim/highlight.ts"

// Mock Denops
const createMockDenops = (mockFns: Record<string, unknown> = {}): Denops => {
  return {
    call: spy((fn: string, ...args: unknown[]) => {
      if (mockFns[fn]) {
        if (typeof mockFns[fn] === "function") {
          return Promise.resolve(mockFns[fn](...args))
        }
        return Promise.resolve(mockFns[fn])
      }
      return Promise.resolve()
    }),
  } as unknown as Denops
}

describe("createHighlightManager", () => {
  it("applies character mode highlight", async () => {
    const mockFns = {
      line: (expr: string) => {
        if (expr === "'[") return 10
        if (expr === "']") return 10
        return 1
      },
      col: (expr: string) => {
        if (expr === "'[") return 5
        if (expr === "']") return 15
        return 1
      },
      getregtype: () => "v",
      matchadd: () => 123,
    }

    const mockDenops = createMockDenops(mockFns)
    const manager = createHighlightManager({ regionHlGroupname: "TestHighlight" })

    await manager.apply(mockDenops, '"')

    // Verify matchadd was called with correct pattern
    const calls = (mockDenops.call as ReturnType<typeof spy>).calls
    const matchaddCall = calls.find((c) => c.args[0] === "matchadd")
    assertEquals(matchaddCall?.args[1], "TestHighlight")
    assertEquals(matchaddCall?.args[2], "\\v%10l%>4c.*%10l%<16c")
  })

  it("applies line mode highlight for single line", async () => {
    const mockFns = {
      line: (expr: string) => {
        if (expr === "'[") return 5
        if (expr === "']") return 5
        return 1
      },
      col: () => 1,
      getregtype: () => "V",
      matchadd: () => 456,
    }

    const mockDenops = createMockDenops(mockFns)
    const manager = createHighlightManager({})

    await manager.apply(mockDenops, '"')

    const calls = (mockDenops.call as ReturnType<typeof spy>).calls
    const matchaddCall = calls.find((c) => c.args[0] === "matchadd")
    assertEquals(matchaddCall?.args[1], "HaritsukeRegion") // Default group
    assertEquals(matchaddCall?.args[2], "\\v%5l^.*$")
  })

  it("applies line mode highlight for multiple lines", async () => {
    const mockFns = {
      line: (expr: string) => {
        if (expr === "'[") return 3
        if (expr === "']") return 5
        return 1
      },
      col: () => 1,
      getregtype: () => "V",
      matchadd: () => 789,
    }

    const mockDenops = createMockDenops(mockFns)
    const manager = createHighlightManager({})

    await manager.apply(mockDenops, '"')

    const calls = (mockDenops.call as ReturnType<typeof spy>).calls
    const matchaddCall = calls.find((c) => c.args[0] === "matchadd")
    assertEquals(matchaddCall?.args[2], "\\v(%3l^.*$|%4l^.*$|%5l^.*$)")
  })

  it("applies block mode highlight", async () => {
    const mockFns = {
      line: (expr: string) => {
        if (expr === "'[") return 10
        if (expr === "']") return 15
        return 1
      },
      col: (expr: string) => {
        if (expr === "'[") return 5
        if (expr === "']") return 10
        return 1
      },
      getregtype: () => "\x16",
      matchadd: () => 999,
    }

    const mockDenops = createMockDenops(mockFns)
    const manager = createHighlightManager({})

    await manager.apply(mockDenops, '"')

    const calls = (mockDenops.call as ReturnType<typeof spy>).calls
    const matchaddCall = calls.find((c) => c.args[0] === "matchadd")
    assertEquals(matchaddCall?.args[2], "\\v%>9l%>4c.*%<16l%<11c")
  })

  it("clears previous highlight before applying new", async () => {
    const mockFns = {
      line: () => 1,
      col: () => 1,
      getregtype: () => "v",
      matchadd: () => 100,
      matchdelete: spy(() => {}),
    }

    const mockDenops = createMockDenops(mockFns)
    const manager = createHighlightManager({})

    // Apply first highlight
    await manager.apply(mockDenops, '"')

    // Apply second highlight
    await manager.apply(mockDenops, '"')

    // Verify matchdelete was called with the first match ID
    const calls = (mockDenops.call as ReturnType<typeof spy>).calls
    const matchdeleteCall = calls.find((c) => c.args[0] === "matchdelete")
    assertEquals(matchdeleteCall?.args[1], 100)
  })

  it("clear removes active highlight", async () => {
    const mockFns = {
      line: () => 1,
      col: () => 1,
      getregtype: () => "v",
      matchadd: () => 200,
      matchdelete: spy(() => {}),
    }

    const mockDenops = createMockDenops(mockFns)
    const manager = createHighlightManager({})

    // Apply highlight
    await manager.apply(mockDenops, '"')
    assertEquals(manager.isActive(), true)

    // Clear highlight
    await manager.clear(mockDenops)

    const calls = (mockDenops.call as ReturnType<typeof spy>).calls
    const matchdeleteCall = calls.find((c) => c.args[0] === "matchdelete")
    assertEquals(matchdeleteCall?.args[1], 200)
    assertEquals(manager.isActive(), false)
  })

  it("clear ignores error if match doesn't exist", async () => {
    const mockFns = {
      matchdelete: spy(() => {
        throw new Error("Match not found")
      }),
    }

    const mockDenops = createMockDenops(mockFns)
    const manager = createHighlightManager({})

    // Set internal state as if highlight was applied
    await manager.apply(
      createMockDenops({
        line: () => 1,
        col: () => 1,
        getregtype: () => "v",
        matchadd: () => 300,
      }),
      '"',
    )

    // Clear should not throw even if matchdelete fails
    await manager.clear(mockDenops)
    assertEquals(manager.isActive(), false)
  })

  it("isActive returns correct state", () => {
    const manager = createHighlightManager({})

    // Initially not active
    assertEquals(manager.isActive(), false)

    // After applying highlight, it should be active
    // (We can't test this without actually applying, which requires denops)
  })

  it("handles errors gracefully", async () => {
    const mockLogger = {
      log: spy((..._args: unknown[]) => {}),
      error: spy((..._args: unknown[]) => {}),
      time: spy(() => {}),
      timeEnd: spy(() => {}),
    }

    const mockFns = {
      line: () => {
        throw new Error("Test error")
      },
    }

    const mockDenops = createMockDenops(mockFns)
    const manager = createHighlightManager({}, mockLogger)

    // Should throw the error after logging
    await assertRejects(
      async () => await manager.apply(mockDenops, '"'),
      Error,
      "Test error",
    )

    // Should log error before throwing
    assertEquals(mockLogger.error.calls.length, 1)
    assertEquals(mockLogger.error.calls[0].args[1], "Operation failed")
  })
})
