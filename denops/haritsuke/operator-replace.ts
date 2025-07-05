/**
 * Operator-replace functionality
 * Provides operator to replace text with register content
 */

import type { Denops } from "./deps/denops.ts"
import type { VimApi } from "./vim-api.ts"

export type ReplaceOperatorOptions = {
  motionWise: "char" | "line" | "block"
  register: string
  visualMode?: boolean // true if called from visual mode
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
      return "V"
    case "block":
      return "\x16" // Ctrl-V
    default:
      return "v"
  }
}

/**
 * Check if deletion moves the cursor
 * Based on vim-operator-replace implementation
 */
const deletionMovesTheCursor = async (
  motionWise: string,
  motionEndPos: number[],
  vimApi: VimApi,
  preDeleteBufferEndLine?: number,
): Promise<boolean> => {
  // Get buffer end position (use pre-delete value if provided)
  const bufferEndLine = preDeleteBufferEndLine ?? await vimApi.line("$")
  const bufferEndCol = await vimApi.eval(`strlen(getline(${bufferEndLine}))`) as number

  const motionEndLine = motionEndPos[1]
  const motionEndCol = motionEndPos[2]

  if (motionWise === "char") {
    // Get last column of the motion end line
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
  _visualMode: boolean,
  endPos: number[],
  vimApi: VimApi,
  preDeleteBufferEndLine?: number,
): Promise<string> => {
  // Use vim-operator-replace logic for both visual and normal modes
  // If deletion moves cursor, use p (paste after)
  // If deletion doesn't move cursor, use P (paste before)
  const movesCursor = await deletionMovesTheCursor(motionWise, endPos, vimApi, preDeleteBufferEndLine)
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

  // Get buffer end line before delete for paste command decision
  const bufferEndLine = await vimApi.line("$")

  // Check for empty region
  if (isEmptyRegion(startPos, endPos)) {
    return "p" // Return default paste command
  }

  // Build visual selection and delete command
  const visualCmd = getVisualCommand(options.motionWise)
  const deleteCmd = `silent! normal! ${startPos[1]}G${startPos[2]}|${visualCmd}${endPos[1]}G${
    endPos[2]
  }|"${SPECIAL_REGISTERS.BLACK_HOLE}d`

  // Split undo: delete operation
  await vimApi.cmd(deleteCmd)

  // Force undo split by resetting undolevels
  // This ensures delete and paste are separate undo blocks
  const undolevels = await vimApi.eval("&undolevels") as number
  await vimApi.cmd(`set undolevels=${undolevels}`)

  // Paste from register as a separate undo block
  // Pass the original buffer end line (before delete) for correct paste command decision
  const pasteCmd = await getPasteCommand(
    options.motionWise,
    options.visualMode ?? false,
    endPos,
    vimApi,
    bufferEndLine,
  )

  await vimApi.cmd(`silent! normal! "${options.register}${pasteCmd}`)

  // Return the actual paste command used
  return pasteCmd
}
