import type { Denops } from "../deps/denops.ts"
import type { HaritsukeConfig, PasteInfo, YankEntry } from "../types.ts"
import type { DebugLogger } from "../utils/debug-logger.ts"

/**
 * Result of rounder navigation
 */
export type RounderResult = {
  entry: YankEntry
  undoSeq: number
}

/**
 * Simple rounder for cycling through yank history
 */
export type Rounder = {
  start: (entries: YankEntry[], pasteInfo: PasteInfo) => Promise<void>
  next: () => Promise<RounderResult | null>
  previous: () => Promise<RounderResult | null>
  stop: () => void
  isActive: () => boolean
  getPasteInfo: () => PasteInfo | null
  setUndoSeq: (seq: number) => void
  setUndoFilePath: (path: string | null) => void
  getUndoFilePath: () => string | null
  setCursorPos: (pos: number[]) => void
  getCursorPos: () => number[] | null
  setChangedTick: (tick: number) => void
  getChangedTick: () => number
  getCurrentEntry: () => YankEntry | null
  setPasteRange: (startPos: number[], endPos: number[]) => void
  getPasteRange: () => { start: number[]; end: number[] } | null
  setBeforePasteCursorPos: (pos: number[]) => void
  getBeforePasteCursorPos: () => number[] | null
  isFirstCycle: () => boolean
  setTemporarySmartIndent: (value: boolean | null) => void
  getTemporarySmartIndent: () => boolean | null
  setBaseIndent: (indent: string) => void
  getBaseIndent: () => string | null
  // Replace operation tracking
  setReplaceInfo: (
    info: {
      isReplace: boolean
      singleUndo: boolean
      motionWise?: string
      deletedRange?: { start: number[]; end: number[] }
    },
  ) => void
  getReplaceInfo: () => {
    isReplace: boolean
    singleUndo: boolean
    motionWise?: string
    deletedRange?: { start: number[]; end: number[] }
  } | null
}

export const createRounder = (logger: DebugLogger | null): Rounder => {
  const instanceId = Math.random().toString(36).substring(7)
  logger?.log("rounder", "Creating new rounder instance", { instanceId })

  let active = false
  let entries: YankEntry[] = []
  let currentIndex = -1
  let pasteInfo: PasteInfo | null = null
  let undoSeq = 0
  let isFirstCycle = true
  let undoFilePath: string | null = null
  let cursorPos: number[] | null = null
  let changedTick = 0
  let pasteRange: { start: number[]; end: number[] } | null = null
  let beforePasteCursorPos: number[] | null = null
  let temporarySmartIndent: boolean | null = null
  let baseIndent: string | null = null
  let replaceInfo: {
    isReplace: boolean
    singleUndo: boolean
    motionWise?: string
    deletedRange?: { start: number[]; end: number[] }
  } | null = null

  return {
    start: (newEntries: YankEntry[], info: PasteInfo) => {
      active = true
      entries = newEntries
      currentIndex = 0 // Always start at the most recent entry (index 0)
      pasteInfo = info
      isFirstCycle = true

      logger?.log("rounder", "Started", {
        entriesCount: entries.length,
        currentIndex,
      })
      return Promise.resolve()
    },

    next: () => {
      if (!active || entries.length === 0) {
        logger?.log("rounder", "next: not active or no entries")
        return Promise.resolve(null)
      }

      // next moves to newer entries (decreasing index)
      if (isFirstCycle) {
        // On first cycle, can't go newer than current
        logger?.log("rounder", "next: already at newest entry")
        return Promise.resolve(null)
      }

      // Check if already at the newest (index 0)
      if (currentIndex === 0) {
        logger?.log("rounder", "next: already at newest entry, can't go newer")
        return Promise.resolve(null)
      }

      currentIndex--

      const entry = entries[currentIndex]
      logger?.log("rounder", "next", {
        index: currentIndex,
        entryFound: !!entry,
        id: entry?.id,
        content: entry?.content.trim().slice(0, 50).replace(/\n/g, "\\n"),
        length: entry?.content.length,
      })

      // Validate entry
      if (!entry || !entry.content) {
        logger?.error("rounder", `Invalid entry at index ${currentIndex}`, new Error("Entry missing required fields"))
        return Promise.resolve(null)
      }

      // Update first cycle flag
      if (isFirstCycle) {
        isFirstCycle = false
      }

      return Promise.resolve({ entry, undoSeq })
    },

    previous: () => {
      if (!active || entries.length === 0) {
        logger?.log("rounder", "previous: not active or no entries", {
          active,
          entriesLength: entries.length,
        })
        return Promise.resolve(null)
      }

      // previous moves to older entries (increasing index)
      if (isFirstCycle) {
        // On first cycle, we've already pasted the current entry,
        // so we need to skip it and move to the next older entry
        isFirstCycle = false

        // Check if we can go to the next older entry
        if (currentIndex >= entries.length - 1) {
          logger?.log("rounder", "previous: only one entry, can't cycle")
          return Promise.resolve(null)
        }

        // Move to the next older entry
        currentIndex++
      } else {
        // Check if already at the oldest
        if (currentIndex >= entries.length - 1) {
          logger?.log("rounder", "previous: already at oldest entry, can't go older")
          return Promise.resolve(null)
        }
        currentIndex++
      }

      const entry = entries[currentIndex]
      logger?.log("rounder", "previous", {
        index: currentIndex,
        entryFound: !!entry,
        id: entry?.id,
        content: entry?.content.trim().slice(0, 50).replace(/\n/g, "\\n"),
        length: entry?.content.length,
      })

      // Validate entry
      if (!entry || !entry.content) {
        logger?.error("rounder", `Invalid entry at index ${currentIndex}`, new Error("Entry missing required fields"))
        return Promise.resolve(null)
      }

      return Promise.resolve({ entry, undoSeq })
    },

    stop: () => {
      active = false
      entries = []
      currentIndex = -1
      pasteInfo = null
      isFirstCycle = true
      undoFilePath = null
      cursorPos = null
      changedTick = 0
      pasteRange = null
      beforePasteCursorPos = null
      temporarySmartIndent = null
      baseIndent = null
      replaceInfo = null
      logger?.log("rounder", "Stopped")
    },

    isActive: () => {
      logger?.log("rounder", "isActive check", {
        instanceId,
        active,
        entriesLength: entries.length,
      })
      return active
    },

    getPasteInfo: () => pasteInfo,

    setUndoSeq: (seq: number) => {
      undoSeq = seq
    },

    setUndoFilePath: (path: string | null) => {
      undoFilePath = path
    },

    getUndoFilePath: () => undoFilePath,

    setCursorPos: (pos: number[]) => {
      cursorPos = pos
    },

    getCursorPos: () => cursorPos,

    setChangedTick: (tick: number) => {
      changedTick = tick
    },

    getChangedTick: () => changedTick,

    getCurrentEntry: () => {
      if (!active || currentIndex < 0 || currentIndex >= entries.length) {
        return null
      }
      return entries[currentIndex]
    },

    setPasteRange: (startPos: number[], endPos: number[]) => {
      pasteRange = { start: startPos, end: endPos }
      logger?.log("rounder", "Paste range set", { start: startPos, end: endPos })
    },

    getPasteRange: () => pasteRange,

    setBeforePasteCursorPos: (pos: number[]) => {
      beforePasteCursorPos = pos
      logger?.log("rounder", "Before paste cursor position set", { pos })
    },

    getBeforePasteCursorPos: () => beforePasteCursorPos,

    isFirstCycle: () => isFirstCycle,

    setTemporarySmartIndent: (value: boolean | null) => {
      temporarySmartIndent = value
    },

    getTemporarySmartIndent: () => temporarySmartIndent,

    setBaseIndent: (indent: string) => {
      baseIndent = indent
    },

    getBaseIndent: () => baseIndent,

    setReplaceInfo: (
      info: {
        isReplace: boolean
        singleUndo: boolean
        motionWise?: string
        deletedRange?: { start: number[]; end: number[] }
      },
    ) => {
      replaceInfo = info
      logger?.log("rounder", "Replace info set", { info })
    },

    getReplaceInfo: () => replaceInfo,
  }
}

/**
 * Manages rounders for different buffers
 */
export type RounderManager = {
  getRounder: (denops: Denops, bufnr: number) => Promise<Rounder>
  deleteRounder: (bufnr: number) => void
  clear: () => void
}

export const createRounderManager = (_config: HaritsukeConfig, logger: DebugLogger | null = null): RounderManager => {
  const rounders = new Map<number, Rounder>()

  return {
    getRounder: (_denops: Denops, bufnr: number) => {
      let rounder = rounders.get(bufnr)
      if (!rounder) {
        rounder = createRounder(logger)
        rounders.set(bufnr, rounder)
      }
      return Promise.resolve(rounder)
    },

    deleteRounder: (bufnr: number) => {
      const rounder = rounders.get(bufnr)
      if (rounder) {
        rounder.stop()
        rounders.delete(bufnr)
      }
    },

    clear: () => {
      for (const rounder of rounders.values()) {
        rounder.stop()
      }
      rounders.clear()
    },
  }
}
