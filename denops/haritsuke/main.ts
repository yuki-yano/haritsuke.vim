import type { Denops } from "./deps/denops.ts"
import { createPluginState } from "./plugin-state.ts"
import { createApi } from "./api.ts"

// Plugin state
const state = createPluginState()

export function main(denops: Denops): void {
  const api = createApi(denops, state)

  denops.dispatcher = {
    initialize: api.initialize,
    onTextYankPost: api.onTextYankPost,
    onCursorMoved: api.onCursorMoved,
    onStopRounder: api.onStopRounder,
    preparePaste: api.preparePaste,
    onPasteExecuted: api.onPasteExecuted,
    cyclePrev: api.cyclePrev,
    cycleNext: api.cycleNext,
    doReplaceOperator: api.doReplaceOperator,
  }
}
