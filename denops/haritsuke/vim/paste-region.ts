import type { Denops } from "../deps/denops.ts"
import { fn } from "../deps/denops.ts"
import type { RegisterType } from "../types.ts"
import type { DebugLogger } from "../utils/debug-logger.ts"
import { withErrorHandling } from "../utils/error-handling.ts"

export type PasteRegion = {
  start: number[]
  end: number[]
  regtype: RegisterType
}

const isValidPosition = (pos: number[] | undefined): boolean => {
  return Array.isArray(pos) && (pos[1] ?? 0) > 0
}

const normalizePosition = (pos: number[] | undefined): number[] => {
  return [
    pos?.[0] ?? 0,
    pos?.[1] ?? 0,
    pos?.[2] ?? 0,
    pos?.[3] ?? 0,
  ]
}

export type PasteRange = {
  start: number[]
  end: number[]
}

export const getPasteRangeFromMarks = async (
  getpos: (mark: string) => Promise<unknown>,
): Promise<PasteRange> => {
  const pasteStart = normalizePosition(await getpos("'[") as number[])
  const pasteEnd = normalizePosition(await getpos("']") as number[])
  return {
    start: pasteStart,
    end: pasteEnd,
  }
}

export const saveLastPasteRegion = async (
  denops: Denops,
  logger: DebugLogger | null,
  range: { start: number[]; end: number[] },
  regtype: RegisterType | null,
): Promise<void> => {
  if (!isValidPosition(range.start) || !isValidPosition(range.end)) {
    return
  }

  await withErrorHandling(
    async () => {
      const bufnr = await fn.bufnr(denops, "%")
      await denops.call("setbufvar", bufnr, "haritsuke_last_paste", {
        start: range.start,
        end: range.end,
        regtype: (regtype ?? "v") as RegisterType,
      })
    },
    "save last paste region",
    logger,
  )
}
