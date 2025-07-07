/**
 * Highlight management module
 */

import type { Denops } from "../deps/denops.ts"
import { fn } from "../deps/denops.ts"
import type { DebugLogger } from "../utils/debug-logger.ts"
import { withErrorHandling } from "../utils/error-handling.ts"

export type HighlightConfig = {
  regionHlGroupname?: string
}

export type HighlightManager = {
  apply: (denops: Denops, register: string) => Promise<void>
  clear: (denops: Denops) => Promise<void>
  isActive: () => boolean
}

/**
 * Create highlight management functionality
 */
export const createHighlightManager = (
  config: HighlightConfig,
  logger: DebugLogger | null = null,
): HighlightManager => {
  // Store highlight match IDs per buffer
  const highlightMatchIds = new Map<number, number>()

  return {
    apply: async (denops: Denops, register: string): Promise<void> => {
      await withErrorHandling(
        async () => {
          // Get current buffer number
          const bufnr = await fn.bufnr(denops, "%")

          // Get paste region marks
          const startLine = await fn.line(denops, "'[")
          const startCol = await fn.col(denops, "'[")
          const endLine = await fn.line(denops, "']")
          const endCol = await fn.col(denops, "']")

          // Get register type to determine highlight pattern
          const regtype = await fn.getregtype(denops, register)

          let pattern = ""
          if (regtype[0] === "\x16" || regtype === "b") {
            // Block mode
            pattern = `\\v%>${startLine - 1}l%>${startCol - 1}c.*%<${endLine + 1}l%<${endCol + 1}c`
          } else if (regtype === "v") {
            // Character mode
            const dots = startLine === endLine ? ".*" : "\\_.*"
            pattern = `\\v%${startLine}l%>${startCol - 1}c${dots}%${endLine}l%<${endCol + 1}c`
          } else {
            // Line mode - highlight lines without including newline characters
            if (startLine === endLine) {
              // Single line - match from start to just before newline
              pattern = `\\v%${startLine}l^.*$`
            } else {
              // Multiple lines - each line separately without newline
              const patterns = []
              for (let line = startLine; line <= endLine; line++) {
                patterns.push(`%${line}l^.*$`)
              }
              pattern = `\\v(${patterns.join("|")})`
            }
          }

          // Clear previous highlight for this buffer
          const existingMatchId = highlightMatchIds.get(bufnr)
          if (existingMatchId && existingMatchId > 0) {
            await withErrorHandling(
              async () => {
                await fn.matchdelete(denops, existingMatchId)
              },
              "highlight matchdelete",
              logger,
              undefined, // Continue on error
            )
            highlightMatchIds.delete(bufnr)
          }

          // Apply new highlight
          const matchId = await fn.matchadd(
            denops,
            config.regionHlGroupname || "HaritsukeRegion",
            pattern,
          )
          highlightMatchIds.set(bufnr, matchId)

          logger?.log("highlight", "Highlight applied", {
            bufnr,
            pattern,
            matchId,
          })
        },
        "highlight apply",
        logger,
      )
    },

    clear: async (denops: Denops): Promise<void> => {
      await withErrorHandling(
        async () => {
          const bufnr = await fn.bufnr(denops, "%")
          const matchId = highlightMatchIds.get(bufnr)

          if (matchId && matchId > 0) {
            try {
              await fn.matchdelete(denops, matchId)
              highlightMatchIds.delete(bufnr)
              logger?.log("highlight", "Highlight cleared", { bufnr, matchId })
            } catch (_error) {
              // Ignore error if match doesn't exist
              highlightMatchIds.delete(bufnr)
            }
          }
        },
        "highlight clear",
        logger,
      )
    },

    isActive: (): boolean => {
      // Check if any buffer has active highlights
      return highlightMatchIds.size > 0
    },
  }
}
