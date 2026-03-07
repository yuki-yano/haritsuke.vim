/**
 * Event handlers for haritsuke.vim
 * Separated from api.ts to improve maintainability
 */

import type { Denops } from "../deps/denops.ts"
import { fn } from "../deps/denops.ts"
import type { PluginState } from "../state/plugin-state.ts"
import type { Rounder } from "../core/rounder.ts"
import { clearHighlightWhenRounderInactive, getCurrentBufferRounder, skipIfApplyingHistory } from "./event-runtime.ts"

export type TextYankEventPayload = {
  operator?: string
  regname?: string
  regtype?: string
  regcontents?: string | string[]
}

/**
 * Handle TextYankPost event
 * Called when text is yanked in Vim
 */
export const handleTextYankPost = async (
  denops: Denops,
  state: PluginState,
  event: TextYankEventPayload | null,
): Promise<void> => {
  state.logger?.log("yank", "onTextYankPost called", {
    database: !!state.database,
    cache: !!state.cache,
  })

  if (!state.database || !state.cache || !state.registerMonitor) {
    return
  }

  if (state.registerSyncManager) {
    await state.registerSyncManager.captureFromYank(event)
  }

  // Check register changes immediately
  // Pass true to indicate this is from TextYankPost event
  const registerName = typeof event?.regname === "string" && event.regname.length === 1 ? event.regname : null

  await state.registerMonitor.checkChanges(denops, {
    fromTextYankPost: true,
    registerName,
  })
}

export const handleAutoSync = async (
  denops: Denops,
  state: PluginState,
): Promise<void> => {
  if (!state.registerSyncManager) {
    return
  }

  if (
    await skipIfApplyingHistory(denops, state.logger, {
      category: "sync",
      handlerName: "onAutoSync",
    })
  ) {
    return
  }

  await state.syncManager?.syncIfNeeded()
  await state.registerSyncManager.syncIfNeeded()
}

/**
 * Handle CursorMoved event
 * Called when cursor position changes
 */
export const handleCursorMoved = async (
  denops: Denops,
  state: PluginState,
  _args: unknown,
  helpers: {
    stopRounder: (denops: Denops, rounder: Rounder, reason: string) => Promise<void>
    clearHighlight: (denops: Denops) => Promise<void>
  },
): Promise<void> => {
  state.logger?.log("cursor", "onCursorMoved called", {
    database: !!state.database,
    cache: !!state.cache,
  })

  if (!state.database || !state.cache) {
    return
  }

  // Skip processing if we're applying history
  if (
    await skipIfApplyingHistory(denops, state.logger, {
      category: "cursor",
      handlerName: "onCursorMoved",
    })
  ) {
    return
  }

  // Check if rounder is active and cursor has moved or buffer changed
  if (state.rounderManager) {
    const rounder = await getCurrentBufferRounder(denops, state.rounderManager)

    if (rounder.isActive()) {
      const cursorPos = await fn.getpos(denops, ".") as number[]
      const rounderPos = rounder.getCursorPos()
      const currentChangedTick = await denops.eval("b:changedtick") as number
      const rounderChangedTick = rounder.getChangedTick()

      // Check if cursor moved
      const cursorMoved = rounderPos && (
        cursorPos[1] !== rounderPos[1] || // line
        cursorPos[2] !== rounderPos[2] // column
      )

      // Check if buffer changed (other than our paste operations)
      const bufferChanged = currentChangedTick !== rounderChangedTick

      state.logger?.log("rounder", "Rounder status check", {
        cursorMoved,
        bufferChanged,
        currentChangedTick,
        rounderChangedTick,
        cursorPos,
        rounderPos,
      })

      if (cursorMoved || bufferChanged) {
        const reason = cursorMoved && bufferChanged
          ? "cursor moved and buffer changed"
          : cursorMoved
          ? "cursor moved"
          : "buffer changed"
        await helpers.stopRounder(denops, rounder, reason)
      }
    }
  }

  await clearHighlightWhenRounderInactive(denops, state.rounderManager, helpers.clearHighlight)
}

/**
 * Handle StopRounder event
 * Called when rounder should be stopped due to various events
 */
export const handleStopRounder = async (
  denops: Denops,
  state: PluginState,
  _args: unknown,
  helpers: {
    stopRounder: (denops: Denops, rounder: Rounder, reason: string) => Promise<void>
  },
): Promise<void> => {
  state.logger?.log("event", "onStopRounder called")

  if (!state.rounderManager) {
    return
  }

  // Skip processing if we're applying history
  if (
    await skipIfApplyingHistory(denops, state.logger, {
      category: "event",
      handlerName: "onStopRounder",
    })
  ) {
    return
  }

  const rounder = await getCurrentBufferRounder(denops, state.rounderManager)

  if (rounder.isActive()) {
    await helpers.stopRounder(denops, rounder, "event triggered")
  }
}
