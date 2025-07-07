import type { YankEntry } from "../types.ts"
import { DATABASE } from "../constants.ts"
import { as, assert, is } from "../deps/unknownutil.ts"

// Predicate for RegisterType
export const isRegisterType = is.UnionOf([
  is.LiteralOf("v"),
  is.LiteralOf("V"),
  is.LiteralOf("b"),
])

// Predicate for YankEntry
export const isYankEntry = is.ObjectOf({
  id: is.String,
  content: is.String,
  regtype: isRegisterType,
  blockwidth: as.Optional(is.Number),
  timestamp: is.Number,
  size: is.Number,
  sourceFile: as.Optional(is.String),
  sourceLine: as.Optional(is.Number),
  sourceFiletype: as.Optional(is.String),
})

/**
 * Validate YankEntry object
 * @param entry - Object to validate
 * @returns Validated YankEntry
 * @throws Error if validation fails
 */
export function validateYankEntry(entry: unknown): YankEntry {
  assert(entry, isYankEntry)

  // Additional validation
  if (!entry.id) {
    throw new Error("Invalid YankEntry: id must be a non-empty string")
  }

  if (entry.timestamp <= 0) {
    throw new Error("Invalid YankEntry: timestamp must be a positive number")
  }

  if (entry.size < 0) {
    throw new Error("Invalid YankEntry: size must be a non-negative number")
  }

  return entry as YankEntry
}

/**
 * Validate content size
 * @param content - Content string to validate
 * @param maxSize - Maximum allowed size in bytes
 * @returns true if valid, false otherwise
 */
export function validateContentSize(content: string, maxSize: number = DATABASE.MAX_CONTENT_SIZE): boolean {
  const size = new TextEncoder().encode(content).length
  return size <= maxSize
}

/**
 * Calculate content size in bytes
 * @param content - Content string
 * @returns Size in bytes
 */
export function calculateContentSize(content: string): number {
  return new TextEncoder().encode(content).length
}
