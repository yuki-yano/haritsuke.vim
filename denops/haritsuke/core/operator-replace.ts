/**
 * Operator-replace functionality
 * Provides operator to replace text with register content
 */

import type { VimApi } from "../vim/vim-api.ts"
import { createReplaceSessionService, deletionMovesTheCursor } from "./replace-session.ts"

export type ReplaceOperatorOptions = {
  motionWise: "char" | "line" | "block"
  register: string
  visualMode?: boolean
  smartIndent?: boolean
  singleUndo?: boolean
}

export { deletionMovesTheCursor }

export const executeReplaceOperator = async (
  options: ReplaceOperatorOptions,
  vimApi: VimApi,
): Promise<string> => {
  const service = createReplaceSessionService(vimApi)
  const result = await service.execute(options)
  return result.pasteCommand
}
