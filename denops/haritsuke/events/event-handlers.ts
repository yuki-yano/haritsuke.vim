/**
 * Event handlers for haritsuke.vim
 * Separated from api.ts to improve maintainability
 */

import type { Denops } from "../deps/denops.ts"
import { fn } from "../deps/denops.ts"
import type { PluginState } from "../state/plugin-state.ts"
import type { Rounder } from "../core/rounder.ts"

/**
 * Handle TextYankPost event
 * Called when text is yanked in Vim
 */
export const handleTextYankPost = async (
  denops: Denops,
  state: PluginState,
  _args: unknown,
): Promise<void> => {
  state.logger?.log("yank", "onTextYankPost called", {
    database: !!state.database,
    cache: !!state.cache,
  })

  if (!state.database || !state.cache || !state.registerMonitor) {
    return
  }

  // Check register changes immediately
  // Pass true to indicate this is from TextYankPost event
  await state.registerMonitor.checkChanges(denops, true)
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
    stopRounderWithCleanup: (
      denops: Denops,
      state: PluginState,
      rounder: Rounder,
      reason: string,
    ) => Promise<void>
    clearHighlight: (denops: Denops, state: PluginState) => Promise<void>
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
  const applyingHistory = await denops.eval(
    "get(g:, '_haritsuke_applying_history', 0)",
  ) as number
  if (applyingHistory === 1) {
    state.logger?.log("cursor", "Skipping onCursorMoved - applying history")
    return
  }

  // Check if rounder is active and cursor has moved or buffer changed
  if (state.rounderManager) {
    const bufnr = await fn.bufnr(denops, "%")
    const rounder = await state.rounderManager.getRounder(denops, bufnr)

    if (rounder.isActive()) {
      const cursorPos = await fn.getpos(denops, ".")
      const rounderPos = rounder.getCursorPos()
      const currentChangedTick = await denops.eval(
        "b:changedtick",
      ) as number
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
        await helpers.stopRounderWithCleanup(denops, state, rounder, reason)
      }
    }
  }

  // Clear highlight if cursor moved (but not during active rounder session)
  if (state.rounderManager) {
    const bufnr = await fn.bufnr(denops, "%")
    const rounder = await state.rounderManager.getRounder(denops, bufnr)
    if (!rounder.isActive()) {
      await helpers.clearHighlight(denops, state)
    }
  } else {
    await helpers.clearHighlight(denops, state)
  }
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
    stopRounderWithCleanup: (
      denops: Denops,
      state: PluginState,
      rounder: Rounder,
      reason: string,
    ) => Promise<void>
  },
): Promise<void> => {
  state.logger?.log("event", "onStopRounder called")

  if (!state.rounderManager) {
    return
  }

  // Skip processing if we're applying history
  const applyingHistory = await denops.eval(
    "get(g:, '_haritsuke_applying_history', 0)",
  ) as number
  if (applyingHistory === 1) {
    state.logger?.log("event", "Skipping onStopRounder - applying history")
    return
  }

  const bufnr = await fn.bufnr(denops, "%")
  const rounder = await state.rounderManager.getRounder(denops, bufnr)

  if (rounder.isActive()) {
    await helpers.stopRounderWithCleanup(denops, state, rounder, "event triggered")
  }
}
