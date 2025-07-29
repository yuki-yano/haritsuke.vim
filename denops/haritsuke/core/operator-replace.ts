/**
 * Operator-replace functionality
 * Provides operator to replace text with register content
 */

import type { VimApi } from "../vim/vim-api.ts"
import { SPECIAL_REGISTERS, VISUAL_MODE } from "../constants.ts"
import { adjustContentIndentSmart } from "../utils/indent-adjuster.ts"
import type { PasteInfo } from "../types.ts"

export type ReplaceOperatorOptions = {
  motionWise: "char" | "line" | "block"
  register: string
  visualMode?: boolean // true if called from visual mode
  smartIndent?: boolean // true to enable smart indent adjustment
  singleUndo?: boolean // true to combine delete and paste into single undo
}

/**
 * Check if region is empty
 */
const isEmptyRegion = (startPos: number[], endPos: number[]): boolean => {
  // Empty region: when on same line and end column is before start column
  return startPos[1] === endPos[1] && endPos[2] < startPos[2]
}

/**
 * Get visual command based on motion type
 */
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

/**
 * Check if deletion moves the cursor
 * Based on vim-operator-replace implementation
 */
export const deletionMovesTheCursor = async (
  motionWise: string,
  motionEndPos: number[],
  vimApi: VimApi,
  preDeleteBufferEndLine?: number,
  preDeleteBufferEndCol?: number,
): Promise<boolean> => {
  // Get buffer end position (use pre-delete value if provided)
  const bufferEndLine = preDeleteBufferEndLine ?? await vimApi.line("$")
  const bufferEndCol = preDeleteBufferEndCol ?? await vimApi.eval(`strlen(getline(${bufferEndLine}))`) as number

  const motionEndLine = motionEndPos[1]
  const motionEndCol = motionEndPos[2]

  if (motionWise === "char") {
    // Get last column of the motion end line (post-delete state)
    const motionEndLastCol = await vimApi.eval(`strlen(getline(${motionEndLine}))`) as number

    // Cursor moves if:
    // 1. Motion ends at the last column of the line (like d$)
    // 2. Motion ends at or beyond the buffer end
    return (motionEndCol === motionEndLastCol) ||
      (bufferEndLine === motionEndLine && bufferEndCol <= motionEndCol)
  } else if (motionWise === "line") {
    // Cursor moves if deleting up to the last line of buffer
    return bufferEndLine === motionEndLine
  } else {
    // block-wise never moves cursor
    return false
  }
}

/**
 * Determine paste command (p or P) based on context
 */
const getPasteCommand = async (
  motionWise: string,
  endPos: number[],
  vimApi: VimApi,
  preDeleteBufferEndLine?: number,
  preDeleteBufferEndCol?: number,
): Promise<string> => {
  // Use vim-operator-replace logic for both visual and normal modes
  // If deletion moves cursor, use p (paste after)
  // If deletion doesn't move cursor, use P (paste before)
  const movesCursor = await deletionMovesTheCursor(
    motionWise,
    endPos,
    vimApi,
    preDeleteBufferEndLine,
    preDeleteBufferEndCol,
  )
  return movesCursor ? "p" : "P"
}

/**
 * Execute replace operator
 */
export const executeReplaceOperator = async (
  options: ReplaceOperatorOptions,
  vimApi: VimApi,
): Promise<string> => {
  // Get motion boundaries
  // Use visual marks if called from visual mode
  const startMark = options.visualMode ? "'<" : "'["
  const endMark = options.visualMode ? "'>" : "']"
  const startPos = await vimApi.getpos(startMark)
  const endPos = await vimApi.getpos(endMark)

  // Get buffer end position before delete for paste command decision
  const bufferEndLine = await vimApi.line("$")
  const bufferEndCol = await vimApi.eval(`strlen(getline(${bufferEndLine}))`) as number

  // Check for empty region
  if (isEmptyRegion(startPos, endPos)) {
    return "p" // Return default paste command
  }

  // Build visual selection and delete command
  const visualCmd = getVisualCommand(options.motionWise)

  // For line-wise operations, column position is irrelevant
  // Using column position can cause cursor to jump to unexpected positions
  const deleteCmd = options.motionWise === "line"
    ? `silent! normal! ${startPos[1]}G${visualCmd}${endPos[1]}G"${SPECIAL_REGISTERS.BLACK_HOLE}d`
    : `silent! normal! ${startPos[1]}G${startPos[2]}|${visualCmd}${endPos[1]}G${
      endPos[2]
    }|"${SPECIAL_REGISTERS.BLACK_HOLE}d`

  // Execute delete operation
  await vimApi.cmd(deleteCmd)

  if (!options.singleUndo) {
    // Force undo split by resetting undolevels
    // This ensures delete and paste are separate undo blocks
    const undolevels = await vimApi.eval("&undolevels") as number
    await vimApi.cmd(`set undolevels=${undolevels}`)
  } else {
    // Join the next operation with the previous one into a single undo block
    // Note: undojoin fails if no previous change exists or if undo was performed
    try {
      await vimApi.cmd("undojoin")
    } catch (_e) {
      // E790: undojoin is not allowed after undo
      // This is expected if user has performed undo, just continue
    }
  }

  // Paste from register as a separate undo block
  // Pass the original buffer end position (before delete) for correct paste command decision
  const pasteCmd = await getPasteCommand(
    options.motionWise,
    endPos,
    vimApi,
    bufferEndLine,
    bufferEndCol,
  )

  // Check register type to handle mixed-mode operations correctly
  const regtype = String(await vimApi.eval(`getregtype('${options.register}')`))
  const isLineWiseRegister = regtype.startsWith("V") || regtype === "\x16" // V or ^V

  // Apply smart indent adjustment if enabled and line-wise operation
  let actualRegister = options.register
  let originalRegContent: string | undefined
  let originalRegType: string | undefined

  if (options.smartIndent && options.motionWise === "line" && isLineWiseRegister) {
    // Get original register content
    const content = String(await vimApi.eval(`getreg('${options.register}')`))

    // Create PasteInfo for smart indent adjustment
    const pasteInfo: PasteInfo = {
      mode: pasteCmd as "p" | "P" | "gp" | "gP",
      count: 1,
      register: options.register,
    }

    // Adjust content based on current line indentation
    const adjustedContent = await adjustContentIndentSmart(
      content,
      pasteInfo,
      vimApi,
      null, // logger not available here
    )

    // Use temporary register 'z' for adjusted content
    const tempRegister = "z"

    // Save original z register if it exists
    originalRegContent = String(await vimApi.eval(`getreg('${tempRegister}')`))
    originalRegType = String(await vimApi.eval(`getregtype('${tempRegister}')`))

    // Set adjusted content to temporary register
    await vimApi.setreg(tempRegister, adjustedContent, regtype)
    actualRegister = tempRegister
  }

  // When deleting lines but pasting character-wise content,
  // we need special handling to ensure correct placement
  if (options.motionWise === "line" && !isLineWiseRegister) {
    // For character-wise paste after line deletion:
    // - If we deleted the last line(s), cursor is at end of previous line
    // - We need to create a new line and paste there
    if (pasteCmd === "p" && endPos[1] === bufferEndLine) {
      // Add a new line before pasting
      await vimApi.cmd("silent! normal! o")
      await vimApi.cmd(`silent! normal! "${actualRegister}P`)
    } else {
      await vimApi.cmd(`silent! normal! "${actualRegister}${pasteCmd}`)
    }
  } else {
    await vimApi.cmd(`silent! normal! "${actualRegister}${pasteCmd}`)
  }

  // Restore original z register if we used it
  if (actualRegister === "z" && originalRegContent !== undefined) {
    await vimApi.setreg("z", originalRegContent, originalRegType || "v")
  }

  // Return the actual paste command used
  return pasteCmd
}
