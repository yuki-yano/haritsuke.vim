import type { Denops } from "../deps/denops.ts"
import { fn } from "../deps/denops.ts"
import type { Rounder, RounderManager } from "../core/rounder.ts"
import type { DebugLogger } from "../utils/debug-logger.ts"

export const APPLYING_HISTORY_EXPR = "get(g:, '_haritsuke_applying_history', 0)"

export const skipIfApplyingHistory = async (
  denops: Denops,
  logger: DebugLogger | null,
  options: {
    category: string
    handlerName: string
  },
): Promise<boolean> => {
  const applyingHistory = await denops.eval(APPLYING_HISTORY_EXPR) as number
  if (applyingHistory !== 1) {
    return false
  }

  logger?.log(options.category, `Skipping ${options.handlerName} - applying history`)
  return true
}

export const getCurrentBufferRounder = async (
  denops: Denops,
  rounderManager: RounderManager,
): Promise<Rounder> => {
  const bufnr = await fn.bufnr(denops, "%")
  return await rounderManager.getRounder(denops, bufnr)
}

export const clearHighlightWhenRounderInactive = async (
  denops: Denops,
  rounderManager: RounderManager | null,
  clearHighlight: (denops: Denops) => Promise<void>,
): Promise<void> => {
  if (!rounderManager) {
    await clearHighlight(denops)
    return
  }

  const rounder = await getCurrentBufferRounder(denops, rounderManager)
  if (!rounder.isActive()) {
    await clearHighlight(denops)
  }
}
