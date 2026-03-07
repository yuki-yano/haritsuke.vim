/**
 * Paste preparation module
 * Handles the preparation phase of paste operations
 */

import type { Denops } from "../deps/denops.ts"
import type { PluginState } from "../state/plugin-state.ts"
import type { Rounder } from "./rounder.ts"
import { createRounderSessionService } from "./rounder-session.ts"

export type PreparePasteData = {
  mode: string
  vmode: string
  count: number
  register: string
}

export type PreparedPasteInfo = PreparePasteData & {
  undoFilePath?: string
}

/**
 * Generate paste command based on mode and register
 */
export const generatePasteCommand = (data: PreparePasteData): string => {
  const countPart = data.count > 1 ? String(data.count) : ""
  if (data.vmode === "v" && data.register === '"') {
    return `normal! gv${countPart}${data.mode}`
  } else {
    const prefix = data.vmode === "v" ? "gv" : ""
    return `normal! ${prefix}"${data.register}${countPart}${data.mode}`
  }
}

/**
 * Save undo file if undo tree has entries
 */
export const saveUndoFile = async (
  denops: Denops,
  logger: PluginState["logger"],
): Promise<string | undefined> => {
  const undoTree = await denops.call("undotree") as Record<string, unknown>

  logger?.log("paste", "Undo tree before save", {
    seq_cur: undoTree.seq_cur,
    seq_last: undoTree.seq_last,
    entries: (undoTree.entries as unknown[])?.length,
  })

  if ((undoTree.seq_last as number) !== 0) {
    const tempFile = await Deno.makeTempFile({
      prefix: "haritsuke_undo_",
      suffix: ".txt",
    })
    await denops.cmd(`silent! wundo ${tempFile}`)
    return tempFile
  }
  return undefined
}

/**
 * Initialize rounder for paste operation
 */
export const initializeRounderForPaste = async (
  denops: Denops,
  rounder: Rounder,
  state: PluginState,
  data: PreparePasteData,
  callbacks: {
    clearHighlight: (denops: Denops, state: PluginState) => Promise<void>
  },
): Promise<void> => {
  const service = createRounderSessionService({
    cache: state.cache!,
    vimApi: state.vimApi!,
    fileSystemApi: state.fileSystemApi!,
    logger: state.logger,
    shouldUseRegionHighlight: () => state.config.use_region_hl ?? false,
    callbacks: {
      clearHighlight: async (d) => await callbacks.clearHighlight(d, state),
      applyHighlight: () => Promise.resolve(),
    },
  })
  await service.startForPaste(denops, rounder, data)
}

/**
 * Process paste completion
 */
export const processPasteCompletion = async (
  denops: Denops,
  rounder: Rounder,
  preparedInfo: PreparedPasteInfo,
  state: PluginState,
  callbacks: {
    applyHighlight: (denops: Denops, state: PluginState, register: string) => Promise<void>
  },
): Promise<void> => {
  const service = createRounderSessionService({
    cache: state.cache!,
    vimApi: state.vimApi!,
    fileSystemApi: state.fileSystemApi!,
    logger: state.logger,
    shouldUseRegionHighlight: () => state.config.use_region_hl ?? false,
    callbacks: {
      clearHighlight: () => Promise.resolve(),
      applyHighlight: async (d, register) => await callbacks.applyHighlight(d, state, register),
    },
  })
  await service.completePaste(denops, rounder, preparedInfo)
}
