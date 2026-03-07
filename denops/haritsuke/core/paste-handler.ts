/**
 * Paste processing module
 * Manages paste operation execution and yank history application
 */

import type { Denops } from "../deps/denops.ts"
import type { Rounder } from "./rounder.ts"
import type { DebugLogger } from "../utils/debug-logger.ts"
import type { PasteInfo, YankEntry } from "../types.ts"
import type { VimApi } from "../vim/vim-api.ts"
import { adjustContentIndentSmart, adjustIndent } from "../utils/indent-adjuster.ts"
import { withErrorHandling } from "../utils/error-handling.ts"
import { getPasteRangeFromMarks, saveLastPasteRegion } from "../vim/paste-region.ts"
import { createReplaceSessionService } from "./replace-session.ts"

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
  const replaceSession = createReplaceSessionService(vimApi)

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
              const adjustedLines = adjustIndent(lines, savedBaseIndent)
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

          // Set register content BEFORE undo
          const targetReg = entry.register || '"'
          logger?.log("apply", "Setting register", {
            register: targetReg,
            contentLength: contentToSet.length,
          })
          await vimApi.setreg(targetReg, contentToSet, entry.regtype)

          logger?.log("apply", "Preparing replay", {
            hasReplaceInfo: !!replaceInfo,
            undoFilePath,
          })
          await replaceSession.prepareReplay({
            replaceInfo,
            undoFilePath,
          })

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
          const cmd = replaceSession.buildReplayPasteCommand(
            {
              mode: pasteInfo.mode,
              count: pasteInfo.count,
              register: targetReg,
              visualMode: pasteInfo.visualMode,
              actualPasteCommand: pasteInfo.actualPasteCommand,
            },
            {
              regtype: entry.regtype,
            },
          )
          logger?.log("apply", "Executing paste command", {
            command: cmd,
            originalMode: pasteInfo.mode,
            cycleMode: cmd,
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
            const { start: pasteStartPos, end: pasteEndPos } = await getPasteRangeFromMarks((mark) =>
              vimApi.getpos(mark)
            )
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
