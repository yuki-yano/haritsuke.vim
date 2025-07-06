/**
 * Tests for api.ts
 * Testing event handlers
 */

import { assertSpyCall, assertSpyCalls, describe, it, spy } from "../deps/test.ts"
import { createApi } from "../api/api.ts"
import type { PluginState } from "../state/plugin-state.ts"
import type { Denops } from "../deps/denops.ts"

// Mock Denops
const createMockDenops = (): Denops => {
  return {
    cmd: spy(() => Promise.resolve()),
    eval: spy((expr: string) => {
      // Handle _haritsuke_applying_history flag check
      if (expr === "get(g:, '_haritsuke_applying_history', 0)") {
        return Promise.resolve(0)
      }
      return Promise.resolve(1)
    }),
    call: spy(() => Promise.resolve()),
    batch: spy(() => Promise.resolve()),
    dispatch: spy(() => Promise.resolve()),
  } as unknown as Denops
}

// Create minimal plugin state
const createMinimalState = (): PluginState => {
  const rounder = {
    isActive: () => true,
    getUndoFilePath: () => "/tmp/test-undo.txt",
    getCurrentEntry: () => ({ id: "1", content: "test", regtype: "v", timestamp: Date.now() }),
    stop: spy(() => {}),
  }

  const cache = {
    moveToFront: spy(() => true),
  }

  const rounderManager = {
    getRounder: () => Promise.resolve(rounder),
  }

  const logger = {
    log: spy(() => {}),
    error: spy(() => {}),
    time: spy(() => {}),
    timeEnd: spy(() => {}),
  }

  return {
    config: {},
    rounderManager,
    cache,
    logger,
    highlightManager: {
      clear: spy(() => Promise.resolve()),
    },
    isInitialized: () => true,
    reset: spy(() => {}),
  } as unknown as PluginState
}

describe("api - onStopRounder", () => {
  it("stops active rounder", async () => {
    const denops = createMockDenops()
    const state = createMinimalState()
    const api = createApi(denops, state)

    // Mock file system
    const originalRemove = Deno.remove
    Deno.remove = spy(() => Promise.resolve())

    try {
      await api.onStopRounder(undefined)

      // Verify rounder was stopped
      const rounder = await state.rounderManager!.getRounder(denops, 1)
      assertSpyCalls(rounder.stop as ReturnType<typeof spy>, 1)

      // Verify entry was moved to front
      assertSpyCalls(state.cache!.moveToFront as ReturnType<typeof spy>, 1)
      assertSpyCall(state.cache!.moveToFront as ReturnType<typeof spy>, 0, {
        args: ["1"],
      })

      // Verify undo file deletion was attempted
      assertSpyCalls(Deno.remove as ReturnType<typeof spy>, 1)
      assertSpyCall(Deno.remove as ReturnType<typeof spy>, 0, {
        args: ["/tmp/test-undo.txt"],
      })

      // Verify highlight was cleared
      assertSpyCalls(state.highlightManager!.clear as ReturnType<typeof spy>, 1)
    } finally {
      Deno.remove = originalRemove
    }
  })

  it("does nothing when rounder is not active", async () => {
    const denops = createMockDenops()
    const state = createMinimalState()

    // Make rounder inactive
    const rounder = await state.rounderManager!.getRounder(denops, 1)
    ;(rounder as { isActive: () => boolean }).isActive = () => false

    const api = createApi(denops, state)

    await api.onStopRounder(undefined)

    // Verify rounder.stop was NOT called
    assertSpyCalls(rounder.stop as ReturnType<typeof spy>, 0)

    // Verify cache.moveToFront was NOT called
    assertSpyCalls(state.cache!.moveToFront as ReturnType<typeof spy>, 0)
  })

  it("handles missing undo file gracefully", async () => {
    const denops = createMockDenops()
    const state = createMinimalState()
    const api = createApi(denops, state)

    // Mock file system to throw error
    const originalRemove = Deno.remove
    Deno.remove = spy(() => {
      return Promise.reject(new Error("File not found"))
    })

    try {
      await api.onStopRounder(undefined)

      // Verify error was logged
      assertSpyCalls(state.logger!.error as ReturnType<typeof spy>, 1)

      // Verify rounder was still stopped despite error
      const rounder = await state.rounderManager!.getRounder(denops, 1)
      assertSpyCalls(rounder.stop as ReturnType<typeof spy>, 1)
    } finally {
      Deno.remove = originalRemove
    }
  })
})
