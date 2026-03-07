/**
 * denops dispatcher API functions
 */

import type { Denops } from "../deps/denops.ts"
import type { PluginState } from "../state/plugin-state.ts"
import { handleCursorMoved, handleStopRounder, handleTextYankPost } from "../events/event-handlers.ts"
import { navigateNext, navigatePrev } from "../core/history-navigation.ts"
import { withErrorHandling } from "../utils/error-handling.ts"
import { parseTextYankEvent } from "./args.ts"
import { createPasteActions } from "./paste-actions.ts"
import { createPluginRuntime } from "./plugin-runtime.ts"
import { createReplaceActions } from "./replace-actions.ts"

export const createApi = (denops: Denops, state: PluginState) => {
  const runtime = createPluginRuntime(denops, state)
  const pasteActions = createPasteActions(denops, state, {
    syncIfNeeded: runtime.syncIfNeeded,
    getRounderSession: runtime.getRounderSession,
  })
  const replaceActions = createReplaceActions(denops, state, {
    getRounderSession: runtime.getRounderSession,
  })

  const onTextYankPost = async (args: unknown): Promise<void> => {
    const eventPayload = parseTextYankEvent(args)
    await handleTextYankPost(denops, state, eventPayload)
  }

  const onCursorMoved = async (args: unknown): Promise<void> => {
    await handleCursorMoved(denops, state, args, {
      stopRounder: async (_denops, rounder, reason) => await runtime.stopRounder(rounder, reason),
      clearHighlight: async () => await runtime.clearHighlight(),
    })
  }

  const cyclePrev = async (args: unknown): Promise<void> => {
    await navigatePrev(denops, state, args, {
      syncIfNeeded: async () => await runtime.syncIfNeeded(),
    })
  }

  const cycleNext = async (args: unknown): Promise<void> => {
    await navigateNext(denops, state, args, {
      syncIfNeeded: async () => await runtime.syncIfNeeded(),
    })
  }

  const onStopRounder = async (args: unknown): Promise<void> => {
    await handleStopRounder(denops, state, args, {
      stopRounder: async (_denops, rounder, reason) => await runtime.stopRounder(rounder, reason),
    })
  }

  const isActive = async (_args: unknown): Promise<boolean> => {
    if (!state.rounderManager || !state.vimApi) {
      return false
    }

    return await withErrorHandling(
      async () => {
        const bufnr = await state.vimApi!.bufnr("%")
        const rounder = await state.rounderManager!.getRounder(denops, bufnr)
        return rounder.isActive()
      },
      "api isActive",
      state.logger,
      false,
    )
  }

  const listHistory = (_args: unknown): Array<{ type: "v" | "V" | "b"; content: string }> => {
    if (!state.cache) {
      return []
    }

    return state.cache.getAll().map((entry) => ({
      type: entry.regtype,
      content: entry.content,
    }))
  }

  return {
    initialize: runtime.initialize,
    onTextYankPost,
    onCursorMoved,
    onStopRounder,
    preparePaste: pasteActions.preparePaste,
    onPasteExecuted: pasteActions.onPasteExecuted,
    cyclePrev,
    cycleNext,
    doReplaceOperator: replaceActions.doReplaceOperator,
    isActive,
    listHistory,
    toggleSmartIndent: pasteActions.toggleSmartIndent,
  }
}
