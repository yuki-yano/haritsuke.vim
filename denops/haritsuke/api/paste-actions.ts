import type { Denops } from "../deps/denops.ts"
import { fn } from "../deps/denops.ts"
import { assert, is } from "../deps/unknownutil.ts"
import type { PluginState } from "../state/plugin-state.ts"
import { withErrorHandling } from "../utils/error-handling.ts"
import { adjustContentIndentSmart, resolveSmartIndentBaseIndent } from "../utils/indent-adjuster.ts"
import { generatePasteCommand, type PreparedPasteInfo, saveUndoFile } from "../core/paste-preparation.ts"
import type { RounderSessionService } from "../core/rounder-session.ts"
import { extractFirstArg } from "./args.ts"

export type PasteActions = {
  preparePaste: (args: unknown) => Promise<string>
  onPasteExecuted: (_args: unknown) => Promise<void>
  toggleSmartIndent: (_args: unknown) => Promise<void>
}

export type PasteActionHelpers = {
  syncIfNeeded: () => Promise<boolean>
  getRounderSession: () => RounderSessionService | null
}

export const createPasteActions = (
  denops: Denops,
  state: PluginState,
  helpers: PasteActionHelpers,
): PasteActions => {
  let preparedPasteInfo: PreparedPasteInfo | null = null

  const preparePaste = async (args: unknown): Promise<string> => {
    return await withErrorHandling(
      async () => {
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

        const currentLine = await fn.line(denops, ".")
        const totalLines = await fn.line(denops, "$")
        const lineContent = await fn.getline(denops, ".")
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

        if (!state.rounderManager || !state.cache || !state.pasteHandler || !state.vimApi) {
          return generatePasteCommand(data)
        }

        await helpers.syncIfNeeded()

        if (state.config.smart_indent) {
          await withErrorHandling(
            async () => {
              const regContent = await state.vimApi!.getreg(data.register) as string
              const regType = await state.vimApi!.getregtype(data.register) as string

              if (regType === "V") {
                const adjustedContent = await adjustContentIndentSmart(
                  regContent,
                  {
                    mode: data.mode as "p" | "P" | "gp" | "gP",
                    count: data.count,
                    register: data.register,
                    visualMode: data.vmode === "v",
                  },
                  state.vimApi!,
                  state.logger,
                )

                await state.vimApi!.setreg(data.register, adjustedContent, regType)

                state.logger?.log("paste", "Applied smart indent for initial paste", {
                  originalLength: regContent.length,
                  adjustedLength: adjustedContent.length,
                })
              }
            },
            "api smart indent adjustment",
            state.logger,
          )
        }

        const bufnr = await state.vimApi.bufnr("%")
        const rounder = await state.rounderManager.getRounder(denops, bufnr)
        const rounderSession = helpers.getRounderSession()
        if (!rounderSession) {
          throw new Error("Rounder session service is not available")
        }

        await rounderSession.startForPaste(denops, rounder, data)

        if (state.config.smart_indent) {
          const regType = await state.vimApi.getregtype(data.register) as string
          if (regType === "V") {
            const baseIndent = await resolveSmartIndentBaseIndent(
              {
                mode: data.mode as "p" | "P" | "gp" | "gP",
                count: data.count,
                register: data.register,
                visualMode: data.vmode === "v",
              },
              state.vimApi,
            )
            rounder.setBaseIndent(baseIndent)
            state.logger?.log("paste", "Saved base indent for rounder", { baseIndent })
          }
        }

        const undoFilePath = await saveUndoFile(denops, state.logger)
        if (undoFilePath) {
          rounder.setUndoFilePath(undoFilePath)
        }

        preparedPasteInfo = { ...data, undoFilePath }

        const pasteCmd = generatePasteCommand(data)
        state.logger?.log("paste", "preparePaste returning command", { command: pasteCmd })
        return pasteCmd
      },
      "api preparePaste",
      state.logger,
      'normal! ""1p',
    )
  }

  const onPasteExecuted = async (_args: unknown): Promise<void> => {
    await withErrorHandling(
      async () => {
        state.logger?.log("paste", "onPasteExecuted called")

        if (!state.rounderManager || !preparedPasteInfo || !state.vimApi) {
          return
        }

        const bufnr = await state.vimApi.bufnr("%")
        const rounder = await state.rounderManager.getRounder(denops, bufnr)
        if (!rounder.isActive()) {
          return
        }

        const rounderSession = helpers.getRounderSession()
        if (!rounderSession) {
          throw new Error("Rounder session service is not available")
        }

        await rounderSession.completePaste(denops, rounder, preparedPasteInfo)

        state.logger?.log("paste", "Paste executed", {
          data: preparedPasteInfo,
        })

        preparedPasteInfo = null
      },
      "api onPasteExecuted",
      state.logger,
    )
  }

  const toggleSmartIndent = async (_args: unknown): Promise<void> => {
    if (!state.rounderManager || !state.pasteHandler || !state.vimApi) {
      return
    }

    await withErrorHandling(
      async () => {
        const bufnr = await state.vimApi!.bufnr("%")
        const rounder = await state.rounderManager!.getRounder(denops, bufnr)

        if (!rounder.isActive()) {
          state.logger?.log("toggle", "No active rounder, nothing to toggle")
          return
        }

        const currentTemporarySmartIndent = rounder.getTemporarySmartIndent()
        const currentSmartIndent = currentTemporarySmartIndent !== null
          ? currentTemporarySmartIndent
          : state.config.smart_indent

        const newSmartIndent = !currentSmartIndent
        rounder.setTemporarySmartIndent(newSmartIndent)

        state.logger?.log("toggle", "Toggled smart indent", {
          smart_indent: newSmartIndent,
          isTemporary: true,
        })

        const currentEntry = rounder.getCurrentEntry()
        const pasteInfo = rounder.getPasteInfo()
        const undoSeq = rounder.isFirstCycle() ? 0 : 1
        const undoFilePath = rounder.getUndoFilePath()

        if (!currentEntry || !pasteInfo) {
          state.logger?.error("toggle", "Missing current entry or paste info", new Error("Missing data"))
          return
        }

        await state.pasteHandler!.applyHistoryEntry(
          denops,
          currentEntry,
          undoSeq,
          pasteInfo,
          undoFilePath,
          rounder,
        )

        state.logger?.log("toggle", "Re-applied entry with new indent setting")
      },
      "api toggleSmartIndent",
      state.logger,
    )
  }

  return {
    preparePaste,
    onPasteExecuted,
    toggleSmartIndent,
  }
}
