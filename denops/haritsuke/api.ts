/**
 * denops dispatcher API functions
 */

import type { Denops } from "./deps/denops.ts"
import { autocmd, fn } from "./deps/denops.ts"
import { as, assert, is } from "./deps/unknownutil.ts"
import { join } from "./deps/std.ts"
import { createYankDatabase } from "./database.ts"
import { createYankCache } from "./cache.ts"
import { createRounderManager } from "./rounder.ts"
import type { Rounder } from "./rounder.ts"
import { createDebugLogger } from "./debug-logger.ts"
import { createHighlightManager } from "./highlight.ts"
import { createSyncManager } from "./sync-manager.ts"
import { createRegisterMonitor } from "./register-monitor.ts"
import { createPasteHandler } from "./paste-handler.ts"
import type { PluginState } from "./plugin-state.ts"
import { createFileSystemApi, createVimApi } from "./vim-api.ts"
import { handleCursorMoved, handleStopRounder, handleTextYankPost } from "./event-handlers.ts"
import { navigateNext, navigatePrev } from "./history-navigation.ts"
import {
  generatePasteCommand,
  initializeRounderForPaste,
  type PreparedPasteInfo,
  processPasteCompletion,
  saveUndoFile,
} from "./paste-preparation.ts"
import { executeReplaceOperator } from "./operator-replace.ts"

// Helper to extract first argument from denops args
const extractFirstArg = (args: unknown): unknown => {
  return Array.isArray(args) ? args[0] : args
}

export const createApi = (denops: Denops, state: PluginState) => {
  const initialize = async (args: unknown): Promise<void> => {
    // Get config from args (passed from Vim script)
    const configData = extractFirstArg(args)
    if (configData && Object.keys(configData).length > 0) {
      assert(
        configData,
        is.ObjectOf({
          persist_path: as.Optional(is.String),
          max_entries: as.Optional(is.Number),
          max_data_size: as.Optional(is.Number),
          register_keys: as.Optional(is.String),
          debug: as.Optional(is.Boolean),
          use_region_hl: as.Optional(is.Boolean),
          region_hl_groupname: as.Optional(is.String),
        }),
      )
      Object.assign(state.config, configData)
    }

    // Initialize if not already done
    if (!state.database) {
      await initializePlugin(denops, state)
    }

    state.logger?.log(
      "init",
      "Plugin initialized/updated with config",
      state.config,
    )
  }

  const onTextYankPost = async (args: unknown): Promise<void> => {
    await handleTextYankPost(denops, state, args)
  }

  const onCursorMoved = async (args: unknown): Promise<void> => {
    await handleCursorMoved(denops, state, args, {
      stopRounderWithCleanup,
      clearHighlight,
    })
  }

  // Store prepared paste info for onPasteExecuted
  let preparedPasteInfo: PreparedPasteInfo | null = null

  const preparePaste = async (args: unknown): Promise<string> => {
    try {
      const data = extractFirstArg(args)

      assert(
        data,
        is.ObjectOf({
          mode: is.String,
          vmode: is.String,
          count: is.Number,
          register: is.String,
        }),
      )

      state.logger?.log("paste", "preparePaste called", data)

      // Debug: check current buffer state
      const currentLine = await fn.line(denops, ".")
      const totalLines = await fn.line(denops, "$")
      const lineContent = await fn.getline(denops, ".")

      // Check if operator-replace might be active
      const visualMarks = {
        start: await fn.getpos(denops, "'["),
        end: await fn.getpos(denops, "']"),
      }

      state.logger?.log("paste", "Buffer state at preparePaste", {
        currentLine,
        totalLines,
        lineContent,
        visualMarks,
      })

      // Only proceed with haritsuke features if initialized
      if (!state.rounderManager || !state.cache || !state.pasteHandler) {
        // Return standard paste command if haritsuke is not ready
        return generatePasteCommand(data)
      }

      // Sync check
      await syncIfNeeded(state)

      // Get the current buffer's rounder
      const bufnr = await fn.bufnr(denops, "%")
      const rounder = await state.rounderManager.getRounder(denops, bufnr)

      // Initialize rounder for paste
      await initializeRounderForPaste(denops, rounder, state, data, {
        clearHighlight,
      })

      // Save undo file BEFORE paste
      const undoFilePath = await saveUndoFile(denops, state.logger)
      if (undoFilePath) {
        rounder.setUndoFilePath(undoFilePath)
      }

      // Store prepared paste info
      preparedPasteInfo = { ...data, undoFilePath }

      // Return paste command to be executed by Vim
      const pasteCmd = generatePasteCommand(data)

      state.logger?.log("paste", "preparePaste returning command", {
        command: pasteCmd,
      })
      return pasteCmd
    } catch (e) {
      state.logger?.error("paste", "preparePaste failed", e)
      throw e
    }
  }

  const onPasteExecuted = async (_args: unknown): Promise<void> => {
    try {
      state.logger?.log("paste", "onPasteExecuted called")

      if (!state.rounderManager || !preparedPasteInfo) {
        return
      }

      const bufnr = await fn.bufnr(denops, "%")
      const rounder = await state.rounderManager.getRounder(denops, bufnr)

      if (!rounder.isActive()) {
        return
      }

      // Process paste completion
      await processPasteCompletion(denops, rounder, preparedPasteInfo, state, {
        applyHighlight,
      })

      state.logger?.log("paste", "Paste executed", {
        data: preparedPasteInfo,
      })

      // Clear prepared paste info
      preparedPasteInfo = null
    } catch (e) {
      state.logger?.error("paste", "onPasteExecuted failed", e)
      throw e
    }
  }

  const cyclePrev = async (args: unknown): Promise<void> => {
    await navigatePrev(denops, state, args, {
      syncIfNeeded,
    })
  }

  const cycleNext = async (args: unknown): Promise<void> => {
    await navigateNext(denops, state, args, {
      syncIfNeeded,
    })
  }

  const onStopRounder = async (args: unknown): Promise<void> => {
    await handleStopRounder(denops, state, args, {
      stopRounderWithCleanup,
    })
  }

  const doReplaceOperator = async (args: unknown): Promise<void> => {
    // Extract the object from denops args wrapper (same as preparePaste)
    const data = extractFirstArg(args)

    assert(
      data,
      is.ObjectOf({
        motionWise: is.String,
        register: is.String,
        visualMode: as.Optional(is.UnionOf([is.Boolean, is.Number])),
      }),
    )

    const { motionWise, register = '"' } = data
    // Convert number to boolean if needed
    const visualMode = data.visualMode ? true : false
    assert(
      motionWise,
      is.UnionOf([
        is.LiteralOf("char"),
        is.LiteralOf("line"),
        is.LiteralOf("block"),
      ]),
    )

    state.logger?.log("operator", "doReplaceOperator called", {
      motionWise,
      register,
      visualMode,
    })

    const actualPasteCmd = await executeReplaceOperator({
      motionWise: motionWise as "char" | "line" | "block",
      register,
      visualMode,
    }, state.vimApi!)

    // Initialize rounder for cycling through history after operator-replace
    if (state.rounderManager && state.cache) {
      const bufnr = await fn.bufnr(denops, "%")
      const rounder = await state.rounderManager.getRounder(denops, bufnr)

      // Pass the actual paste command used in executeReplaceOperator
      const pasteInfo = {
        mode: actualPasteCmd as "p" | "P" | "gp" | "gP",
        vmode: visualMode ? "v" : "n",
        count: 1,
        register,
      }

      // Initialize rounder for history navigation after replace
      await initializeRounderForPaste(
        denops,
        rounder,
        state,
        pasteInfo,
        {
          clearHighlight: async (d, s) => await clearHighlight(d, s),
        },
      )

      // Update changedTick after operator-replace to prevent immediate stop
      const changedTick = await denops.eval("b:changedtick") as number
      rounder.setChangedTick(changedTick)

      // Apply highlight if enabled
      if (state.config.use_region_hl) {
        await applyHighlight(denops, state, register)
      }

      state.logger?.log("operator", "Rounder initialized after operator-replace")
    }
  }

  const isActive = async (_args: unknown): Promise<boolean> => {
    if (!state.rounderManager) {
      return false
    }

    try {
      const bufnr = await fn.bufnr(denops, "%")
      const rounder = await state.rounderManager.getRounder(denops, bufnr)
      return rounder.isActive()
    } catch {
      return false
    }
  }

  const listHistory = (_args: unknown): Array<{ type: "v" | "V" | "b"; content: string }> => {
    if (!state.cache) {
      return []
    }

    const entries = state.cache.getAll()
    return entries.map((entry) => ({
      type: entry.regtype,
      content: entry.content,
    }))
  }

  return {
    initialize,
    onTextYankPost,
    onCursorMoved,
    onStopRounder,
    preparePaste,
    onPasteExecuted,
    cyclePrev,
    cycleNext,
    doReplaceOperator,
    isActive,
    listHistory,
  }
}

async function initializePlugin(
  denops: Denops,
  state: PluginState,
): Promise<void> {
  try {
    // Initialize logger first
    state.logger = createDebugLogger(state.config.debug)

    // Initialize database
    const dataDir = state.config.persist_path || join(
      await denops.eval('stdpath("data")') as string,
      "haritsuke",
    )

    state.database = createYankDatabase(dataDir, state.config.max_entries, state.logger)
    await state.database.init()

    // Initialize cache
    state.cache = createYankCache(state.config.max_entries)
    const recent = state.database.getRecent(state.config.max_entries)
    state.cache.setAll(recent)

    // Initialize managers
    state.highlightManager = createHighlightManager({
      regionHlGroupname: state.config.region_hl_groupname,
    }, state.logger)

    state.syncManager = createSyncManager(state.database, state.cache, {
      maxEntries: state.config.max_entries,
    }, state.logger)
    state.syncManager.updateStatus()

    // Initialize rounder manager
    state.rounderManager = createRounderManager(state.config, state.logger)

    // Create API adapters
    const vimApi = createVimApi(denops)
    const fileSystemApi = createFileSystemApi()

    // Store in state
    state.vimApi = vimApi
    state.fileSystemApi = fileSystemApi

    // Initialize register monitor
    state.registerMonitor = createRegisterMonitor(
      state.database,
      state.cache,
      state.rounderManager,
      state.logger,
      {
        stopCachingVariable: "_haritsuke_stop_caching",
      },
      vimApi,
      fileSystemApi,
      {
        clearHighlight: async (d) => await clearHighlight(d, state),
      },
    )

    // Initialize initial register content
    // Note: Currently, register monitor initializes with empty content.
    // This is fine as it will detect the first change properly.

    // Initialize paste handler

    state.pasteHandler = createPasteHandler(
      state.logger,
      {
        useRegionHl: state.config.use_region_hl ?? false,
      },
      vimApi,
      {
        applyHighlight: async (d, register) => await applyHighlight(d, state, register),
        clearHighlight: async (d) => await clearHighlight(d, state),
      },
    )

    // Set up autocmds
    await setupAutocmds(denops)

    state.logger.log("init", `Initialized with ${state.cache.size} entries`)
  } catch (e) {
    if (state.logger) {
      state.logger.error("init", "Initialization failed", e)
    } else {
      // Logger not yet initialized, can't log
    }
    throw e
  }
}

/**
 * Cache and database synchronization check
 * Detects changes with fast metadata checks and reloads all data only when necessary
 */
async function syncIfNeeded(state: PluginState): Promise<boolean> {
  if (!state.syncManager) {
    return false
  }
  return await state.syncManager.syncIfNeeded()
}

async function setupAutocmds(denops: Denops): Promise<void> {
  // Check features before setting up autocmds
  const isNvim = await fn.has(denops, "nvim")

  await autocmd.group(denops, "Haritsuke", (helper) => {
    helper.define(
      "CursorMoved",
      "*",
      `call haritsuke#notify('onCursorMoved')`,
    )
    helper.define(
      "TextYankPost",
      "*",
      `call haritsuke#notify('onTextYankPost')`,
    )
    // Stop rounder on various events - define basic events that always exist
    helper.define(
      "InsertEnter",
      "*",
      `call haritsuke#notify('onStopRounder')`,
    )
    helper.define(
      "WinLeave",
      "*",
      `call haritsuke#notify('onStopRounder')`,
    )
    helper.define(
      "BufLeave",
      "*",
      `call haritsuke#notify('onStopRounder')`,
    )
    helper.define(
      "CmdlineEnter",
      "*",
      `call haritsuke#notify('onStopRounder')`,
    )

    helper.define(
      "FocusLost",
      "*",
      `call haritsuke#notify('onStopRounder')`,
    )

    // Add TermEnter for Neovim only
    if (isNvim) {
      helper.define(
        "TermEnter",
        "*",
        `call haritsuke#notify('onStopRounder')`,
      )
    }
  })
}

async function applyHighlight(
  denops: Denops,
  state: PluginState,
  register: string,
): Promise<void> {
  if (!state.highlightManager) {
    return
  }
  await state.highlightManager.apply(denops, register)
}

async function clearHighlight(
  denops: Denops,
  state: PluginState,
): Promise<void> {
  if (!state.highlightManager) {
    return
  }
  await state.highlightManager.clear(denops)
}

/**
 * Stop rounder with cleanup
 * Common logic for stopping rounder, deleting undo file, updating cache, and clearing highlight
 */
async function stopRounderWithCleanup(
  denops: Denops,
  state: PluginState,
  rounder: Rounder,
  reason: string,
): Promise<void> {
  state.logger?.log("rounder", `Stopping rounder: ${reason}`)

  // Delete undo file if exists
  const undoFilePath = rounder.getUndoFilePath()
  if (undoFilePath) {
    try {
      await Deno.remove(undoFilePath)
      state.logger?.log("undo", "Deleted undo file", { undoFilePath })
    } catch (e) {
      // File might already be deleted
      state.logger?.error("undo", "Failed to delete undo file", e)
    }
  }

  // Before stopping, get the current entry and move it to the front
  const currentEntry = rounder.getCurrentEntry()
  if (currentEntry && currentEntry.id && state.cache) {
    // Move the entry to the front without creating duplicates
    state.cache.moveToFront(currentEntry.id)
    state.logger?.log("cache", "Moved selected entry to front", {
      id: currentEntry.id,
    })
  }

  rounder.stop()
  // Clear highlight when rounder stops
  await clearHighlight(denops, state)
}
