/**
 * Paste processing module
 * Manages paste operation execution and yank history application
 */

import type { Denops } from "../deps/denops.ts"
import type { Rounder } from "./rounder.ts"
import type { DebugLogger } from "../utils/debug-logger.ts"
import type { PasteInfo, YankEntry } from "../types.ts"
import type { VimApi } from "../vim/vim-api.ts"

export type PasteConfig = {
  useRegionHl: boolean
}

export type PasteHandler = {
  applyHistoryEntry: (
    denops: Denops,
    entry: YankEntry,
    undoSeq: number,
    pasteInfo: PasteInfo,
    undoFilePath?: string | null,
    rounder?: Rounder,
  ) => Promise<void>
}

export type PasteHandlerCallbacks = {
  applyHighlight: (denops: Denops, register: string) => Promise<void>
  clearHighlight: (denops: Denops) => Promise<void>
}

/**
 * Create paste processing functionality with dependency injection
 */
export const createPasteHandler = (
  logger: DebugLogger | null,
  config: PasteConfig,
  vimApi: VimApi,
  callbacks: PasteHandlerCallbacks,
): PasteHandler => {
  return {
    applyHistoryEntry: async (
      denops: Denops,
      entry: YankEntry,
      undoSeq: number,
      pasteInfo: PasteInfo,
      undoFilePath?: string | null,
      rounder?: Rounder,
    ): Promise<void> => {
      try {
        logger?.log("apply", "applyHistoryEntry", {
          entryId: entry.id,
          contentLength: entry.content.length,
          content: entry.content.slice(0, 50),
          regtype: entry.regtype,
          register: entry.register,
          undoSeq,
          pasteInfo,
        })

        // Debug: check buffer state before undo
        if (logger) {
          const beforeUndo = await vimApi.line("$")
          const curLine = await vimApi.line(".")
          const cursorPos = await vimApi.getpos(".")
          const lineContent = await vimApi.getline(".")
          logger.log("apply", "Before undo", {
            totalLines: beforeUndo,
            currentLine: curLine,
            cursorPos: cursorPos,
            lineContent: lineContent,
          })
        }

        // CRITICAL: Must use the provided rounder parameter, not get from manager
        if (!rounder) {
          logger?.error("apply", "No rounder provided to applyHistoryEntry", new Error("Missing rounder"))
          throw new Error("No rounder provided to applyHistoryEntry")
        }
        logger?.log("apply", "activeRounder check", {
          hasRounder: !!rounder,
          isActive: rounder?.isActive(),
        })

        // Disable event processing during history application
        await vimApi.setGlobalVar("_haritsuke_applying_history", 1)

        // Set register content BEFORE undo
        const targetReg = entry.register || '"'
        logger?.log("apply", "Setting register", {
          register: targetReg,
          contentLength: entry.content.length,
        })
        await vimApi.setreg(targetReg, entry.content, entry.regtype)

        // Perform single undo
        logger?.log("apply", "Executing undo")
        await vimApi.cmd(`silent! undo`)

        // Restore undo file to get back to the state BEFORE initial paste
        // This includes cursor position and all state
        if (undoFilePath) {
          logger?.log("apply", "Restoring undo file", { path: undoFilePath })
          await vimApi.cmd(`silent! rundo ${undoFilePath}`)
        }

        // Debug: check buffer state after undo and rundo
        if (logger) {
          const afterUndo = await vimApi.line("$")
          const curLine = await vimApi.line(".")
          const cursorPos = await vimApi.getpos(".")
          const lineContent = await vimApi.getline(".")
          logger.log("apply", "After undo and rundo", {
            totalLines: afterUndo,
            currentLine: curLine,
            cursorPos: cursorPos,
            lineContent: lineContent,
          })
        }

        // Verify register was set correctly
        const verifyContent = await vimApi.getreg(targetReg) as string
        logger?.log("apply", "Register verification", {
          contentLength: verifyContent.length,
        })

        // Use the actual paste command if it was provided (from replace operator)
        // Otherwise fall back to the original logic
        let cycleMode: string
        if (pasteInfo.actualPasteCommand) {
          // Use the exact same command that was used in the original replace operation
          cycleMode = pasteInfo.actualPasteCommand
        } else if (pasteInfo.visualMode) {
          // Visual mode: always convert to uppercase
          cycleMode = pasteInfo.mode === "p" ? "P" : pasteInfo.mode === "gp" ? "gP" : pasteInfo.mode
        } else {
          // Normal mode: based on regtype
          const isLinewise = entry.regtype === "V"
          if (isLinewise) {
            // Line-wise: keep original mode (p/gp)
            cycleMode = pasteInfo.mode
          } else {
            // Char/block-wise: convert to uppercase (P/gP)
            cycleMode = pasteInfo.mode === "p" ? "P" : pasteInfo.mode === "gp" ? "gP" : pasteInfo.mode
          }
        }
        const cmd = `silent! normal! ${pasteInfo.count}"${targetReg}${cycleMode}`
        logger?.log("apply", "Executing paste command", {
          command: cmd,
          originalMode: pasteInfo.mode,
          cycleMode,
          regtype: entry.regtype,
          visualMode: pasteInfo.visualMode,
        })
        await vimApi.cmd(cmd)

        // Debug: check buffer state after paste
        if (logger) {
          const afterPaste = await vimApi.line("$")
          const curLine = await vimApi.line(".")
          const cursorPos = await vimApi.getpos(".")
          const lineContent = await vimApi.getline(".")
          logger.log("apply", "After paste", {
            totalLines: afterPaste,
            currentLine: curLine,
            cursorPos: cursorPos,
            lineContent: lineContent,
          })
        }

        // Apply highlight only if enabled
        if (config.useRegionHl) {
          await callbacks.applyHighlight(denops, targetReg)
        }

        // Update rounder information if rounder was provided
        logger?.log("apply", "Before rounder update check", {
          hasRounder: !!rounder,
          isActive: rounder?.isActive(),
        })
        if (rounder && rounder.isActive()) {
          const finalCursorPos = await vimApi.getpos(".")
          rounder.setCursorPos([
            finalCursorPos[0] ?? 0,
            finalCursorPos[1] ?? 0,
            finalCursorPos[2] ?? 0,
            finalCursorPos[3] ?? 0,
          ])

          const changedTick = await vimApi.eval("b:changedtick") as number
          rounder.setChangedTick(changedTick)

          // Update paste range using '[ and '] marks
          const pasteStart = await vimApi.getpos("'[")
          const pasteEnd = await vimApi.getpos("']")
          rounder.setPasteRange(
            [pasteStart[0] ?? 0, pasteStart[1] ?? 0, pasteStart[2] ?? 0, pasteStart[3] ?? 0],
            [pasteEnd[0] ?? 0, pasteEnd[1] ?? 0, pasteEnd[2] ?? 0, pasteEnd[3] ?? 0],
          )
        }

        logger?.log("apply", "Applied history entry", { id: entry.id })

        // Re-enable event processing
        await vimApi.setGlobalVar("_haritsuke_applying_history", 0)
      } catch (e) {
        logger?.error("apply", "applyHistoryEntry failed", e)
        // Make sure to clear the flag even on error
        await vimApi.setGlobalVar("_haritsuke_applying_history", 0)
        throw e
      }
    },
  }
}
