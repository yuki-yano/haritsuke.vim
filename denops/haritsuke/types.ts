// Yank history entry type definition
export type YankEntry = {
  id?: string
  content: string
  regtype: RegisterType
  blockwidth?: number
  timestamp: number
  size?: number
  sourceFile?: string
  sourceLine?: number
  sourceFiletype?: string
  register?: string
}

// Register type
export type RegisterType = "v" | "V" | "b" // v: characterwise, V: linewise, b: blockwise

// Plugin configuration
export type HaritsukeConfig = {
  persist_path: string
  max_entries: number
  max_data_size: number
  register_keys: string
  debug: boolean
  use_region_hl?: boolean
  region_hl_groupname?: string
  smart_indent?: boolean
}

// Paste information for rounder
export type PasteInfo = {
  mode: "p" | "P" | "gp" | "gP"
  count: number
  register: string
  visualMode?: boolean // true if paste originated from visual mode
  actualPasteCommand?: "p" | "P" | "gp" | "gP" // The actual paste command used in replace operator
}
