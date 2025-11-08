/**
 * Paste processing module
 * Manages paste operation execution and yank history application
 */

import type { Denops } from "../deps/denops.ts"
import type { Rounder } from "./rounder.ts"
import type { DebugLogger } from "../utils/debug-logger.ts"
import type { PasteInfo, YankEntry } from "../types.ts"
import type { VimApi } from "../vim/vim-api.ts"
import { adjustContentIndentSmart } from "../utils/indent-adjuster.ts"
import { withErrorHandling } from "../utils/error-handling.ts"
import { saveLastPasteRegion } from "../vim/paste-region.ts"

export type PasteConfig = {
  useRegionHl: boolean
  smartIndent?: boolean
}

export type PasteConfigGetter = () => PasteConfig

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
  getConfig: PasteConfigGetter,
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
      await withErrorHandling(
        async () => {
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

          // Apply smart indent adjustment if enabled and line-wise paste
          let contentToSet = entry.content
          const config = getConfig()

          // Check if rounder has temporary smart indent setting
          const temporarySmartIndent = rounder?.getTemporarySmartIndent?.()
          const shouldApplySmartIndent = temporarySmartIndent !== null ? temporarySmartIndent : config.smartIndent

          if (shouldApplySmartIndent && entry.regtype === "V") {
            // If rounder has a saved base indent, use it directly
            const savedBaseIndent = rounder?.getBaseIndent?.()
            if (savedBaseIndent !== null && savedBaseIndent !== undefined) {
              // Apply saved base indent
              const lines = entry.content.split("\n")
              const adjustedLines = lines.map((line) => {
                if (line.trim() === "") return line
                return savedBaseIndent + line.trimStart()
              })
              contentToSet = adjustedLines.join("\n")
              logger?.log("apply", "Applied saved base indent", {
                baseIndent: savedBaseIndent,
                originalLength: entry.content.length,
                adjustedLength: contentToSet.length,
              })
            } else {
              // Use normal smart indent adjustment
              contentToSet = await adjustContentIndentSmart(
                entry.content,
                pasteInfo,
                vimApi,
                logger,
              )
            }
          }

          // Check if this is a replace operation with single undo enabled
          const replaceInfo = rounder?.getReplaceInfo?.()
          const isReplaceWithSingleUndo = replaceInfo?.isReplace && replaceInfo?.singleUndo

          // Set register content BEFORE undo
          const targetReg = entry.register || '"'
          logger?.log("apply", "Setting register", {
            register: targetReg,
            contentLength: contentToSet.length,
          })
          await vimApi.setreg(targetReg, contentToSet, entry.regtype)

          if (isReplaceWithSingleUndo && replaceInfo?.deletedRange) {
            // For replace operations with single undo, we need special handling
            // The undo will restore both the delete and paste, so we need to delete again
            logger?.log("apply", "Replace operation with single undo detected")

            // Perform undo to restore the original state
            logger?.log("apply", "Executing undo")
            await vimApi.cmd(`silent! undo`)

            // Now delete the range again to prepare for new paste
            const { start, end } = replaceInfo.deletedRange
            // Determine visual command based on motionWise
            let visualCmd = "v" // default to char-wise
            if (replaceInfo.motionWise === "line") {
              visualCmd = "V"
            } else if (replaceInfo.motionWise === "block") {
              visualCmd = "\x16" // Ctrl-V for block-wise
            }

            // For line-wise operations, column position is irrelevant
            const deleteCmd = replaceInfo.motionWise === "line"
              ? `silent! normal! ${start[1]}G${visualCmd}${end[1]}G"_d`
              : `silent! normal! ${start[1]}G${start[2]}|${visualCmd}${end[1]}G${end[2]}|"_d`

            logger?.log("apply", "Re-deleting range for replace", {
              deleteCmd,
              motionWise: replaceInfo.motionWise,
              start,
              end,
            })
            await vimApi.cmd(deleteCmd)
          } else {
            // Normal behavior: just undo the previous paste
            logger?.log("apply", "Executing undo")
            await vimApi.cmd(`silent! undo`)

            // Restore undo file to get back to the state BEFORE initial paste
            // This includes cursor position and all state
            if (undoFilePath) {
              logger?.log("apply", "Restoring undo file", { path: undoFilePath })
              await vimApi.cmd(`silent! rundo ${undoFilePath}`)
            }
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
            const pasteStartPos = [
              pasteStart[0] ?? 0,
              pasteStart[1] ?? 0,
              pasteStart[2] ?? 0,
              pasteStart[3] ?? 0,
            ]
            const pasteEndPos = [
              pasteEnd[0] ?? 0,
              pasteEnd[1] ?? 0,
              pasteEnd[2] ?? 0,
              pasteEnd[3] ?? 0,
            ]
            rounder.setPasteRange(pasteStartPos, pasteEndPos)
            await saveLastPasteRegion(
              denops,
              logger,
              { start: pasteStartPos, end: pasteEndPos },
              entry.regtype,
            )
          }

          logger?.log("apply", "Applied history entry", { id: entry.id })

          // Re-enable event processing
          await vimApi.setGlobalVar("_haritsuke_applying_history", 0)
        },
        "pasteHandler applyHistoryEntry",
        logger,
      ).catch(async (e) => {
        // Ensure flag is cleared even on error
        await vimApi.setGlobalVar("_haritsuke_applying_history", 0)
        throw e
      })
    },
  }
}
