/**
 * Paste preparation module
 * Handles the preparation phase of paste operations
 */

import type { Denops } from "../deps/denops.ts"
import { fn } from "../deps/denops.ts"
import type { PluginState } from "../state/plugin-state.ts"
import type { Rounder } from "./rounder.ts"

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
  if (data.vmode === "v" && data.register === '"') {
    return `normal! gv${data.mode}`
  } else {
    const prefix = data.vmode === "v" ? "gv" : ""
    return `normal! ${prefix}"${data.register}${data.count}${data.mode}`
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
  // Clear any active rounder if needed
  if (rounder.isActive()) {
    state.logger?.log("rounder", "Active rounder exists, stopping it", {
      buffer: await fn.bufnr(denops, "%"),
    })
    rounder.stop()
    await callbacks.clearHighlight(denops, state)
  }

  // Initialize rounder with entries
  const entries = state.cache!.getAll()
  await rounder.start(entries, {
    mode: data.mode as "p" | "P" | "gp" | "gP",
    count: data.count,
    register: data.register,
    visualMode: data.vmode === "v",
    actualPasteCommand: data.mode as "p" | "P" | "gp" | "gP", // For replace operator, this is the actual command used
  })

  // Save cursor position before paste
  const beforePasteCursorPos = await fn.getpos(denops, ".")
  rounder.setBeforePasteCursorPos([
    beforePasteCursorPos[0] ?? 0,
    beforePasteCursorPos[1] ?? 0,
    beforePasteCursorPos[2] ?? 0,
    beforePasteCursorPos[3] ?? 0,
  ])
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
  // Store cursor position and changed tick AFTER paste
  const cursorPos = await fn.getpos(denops, ".")
  const changedTick = await denops.eval("b:changedtick") as number
  rounder.setCursorPos([
    cursorPos[0] ?? 0,
    cursorPos[1] ?? 0,
    cursorPos[2] ?? 0,
    cursorPos[3] ?? 0,
  ])
  rounder.setChangedTick(changedTick)

  // Store paste range using '[ and '] marks
  const pasteStart = await fn.getpos(denops, "'[")
  const pasteEnd = await fn.getpos(denops, "']")
  rounder.setPasteRange(
    [
      pasteStart[0] ?? 0,
      pasteStart[1] ?? 0,
      pasteStart[2] ?? 0,
      pasteStart[3] ?? 0,
    ],
    [
      pasteEnd[0] ?? 0,
      pasteEnd[1] ?? 0,
      pasteEnd[2] ?? 0,
      pasteEnd[3] ?? 0,
    ],
  )

  // Save undo sequence AFTER paste
  const undoTree = await denops.call("undotree") as Record<string, unknown>
  const undoSeq = undoTree.seq_cur as number
  rounder.setUndoSeq(undoSeq)

  // Apply highlight if enabled
  if (state.config.use_region_hl) {
    await callbacks.applyHighlight(denops, state, preparedInfo.register)
  }

  // For gp/gP, move cursor to end of pasted text
  if (preparedInfo.mode === "gp" || preparedInfo.mode === "gP") {
    await denops.cmd("normal! `]")
  }

  // Update cursor position after paste
  const finalCursorPos = await fn.getpos(denops, ".")
  rounder.setCursorPos([
    finalCursorPos[0] ?? 0,
    finalCursorPos[1] ?? 0,
    finalCursorPos[2] ?? 0,
    finalCursorPos[3] ?? 0,
  ])

  // Save undo file path in rounder
  if (preparedInfo.undoFilePath) {
    rounder.setUndoFilePath(preparedInfo.undoFilePath)
  }
}
