import type { Denops } from "../deps/denops.ts"
import { as, assert, is } from "../deps/unknownutil.ts"
import type { PluginState } from "../state/plugin-state.ts"
import { saveUndoFile } from "../core/paste-preparation.ts"
import { createReplaceSessionService } from "../core/replace-session.ts"
import type { RounderSessionService } from "../core/rounder-session.ts"
import { extractFirstArg } from "./args.ts"

export type ReplaceActions = {
  doReplaceOperator: (args: unknown) => Promise<void>
}

export type ReplaceActionHelpers = {
  getRounderSession: () => RounderSessionService | null
}

export const createReplaceActions = (
  denops: Denops,
  state: PluginState,
  helpers: ReplaceActionHelpers,
): ReplaceActions => {
  const doReplaceOperator = async (args: unknown): Promise<void> => {
    if (!state.vimApi) {
      return
    }

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

    let undoFilePath: string | undefined
    if (state.rounderManager && state.cache) {
      undoFilePath = await saveUndoFile(denops, state.logger)
    }

    const replaceSession = createReplaceSessionService(state.vimApi)
    const result = await replaceSession.execute({
      motionWise: motionWise as "char" | "line" | "block",
      register,
      visualMode,
      smartIndent: state.config.smart_indent,
      singleUndo: state.config.operator_replace_single_undo,
    })

    if (state.rounderManager && state.cache) {
      const bufnr = await state.vimApi.bufnr("%")
      const rounder = await state.rounderManager.getRounder(denops, bufnr)
      const rounderSession = helpers.getRounderSession()
      if (!rounderSession) {
        throw new Error("Rounder session service is not available")
      }

      const pasteInfo = {
        mode: result.pasteCommand,
        vmode: visualMode ? "v" : "n",
        count: 1,
        register,
      }

      if (undoFilePath) {
        rounder.setUndoFilePath(undoFilePath)
      }

      rounder.setReplaceInfo({
        isReplace: true,
        singleUndo: state.config.operator_replace_single_undo ?? true,
        motionWise,
        deletedRange: result.deletedRange,
      })

      await rounderSession.startForPaste(denops, rounder, pasteInfo)
      await rounderSession.completePaste(
        denops,
        rounder,
        {
          mode: result.pasteCommand,
          vmode: pasteInfo.vmode,
          count: pasteInfo.count,
          register: pasteInfo.register,
          undoFilePath,
        },
      )

      state.logger?.log("operator", "Rounder initialized after operator-replace")
    }
  }

  return {
    doReplaceOperator,
  }
}
