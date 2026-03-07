import type { PasteInfo, RegisterType } from "../types.ts"
import { SPECIAL_REGISTERS, VISUAL_MODE } from "../constants.ts"
import type { VimApi } from "../vim/vim-api.ts"
import { adjustContentIndentSmart } from "../utils/indent-adjuster.ts"
import type { ReplaceOperatorOptions } from "./operator-replace.ts"

export type ReplaceRange = {
  start: number[]
  end: number[]
}

export type ReplaceInfo = {
  isReplace: boolean
  singleUndo: boolean
  motionWise?: string
  deletedRange?: ReplaceRange
}

export type ReplaceExecutionResult = {
  pasteCommand: "p" | "P"
  deletedRange: ReplaceRange
}

export type ReplaceReplayInput = {
  replaceInfo?: ReplaceInfo | null
  undoFilePath?: string | null
}

export type ReplaceSessionService = {
  execute: (options: ReplaceOperatorOptions) => Promise<ReplaceExecutionResult>
  prepareReplay: (input: ReplaceReplayInput) => Promise<void>
  buildReplayPasteCommand: (
    pasteInfo: Pick<PasteInfo, "mode" | "count" | "register" | "visualMode" | "actualPasteCommand">,
    entry: { regtype: RegisterType },
  ) => string
}

const isEmptyRegion = (startPos: number[], endPos: number[]): boolean => {
  return startPos[1] === endPos[1] && endPos[2] < startPos[2]
}

const getVisualCommand = (motionWise: string): string => {
  switch (motionWise) {
    case "line":
      return VISUAL_MODE.LINE
    case "block":
      return VISUAL_MODE.BLOCK
    default:
      return VISUAL_MODE.CHAR
  }
}

const buildDeleteCommand = (motionWise: string, startPos: number[], endPos: number[]): string => {
  const visualCmd = getVisualCommand(motionWise)
  return motionWise === "line"
    ? `silent! normal! ${startPos[1]}G${visualCmd}${endPos[1]}G"${SPECIAL_REGISTERS.BLACK_HOLE}d`
    : `silent! normal! ${startPos[1]}G${startPos[2]}|${visualCmd}${endPos[1]}G${
      endPos[2]
    }|"${SPECIAL_REGISTERS.BLACK_HOLE}d`
}

const buildReplayDeleteCommand = (motionWise: string, startPos: number[], endPos: number[]): string => {
  const visualCmd = getVisualCommand(motionWise)
  return motionWise === "line"
    ? `silent! normal! ${startPos[1]}G${visualCmd}${endPos[1]}G"_d`
    : `silent! normal! ${startPos[1]}G${startPos[2]}|${visualCmd}${endPos[1]}G${endPos[2]}|"_d`
}

export const deletionMovesTheCursor = async (
  motionWise: string,
  motionEndPos: number[],
  vimApi: VimApi,
  preDeleteBufferEndLine?: number,
  preDeleteBufferEndCol?: number,
): Promise<boolean> => {
  const bufferEndLine = preDeleteBufferEndLine ?? await vimApi.line("$")
  const bufferEndCol = preDeleteBufferEndCol ?? await vimApi.eval(`strlen(getline(${bufferEndLine}))`) as number

  const motionEndLine = motionEndPos[1]
  const motionEndCol = motionEndPos[2]

  if (motionWise === "char") {
    const motionEndLastCol = await vimApi.eval(`strlen(getline(${motionEndLine}))`) as number
    return (motionEndCol === motionEndLastCol) ||
      (bufferEndLine === motionEndLine && bufferEndCol <= motionEndCol)
  }

  if (motionWise === "line") {
    return bufferEndLine === motionEndLine
  }

  return false
}

const getPasteCommand = async (
  motionWise: string,
  endPos: number[],
  vimApi: VimApi,
  preDeleteBufferEndLine?: number,
  preDeleteBufferEndCol?: number,
): Promise<"p" | "P"> => {
  const movesCursor = await deletionMovesTheCursor(
    motionWise,
    endPos,
    vimApi,
    preDeleteBufferEndLine,
    preDeleteBufferEndCol,
  )
  return movesCursor ? "p" : "P"
}

export const createReplaceSessionService = (vimApi: VimApi): ReplaceSessionService => {
  return {
    execute: async (options: ReplaceOperatorOptions): Promise<ReplaceExecutionResult> => {
      const startMark = options.visualMode ? "'<" : "'["
      const endMark = options.visualMode ? "'>" : "']"
      const startPos = await vimApi.getpos(startMark)
      const endPos = await vimApi.getpos(endMark)

      const bufferEndLine = await vimApi.line("$")
      const bufferEndCol = await vimApi.eval(`strlen(getline(${bufferEndLine}))`) as number

      if (isEmptyRegion(startPos, endPos)) {
        return {
          pasteCommand: "p",
          deletedRange: { start: startPos, end: endPos },
        }
      }

      await vimApi.cmd(buildDeleteCommand(options.motionWise, startPos, endPos))

      if (!options.singleUndo) {
        const undolevels = await vimApi.eval("&undolevels") as number
        await vimApi.cmd(`set undolevels=${undolevels}`)
      } else {
        try {
          await vimApi.cmd("undojoin")
        } catch {
          // undojoin can fail after undo; ignore and continue
        }
      }

      const pasteCommand = await getPasteCommand(
        options.motionWise,
        endPos,
        vimApi,
        bufferEndLine,
        bufferEndCol,
      )

      const regtype = String(await vimApi.eval(`getregtype('${options.register}')`))
      const isLineWiseRegister = regtype.startsWith("V") || regtype === "\x16"

      let actualRegister = options.register
      let originalRegContent: string | undefined
      let originalRegType: string | undefined

      if (options.smartIndent && options.motionWise === "line" && isLineWiseRegister) {
        const content = String(await vimApi.eval(`getreg('${options.register}')`))
        const pasteInfo: PasteInfo = {
          mode: pasteCommand,
          count: 1,
          register: options.register,
        }

        const adjustedContent = await adjustContentIndentSmart(
          content,
          pasteInfo,
          vimApi,
          null,
        )

        const tempRegister = "z"
        originalRegContent = String(await vimApi.eval(`getreg('${tempRegister}')`))
        originalRegType = String(await vimApi.eval(`getregtype('${tempRegister}')`))

        await vimApi.setreg(tempRegister, adjustedContent, regtype)
        actualRegister = tempRegister
      }

      if (options.motionWise === "line" && !isLineWiseRegister) {
        if (pasteCommand === "p" && endPos[1] === bufferEndLine) {
          await vimApi.cmd("silent! normal! o")
          await vimApi.cmd(`silent! normal! "${actualRegister}P`)
        } else {
          await vimApi.cmd(`silent! normal! "${actualRegister}${pasteCommand}`)
        }
      } else {
        await vimApi.cmd(`silent! normal! "${actualRegister}${pasteCommand}`)
      }

      if (actualRegister === "z" && originalRegContent !== undefined) {
        await vimApi.setreg("z", originalRegContent, originalRegType || "v")
      }

      return {
        pasteCommand,
        deletedRange: { start: startPos, end: endPos },
      }
    },

    prepareReplay: async ({ replaceInfo, undoFilePath }: ReplaceReplayInput): Promise<void> => {
      const isReplaceWithSingleUndo = replaceInfo?.isReplace && replaceInfo.singleUndo && replaceInfo.deletedRange

      await vimApi.cmd("silent! undo")

      if (isReplaceWithSingleUndo) {
        const deletedRange = replaceInfo.deletedRange!
        await vimApi.cmd(
          buildReplayDeleteCommand(
            replaceInfo.motionWise ?? "char",
            deletedRange.start,
            deletedRange.end,
          ),
        )
        return
      }

      if (undoFilePath) {
        await vimApi.cmd(`silent! rundo ${undoFilePath}`)
      }
    },

    buildReplayPasteCommand: (pasteInfo, entry): string => {
      let cycleMode: string
      if (pasteInfo.actualPasteCommand) {
        cycleMode = pasteInfo.actualPasteCommand
      } else if (pasteInfo.visualMode) {
        cycleMode = pasteInfo.mode === "p" ? "P" : pasteInfo.mode === "gp" ? "gP" : pasteInfo.mode
      } else if (entry.regtype === "V") {
        cycleMode = pasteInfo.mode
      } else {
        cycleMode = pasteInfo.mode === "p" ? "P" : pasteInfo.mode === "gp" ? "gP" : pasteInfo.mode
      }

      const targetRegister = pasteInfo.register || SPECIAL_REGISTERS.UNNAMED
      return `silent! normal! ${pasteInfo.count}"${targetRegister}${cycleMode}`
    },
  }
}
