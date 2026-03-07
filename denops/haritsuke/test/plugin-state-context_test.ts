import { assertEquals, assertThrows, describe, it } from "../deps/test.ts"
import { createMockPluginState } from "./test-helpers.ts"
import {
  getPasteRuntimeState,
  getRounderRuntimeState,
  requirePasteRuntimeState,
} from "../state/plugin-state-context.ts"

describe("plugin-state-context", () => {
  it("returns null when paste runtime dependencies are missing", () => {
    const state = createMockPluginState({
      cache: null,
    })

    assertEquals(getPasteRuntimeState(state), null)
  })

  it("returns the rounder runtime when required services are present", () => {
    const state = createMockPluginState()
    const runtime = getRounderRuntimeState(state)
    if (!runtime) {
      throw new Error("expected runtime")
    }

    assertEquals(runtime.rounderManager, state.rounderManager)
    assertEquals(runtime.vimApi, state.vimApi)
  })

  it("throws when requiring paste runtime before initialization", () => {
    const state = createMockPluginState({
      fileSystemApi: null,
    })

    assertThrows(() => requirePasteRuntimeState(state), Error, "Paste runtime is not initialized")
  })
})
