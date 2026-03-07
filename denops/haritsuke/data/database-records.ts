import type { RegisterType, YankEntry } from "../types.ts"
import { SPECIAL_REGISTERS } from "../constants.ts"

export type YankHistoryRow = {
  id: number
  content: string
  regtype: string
  blockwidth: number | null
  timestamp: number
  size: number
  source_file: string | null
  source_line: number | null
  source_filetype: string | null
  register: string | null
  created_at?: number
  accessed_at?: number | null
  access_count?: number
}

export const mapYankHistoryRowToEntry = (row: YankHistoryRow): YankEntry => {
  return {
    id: row.id.toString(),
    content: row.content,
    regtype: row.regtype as RegisterType,
    blockwidth: row.blockwidth ?? undefined,
    timestamp: row.timestamp,
    size: row.size,
    sourceFile: row.source_file ?? undefined,
    sourceLine: row.source_line ?? undefined,
    sourceFiletype: row.source_filetype ?? undefined,
    register: row.register ?? SPECIAL_REGISTERS.UNNAMED,
  }
}

export const toInsertParams = (
  entry: Omit<YankEntry, "id" | "size">,
  size: number,
): [
  string,
  RegisterType,
  number | null,
  number,
  number,
  string | null,
  number | null,
  string | null,
  string,
] => {
  return [
    entry.content,
    entry.regtype,
    entry.blockwidth ?? null,
    entry.timestamp,
    size,
    entry.sourceFile ?? null,
    entry.sourceLine ?? null,
    entry.sourceFiletype ?? null,
    entry.register ?? SPECIAL_REGISTERS.UNNAMED,
  ]
}
