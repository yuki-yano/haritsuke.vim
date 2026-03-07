import type { DebugLogger } from "./debug-logger.ts"

export type BufferDebugReader = {
  line: (expr: string) => Promise<number>
  getpos: (expr: string) => Promise<number[]>
  getline: (lnum: number | string) => Promise<string>
}

export type BufferDebugState = {
  totalLines: number
  currentLine: number
  cursorPos: number[]
  lineContent: string
}

export const getBufferDebugState = async (
  reader: BufferDebugReader,
): Promise<BufferDebugState> => {
  const totalLines = await reader.line("$")
  const currentLine = await reader.line(".")
  const cursorPos = await reader.getpos(".")
  const lineContent = await reader.getline(".")

  return {
    totalLines,
    currentLine,
    cursorPos,
    lineContent,
  }
}

export const logBufferDebugState = async (
  logger: DebugLogger | null,
  category: string,
  message: string,
  reader: BufferDebugReader,
  extraData?: Record<string, unknown>,
): Promise<void> => {
  if (!logger) {
    return
  }

  const bufferState = await getBufferDebugState(reader)
  logger.log(category, message, {
    ...bufferState,
    ...extraData,
  })
}
