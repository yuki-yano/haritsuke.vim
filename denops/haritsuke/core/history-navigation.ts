/**
 * History navigation module
 * Handles cycling through yank history with Ctrl-p/Ctrl-n
 */

import type { Denops } from "../deps/denops.ts"
import { fn } from "../deps/denops.ts"
import type { PluginState } from "../state/plugin-state.ts"
import { withErrorHandling } from "../utils/error-handling.ts"

export type HistoryNavigationCallbacks = {
  syncIfNeeded: (state: PluginState) => Promise<boolean>
}

/**
 * Navigate to previous entry in yank history
 */
export const navigatePrev = async (
  denops: Denops,
  state: PluginState,
  _args: unknown,
  callbacks: HistoryNavigationCallbacks,
): Promise<void> => {
  state.logger?.log("cycle", "cyclePrev called")

  await withErrorHandling(
    async () => {
      if (!state.rounderManager || !state.cache || !state.pasteHandler) {
        state.logger?.log("cycle", "cyclePrev: not ready", {
          rounderManager: !!state.rounderManager,
          cache: !!state.cache,
          pasteHandler: !!state.pasteHandler,
        })
        return
      }

      // Sync check (reflect changes from other Neovim instances)
      await callbacks.syncIfNeeded(state)

      const bufnr = await fn.bufnr(denops, "%")
      const rounder = await state.rounderManager.getRounder(denops, bufnr)

      if (!rounder.isActive()) {
        state.logger?.log("cycle", "cyclePrev: No active rounder", {
          bufnr,
        })
        return
      }

      state.logger?.log("cycle", "cyclePrev called", {
        isActive: rounder.isActive(),
        bufnr,
      })
      const result = await rounder.previous()

      if (result) {
        state.logger?.log("cycle", "cyclePrev applying entry", {
          entryId: result.entry.id,
          undoSeq: result.undoSeq,
        })

        await state.pasteHandler.applyHistoryEntry(
          denops,
          result.entry,
          result.undoSeq,
          rounder.getPasteInfo()!,
          rounder.getUndoFilePath(),
          rounder,
        )

        // Show position info
        const posInfo = rounder.getPositionInfo()
        if (posInfo) {
          await denops.cmd(`echo "[haritsuke] ${posInfo.currentIndex}/${posInfo.totalCount}"`)
        }
      } else {
        state.logger?.log("cycle", "cyclePrev no result")
      }
    },
    "history navigatePrev",
    state.logger,
  )
}

/**
 * Navigate to next entry in yank history
 */
export const navigateNext = async (
  denops: Denops,
  state: PluginState,
  _args: unknown,
  callbacks: HistoryNavigationCallbacks,
): Promise<void> => {
  state.logger?.log("cycle", "cycleNext called")

  await withErrorHandling(
    async () => {
      if (!state.rounderManager || !state.cache || !state.pasteHandler) {
        state.logger?.log("cycle", "cycleNext: not ready", {
          rounderManager: !!state.rounderManager,
          cache: !!state.cache,
          pasteHandler: !!state.pasteHandler,
        })
        return
      }

      // Sync check (reflect changes from other Neovim instances)
      await callbacks.syncIfNeeded(state)

      const bufnr = await fn.bufnr(denops, "%")
      const rounder = await state.rounderManager.getRounder(denops, bufnr)

      if (!rounder.isActive()) {
        state.logger?.log("cycle", "cycleNext: No active rounder")
        return
      }

      state.logger?.log("cycle", "cycleNext called")
      const result = await rounder.next()
      if (result) {
        state.logger?.log("cycle", "cycleNext applying entry", {
          entryId: result.entry.id,
          undoSeq: result.undoSeq,
        })
        await state.pasteHandler.applyHistoryEntry(
          denops,
          result.entry,
          result.undoSeq,
          rounder.getPasteInfo()!,
          rounder.getUndoFilePath(),
          rounder,
        )

        // Show position info
        const posInfo = rounder.getPositionInfo()
        if (posInfo) {
          await denops.cmd(`echo "[haritsuke] ${posInfo.currentIndex}/${posInfo.totalCount}"`)
        }
      } else {
        state.logger?.log("cycle", "cycleNext no result")
      }
    },
    "history navigateNext",
    state.logger,
  )
}
