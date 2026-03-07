import type { Denops } from "../deps/denops.ts"
import type { YankCache } from "../data/cache.ts"
import type { DebugLogger } from "../utils/debug-logger.ts"
import type { FileSystemApi, VimApi } from "../vim/vim-api.ts"
import { SPECIAL_REGISTERS } from "../constants.ts"
import type { Rounder } from "./rounder.ts"
import type { PreparedPasteInfo, PreparePasteData } from "./paste-preparation.ts"
import { getPasteRangeFromMarks, saveLastPasteRegion } from "../vim/paste-region.ts"

export type RounderSessionCallbacks = {
  clearHighlight: (denops: Denops) => Promise<void>
  applyHighlight: (denops: Denops, register: string) => Promise<void>
}

export type RounderSessionService = {
  startForPaste: (denops: Denops, rounder: Rounder, data: PreparePasteData) => Promise<void>
  completePaste: (denops: Denops, rounder: Rounder, preparedInfo: PreparedPasteInfo) => Promise<void>
  stop: (denops: Denops, rounder: Rounder, reason: string) => Promise<void>
}

export type RounderSessionServiceOptions = {
  cache: YankCache
  vimApi: VimApi
  fileSystemApi: FileSystemApi
  logger: DebugLogger | null
  shouldUseRegionHighlight: () => boolean
  callbacks: RounderSessionCallbacks
}

export const createRounderSessionService = (
  options: RounderSessionServiceOptions,
): RounderSessionService => {
  const { cache, vimApi, fileSystemApi, logger, shouldUseRegionHighlight, callbacks } = options

  return {
    startForPaste: async (denops: Denops, rounder: Rounder, data: PreparePasteData): Promise<void> => {
      if (rounder.isActive()) {
        logger?.log("rounder", "Active rounder exists, stopping it", {
          buffer: await vimApi.bufnr("%"),
        })
        rounder.stop()
        await callbacks.clearHighlight(denops)
      }

      const allEntries = cache.getAll()
      const targetRegister = data.register || SPECIAL_REGISTERS.UNNAMED
      const filteredEntries = targetRegister === SPECIAL_REGISTERS.UNNAMED
        ? allEntries
        : allEntries.filter((entry) => (entry.register ?? SPECIAL_REGISTERS.UNNAMED) === targetRegister)
      const rounderEntries = filteredEntries.length > 0 ? filteredEntries : allEntries

      await rounder.start(rounderEntries, {
        mode: data.mode as "p" | "P" | "gp" | "gP",
        count: data.count,
        register: data.register,
        visualMode: data.vmode === "v",
        actualPasteCommand: data.mode as "p" | "P" | "gp" | "gP",
      })

      rounder.setBeforePasteCursorPos(await vimApi.getpos("."))
    },

    completePaste: async (
      denops: Denops,
      rounder: Rounder,
      preparedInfo: PreparedPasteInfo,
    ): Promise<void> => {
      const cursorPos = await vimApi.getpos(".")
      const changedTick = await vimApi.eval("b:changedtick") as number
      rounder.setCursorPos(cursorPos)
      rounder.setChangedTick(changedTick)

      const { start: pasteStartPos, end: pasteEndPos } = await getPasteRangeFromMarks((mark) => vimApi.getpos(mark))
      rounder.setPasteRange(pasteStartPos, pasteEndPos)

      const currentEntry = rounder.getCurrentEntry()
      await saveLastPasteRegion(
        denops,
        logger,
        {
          start: pasteStartPos,
          end: pasteEndPos,
        },
        currentEntry?.regtype ?? "v",
      )

      const undoTree = await vimApi.undotree() as Record<string, unknown>
      rounder.setUndoSeq(undoTree.seq_cur as number)

      if (shouldUseRegionHighlight()) {
        await callbacks.applyHighlight(denops, preparedInfo.register)
      }

      if (preparedInfo.mode === "gp" || preparedInfo.mode === "gP") {
        await vimApi.cmd("normal! `]")
      }

      rounder.setCursorPos(await vimApi.getpos("."))

      if (preparedInfo.undoFilePath) {
        rounder.setUndoFilePath(preparedInfo.undoFilePath)
      }
    },

    stop: async (denops: Denops, rounder: Rounder, reason: string): Promise<void> => {
      logger?.log("rounder", `Stopping rounder: ${reason}`)

      const undoFilePath = rounder.getUndoFilePath()
      if (undoFilePath) {
        try {
          await fileSystemApi.remove(undoFilePath)
          logger?.log("undo", "Deleted undo file", { undoFilePath })
        } catch (error) {
          if (error instanceof Deno.errors.NotFound) {
            logger?.log("undo", "Undo file already removed", { undoFilePath })
          } else {
            logger?.error("undo", "Failed to delete undo file", error)
          }
        }
      }

      const currentEntry = rounder.getCurrentEntry()
      if (currentEntry?.id) {
        cache.moveToFront(currentEntry.id)
        logger?.log("cache", "Moved selected entry to front", {
          id: currentEntry.id,
        })
      }

      rounder.stop()
      await callbacks.clearHighlight(denops)
    },
  }
}
