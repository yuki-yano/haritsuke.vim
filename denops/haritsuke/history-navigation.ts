/**
 * History navigation module
 * Handles cycling through yank history with Ctrl-p/Ctrl-n
 */

import type { Denops } from "./deps/denops.ts"
import { fn } from "./deps/denops.ts"
import type { PluginState } from "./plugin-state.ts"

// Debug logging to file
const debugLog = async (message: string, data?: unknown) => {
  try {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${message}${data ? " " + JSON.stringify(data) : ""}\n`
    await Deno.writeTextFile("/tmp/haritsuke.log", logMessage, { append: true })
  } catch (_e) {
    // Ignore errors
  }
}

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
  await debugLog("[history-navigation] cyclePrev called")

  try {
    if (!state.rounderManager || !state.cache || !state.pasteHandler) {
      state.logger?.log("cycle", "cyclePrev: not ready", {
        rounderManager: !!state.rounderManager,
        cache: !!state.cache,
        pasteHandler: !!state.pasteHandler,
      })
      await debugLog("[history-navigation] cyclePrev: not ready", {
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

    await debugLog("[history-navigation] cyclePrev rounder state", {
      bufnr,
      isActive: rounder.isActive(),
      currentEntry: rounder.getCurrentEntry()?.id,
    })

    if (!rounder.isActive()) {
      state.logger?.log("cycle", "cyclePrev: No active rounder", {
        bufnr,
      })
      await debugLog("[history-navigation] cyclePrev: No active rounder")
      return
    }

    state.logger?.log("cycle", "cyclePrev called", {
      isActive: rounder.isActive(),
      bufnr,
    })
    const result = await rounder.previous()

    await debugLog("[history-navigation] cyclePrev result", {
      hasResult: !!result,
      entryId: result?.entry?.id,
      entryContent: result?.entry?.content?.substring(0, 50),
      undoSeq: result?.undoSeq,
    })

    if (result) {
      state.logger?.log("cycle", "cyclePrev applying entry", {
        entryId: result.entry.id,
        undoSeq: result.undoSeq,
      })
      await debugLog("[history-navigation] Applying history entry", {
        entryId: result.entry.id,
        pasteInfo: rounder.getPasteInfo(),
        undoFilePath: rounder.getUndoFilePath(),
      })

      await state.pasteHandler.applyHistoryEntry(
        denops,
        result.entry,
        result.undoSeq,
        rounder.getPasteInfo()!,
        rounder.getUndoFilePath(),
        rounder,
      )

      await debugLog("[history-navigation] Applied history entry")
    } else {
      state.logger?.log("cycle", "cyclePrev no result")
      await debugLog("[history-navigation] cyclePrev no result")
    }
  } catch (e) {
    state.logger?.error("cycle", "cyclePrev failed", e)
    throw e
  }
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
  try {
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
    } else {
      state.logger?.log("cycle", "cycleNext no result")
    }
  } catch (e) {
    state.logger?.error("cycle", "cycleNext failed", e)
    throw e
  }
}
