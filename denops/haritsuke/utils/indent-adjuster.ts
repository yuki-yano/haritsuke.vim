import type { VimApi } from "../vim/vim-api.ts"
import type { DebugLogger } from "./debug-logger.ts"
import type { PasteInfo } from "../types.ts"
import { withErrorHandling } from "./error-handling.ts"

/**
 * Detect the minimum common indent from lines
 */
export function detectMinIndent(lines: string[]): string {
  let minIndent: string | null = null

  for (const line of lines) {
    // Skip empty lines
    if (line.trim() === "") {
      continue
    }

    // Extract leading whitespace
    const match = line.match(/^(\s*)/)
    const indent = match![1]
    if (minIndent === null || indent.length < minIndent.length) {
      minIndent = indent
    }
  }

  return minIndent || ""
}

/**
 * Generate indent text based on indent count and settings
 */
export function getIndentText(
  indentCount: number,
  shiftWidth: number,
  useTab: boolean,
): string {
  if (indentCount === 0) {
    return ""
  }

  if (useTab) {
    // Use tabs
    return "\t".repeat(indentCount)
  } else {
    // Use spaces
    return " ".repeat(indentCount * shiftWidth)
  }
}

function getIndentTextFromWidth(
  indentWidth: number,
  shiftWidth: number,
  useTab: boolean,
): string {
  if (indentWidth <= 0) {
    return ""
  }

  if (!useTab || shiftWidth <= 0) {
    return " ".repeat(indentWidth)
  }

  const tabCount = Math.floor(indentWidth / shiftWidth)
  const remainingSpaces = indentWidth % shiftWidth
  return "\t".repeat(tabCount) + " ".repeat(remainingSpaces)
}

/**
 * Adjust indent of lines based on base indent
 */
export function adjustIndent(lines: string[], baseIndent: string): string[] {
  const minIndent = detectMinIndent(lines)

  return lines.map((line) => {
    // Empty lines remain empty
    if (line.trim() === "") {
      return ""
    }

    // Remove minimum indent and add base indent
    if (line.startsWith(minIndent)) {
      return baseIndent + line.slice(minIndent.length)
    }

    // Fallback: just prepend base indent
    return baseIndent + line
  })
}

/**
 * Resolve the base indent to use for smart-indented line-wise paste.
 */
export async function resolveSmartIndentBaseIndent(
  pasteInfo: PasteInfo,
  vimApi: VimApi,
): Promise<string> {
  const currentLine = await vimApi.getline(".")
  const baseIndentMatch = currentLine.match(/^(\s*)/)
  const currentBaseIndent = baseIndentMatch ? baseIndentMatch[1] : ""

  if (currentBaseIndent !== "" || (pasteInfo.mode !== "p" && pasteInfo.mode !== "gp")) {
    return currentBaseIndent
  }

  const indentExpr = await vimApi.getbufvar(0, "&indentexpr") as string
  if (!indentExpr) {
    return currentBaseIndent
  }

  const nextLineNum = (await vimApi.line(".")) + 1
  const shiftWidthValue = await vimApi.getwinvar(0, "&shiftwidth") as number
  const shiftWidth = shiftWidthValue > 0 ? shiftWidthValue : Number(await vimApi.eval("shiftwidth()")) || 0
  const expandTab = await vimApi.getwinvar(0, "&expandtab") as number
  const resolvedIndentExpr = indentExpr.replaceAll("v:lnum", String(nextLineNum))
  const indentWidthResult = await vimApi.eval(resolvedIndentExpr)
  const indentWidth = typeof indentWidthResult === "number" ? indentWidthResult : Number(indentWidthResult) || 0

  return getIndentTextFromWidth(indentWidth, shiftWidth, expandTab === 0)
}

/**
 * Smart indent adjustment for pasted content
 * Handles complex logic for determining appropriate indentation
 */
export async function adjustContentIndentSmart(
  content: string,
  pasteInfo: PasteInfo,
  vimApi: VimApi,
  logger: DebugLogger | null = null,
): Promise<string> {
  return await withErrorHandling(
    async () => {
      logger?.log("indent", "Starting smart indent adjustment", {
        contentLength: content.length,
        mode: pasteInfo.mode,
      })

      const baseIndent = await resolveSmartIndentBaseIndent(pasteInfo, vimApi)
      const lines = content.split("\n")
      const adjustedLines = adjustIndent(lines, baseIndent)
      const adjustedContent = adjustedLines.join("\n")

      logger?.log("indent", "Adjusted with resolved indent", {
        originalLength: content.length,
        adjustedLength: adjustedContent.length,
        baseIndent,
      })

      return adjustedContent
    },
    "indent adjustContentIndentSmart",
    logger,
    content, // Return original content on error
  )
}
