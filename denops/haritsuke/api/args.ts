import { as, assert, is } from "../deps/unknownutil.ts"
import type { HaritsukeConfig } from "../types.ts"
import type { TextYankEventPayload } from "../events/event-handlers.ts"

export const extractFirstArg = (args: unknown): unknown => {
  return Array.isArray(args) ? args[0] : args
}

export const assignConfigFromArgs = (config: HaritsukeConfig, args: unknown): void => {
  const configData = extractFirstArg(args)
  if (!configData || typeof configData !== "object" || Object.keys(configData).length === 0) {
    return
  }

  assert(
    configData,
    is.ObjectOf({
      persist_path: as.Optional(is.String),
      max_entries: as.Optional(is.Number),
      max_data_size: as.Optional(is.Number),
      register_keys: as.Optional(is.String),
      sync_registers: as.Optional(is.Boolean),
      debug: as.Optional(is.Boolean),
      use_region_hl: as.Optional(is.Boolean),
      region_hl_groupname: as.Optional(is.String),
      smart_indent: as.Optional(is.Boolean),
      operator_replace_single_undo: as.Optional(is.Boolean),
    }),
  )

  Object.assign(config, configData)
}

export const parseTextYankEvent = (args: unknown): TextYankEventPayload | null => {
  const eventData = (() => {
    const firstArg = extractFirstArg(args)
    if (Array.isArray(firstArg) && firstArg.length === 1) {
      return firstArg[0]
    }
    return firstArg
  })()
  if (!eventData || typeof eventData !== "object") {
    return null
  }

  const operator = typeof (eventData as { operator?: unknown }).operator === "string"
    ? (eventData as { operator: string }).operator
    : undefined

  const regnameValue = typeof (eventData as { regname?: unknown }).regname === "string"
    ? (eventData as { regname: string }).regname
    : undefined

  const regtype = typeof (eventData as { regtype?: unknown }).regtype === "string"
    ? (eventData as { regtype: string }).regtype
    : undefined

  const regcontentsValue = (eventData as { regcontents?: unknown }).regcontents
  const regcontents = Array.isArray(regcontentsValue) || typeof regcontentsValue === "string"
    ? regcontentsValue
    : undefined

  if (!operator && !regnameValue && !regtype && !regcontents) {
    return null
  }

  const normalizedRegname = regnameValue && regnameValue.length === 1 ? regnameValue : undefined

  return {
    operator,
    regname: normalizedRegname,
    regtype,
    regcontents,
  }
}
