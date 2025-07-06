import type { VimApi } from "../vim/vim-api.ts"
import type { DebugLogger } from "./debug-logger.ts"
import type { PasteInfo } from "../types.ts"

/**
 * Detect the minimum common indent from lines
 */
export function detectMinIndent(lines: string[]): string {
  let minIndent: string | null = null;
  
  for (const line of lines) {
    // Skip empty lines
    if (line.trim() === "") {
      continue;
    }
    
    // Extract leading whitespace
    const match = line.match(/^(\s*)/);
    if (!match) {
      continue;
    }
    
    const indent = match[1];
    if (minIndent === null || indent.length < minIndent.length) {
      minIndent = indent;
    }
  }
  
  return minIndent || "";
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
    return "";
  }
  
  if (useTab) {
    // Use tabs
    return "\t".repeat(indentCount);
  } else {
    // Use spaces
    return " ".repeat(indentCount * shiftWidth);
  }
}

/**
 * Adjust indent of lines based on base indent
 */
export function adjustIndent(lines: string[], baseIndent: string): string[] {
  const minIndent = detectMinIndent(lines);
  
  return lines.map((line) => {
    // Empty lines remain empty
    if (line.trim() === "") {
      return "";
    }
    
    // Remove minimum indent and add base indent
    if (line.startsWith(minIndent)) {
      return baseIndent + line.slice(minIndent.length);
    }
    
    // Fallback: just prepend base indent
    return baseIndent + line;
  });
}

/**
 * Smart indent adjustment for pasted content
 * Handles complex logic for determining appropriate indentation
 */
export async function adjustContentIndentSmart(
  content: string,
  pasteInfo: PasteInfo,
  vimApi: VimApi,
  logger?: DebugLogger | null,
): Promise<string> {
  try {
    logger?.log("indent", "Starting smart indent adjustment", {
      contentLength: content.length,
      mode: pasteInfo.mode,
    })

    // Get the current line for indent reference
    const currentLine = await vimApi.getline(".")
    
    // Detect base indent from current line
    const baseIndentMatch = currentLine.match(/^(\s*)/)
    const baseIndent = baseIndentMatch ? baseIndentMatch[1] : ""
    
    // If no indent on current line and pasting after (p), calculate expected indent
    if (baseIndent === "" && pasteInfo.mode === "p") {
      const nextLineNum = (await vimApi.line(".")) + 1
      const shiftWidth = await vimApi.getwinvar(0, "&shiftwidth") as number
      const expandTab = await vimApi.getwinvar(0, "&expandtab") as number
      
      // Calculate expected indent level using Vim's indent expression
      const indentExpr = await vimApi.getbufvar(0, "&indentexpr") as string
      let indentCount = 0
      
      if (indentExpr) {
        // Use indentexpr if available
        const tempContent = "temp"
        await vimApi.cmd(`silent! normal! o${tempContent}`)
        const indentWidth = await vimApi.eval(`indent(${nextLineNum})`) as number
        await vimApi.cmd("silent! normal! u")
        indentCount = Math.floor(indentWidth / shiftWidth)
      }
      
      const newBaseIndent = getIndentText(indentCount, shiftWidth, expandTab === 0)
      
      // Adjust the content
      const lines = content.split("\n")
      const adjustedLines = adjustIndent(lines, newBaseIndent)
      const adjustedContent = adjustedLines.join("\n")
      
      logger?.log("indent", "Adjusted with calculated indent", {
        originalLength: content.length,
        adjustedLength: adjustedContent.length,
        baseIndent: newBaseIndent,
      })
      
      return adjustedContent
    } else {
      // Adjust based on current line indent
      const lines = content.split("\n")
      const adjustedLines = adjustIndent(lines, baseIndent)
      const adjustedContent = adjustedLines.join("\n")
      
      logger?.log("indent", "Adjusted with current line indent", {
        originalLength: content.length,
        adjustedLength: adjustedContent.length,
        baseIndent,
      })
      
      return adjustedContent
    }
  } catch (error) {
    logger?.error("indent", "Smart indent adjustment failed", error)
    // Return original content on error
    return content
  }
}